import type {
	AssessmentCategory,
	AssessmentCompletion,
	AssessmentRating,
	FindingSeverity,
	Observation,
	ProbeResult,
	VariantAssessment,
} from "./types.js";

type ScoreDomain =
	| "capture"
	| "core"
	| "usage"
	| "hierarchy"
	| "tools"
	| "context"
	| "data_controls"
	| "conventions";

const severityQuality: Record<FindingSeverity, number> = {
	critical: 20,
	major: 50,
	minor: 80,
	info: 95,
};

const severityCeiling: Record<FindingSeverity, number> = {
	critical: 59,
	major: 75,
	minor: 90,
	info: 95,
};

const severityRank: Record<FindingSeverity, number> = {
	info: 0,
	minor: 1,
	major: 2,
	critical: 3,
};

const domainWeights: Record<AssessmentCategory, Record<ScoreDomain, number>> = {
	llm: {
		capture: 20,
		core: 30,
		usage: 15,
		hierarchy: 0,
		tools: 0,
		context: 15,
		data_controls: 10,
		conventions: 10,
	},
	agents: {
		capture: 15,
		core: 20,
		usage: 10,
		hierarchy: 15,
		tools: 20,
		context: 10,
		data_controls: 5,
		conventions: 5,
	},
};

interface ScoreVariantInput
	extends Pick<
		VariantAssessment,
		"id" | "completion" | "observations" | "findings" | "probes"
	> {
	category?: AssessmentCategory;
}

function worseSeverity(
	left: FindingSeverity | undefined,
	right: FindingSeverity,
): FindingSeverity {
	return !left || severityRank[right] > severityRank[left] ? right : left;
}

function domainForCapability(capability: string): ScoreDomain {
	if (capability === "spans.description") return "core";
	if (capability.startsWith("spans.")) return "capture";
	if (
		capability.startsWith("model.") ||
		capability.startsWith("messages.") ||
		capability === "operations"
	) {
		return "core";
	}
	if (capability.startsWith("tokens.")) return "usage";
	if (capability.startsWith("agent.")) return "hierarchy";
	if (capability.startsWith("tools.")) return "tools";
	if (capability === "provider.error" || capability === "conversation.id") {
		return "context";
	}
	if (capability === "input.trimming") return "data_controls";
	if (capability.startsWith("conventions.")) return "conventions";
	return "core";
}

function categoryFor(assessment: ScoreVariantInput): AssessmentCategory {
	if (assessment.category) return assessment.category;
	if (
		assessment.id.includes("/agents/") ||
		assessment.observations.some(
			(observation) =>
				observation.capability.startsWith("agent.") ||
				observation.capability.startsWith("tools."),
		)
	) {
		return "agents";
	}
	return "llm";
}

function activeDomains(
	assessment: ScoreVariantInput,
	category: AssessmentCategory,
): Set<ScoreDomain> {
	const domains = new Set<ScoreDomain>(["capture", "core", "conventions"]);
	const probeIds = assessment.probes.map((probe) => probe.probeId);

	if (
		probeIds.length === 0 ||
		probeIds.some((probeId) => !probeId.endsWith("provider_error"))
	) {
		domains.add("usage");
	}
	if (category === "agents") domains.add("hierarchy");
	if (
		probeIds.some(
			(probeId) =>
				probeId.endsWith("tools_success") || probeId.endsWith("tool_error"),
		)
	) {
		domains.add("tools");
	}
	if (
		probeIds.some(
			(probeId) =>
				probeId.endsWith("conversation") || probeId.endsWith("provider_error"),
		)
	) {
		domains.add("context");
	}
	if (probeIds.some((probeId) => probeId.endsWith("long_input"))) {
		domains.add("data_controls");
	}

	for (const observation of assessment.observations) {
		domains.add(domainForCapability(observation.capability));
	}
	for (const finding of assessment.findings) {
		domains.add(domainForCapability(finding.capability));
	}
	return domains;
}

function unlinkedObservationSeverity(
	observation: Observation,
): FindingSeverity | undefined {
	if (observation.state === "legacy") return "minor";
	if (observation.state === "missing" || observation.state === "malformed") {
		return "major";
	}
	return undefined;
}

function severitiesByDomain(
	assessment: ScoreVariantInput,
): Map<ScoreDomain, FindingSeverity> {
	const result = new Map<ScoreDomain, FindingSeverity>();
	const linkedObservations = new Set<string>();

	for (const finding of assessment.findings) {
		const domain = domainForCapability(finding.capability);
		result.set(domain, worseSeverity(result.get(domain), finding.severity));
		for (const occurrence of finding.occurrences) {
			if (occurrence.variantId !== assessment.id) continue;
			for (const observationId of occurrence.observationIds) {
				linkedObservations.add(`${occurrence.probeId}\u0000${observationId}`);
			}
		}
	}

	for (const observation of assessment.observations) {
		const key = `${observation.probeId}\u0000${observation.observationId}`;
		if (linkedObservations.has(key)) continue;
		const severity = unlinkedObservationSeverity(observation);
		if (!severity) continue;
		const domain = domainForCapability(observation.capability);
		result.set(domain, worseSeverity(result.get(domain), severity));
	}
	return result;
}

function worstSeverity(
	severities: Iterable<FindingSeverity>,
): FindingSeverity | undefined {
	let worst: FindingSeverity | undefined;
	for (const severity of severities) {
		worst = worseSeverity(worst, severity);
	}
	return worst;
}

function qualityScore(assessment: ScoreVariantInput): number {
	const category = categoryFor(assessment);
	const domains = activeDomains(assessment, category);
	const severities = severitiesByDomain(assessment);
	const captureIsCritical = severities.get("capture") === "critical";
	const weights = domainWeights[category];
	let weightedQuality = 0;
	let totalWeight = 0;

	for (const domain of domains) {
		const weight = weights[domain];
		if (weight === 0) continue;
		const severity = severities.get(domain);
		let quality = severity ? severityQuality[severity] : 100;
		if (captureIsCritical && domain !== "conventions") {
			quality = Math.min(quality, severityQuality.critical);
		}
		weightedQuality += quality * weight;
		totalWeight += weight;
	}

	const rawScore =
		totalWeight === 0 ? 100 : Math.round(weightedQuality / totalWeight);
	const severity = worstSeverity(severities.values());
	return severity ? Math.min(rawScore, severityCeiling[severity]) : rawScore;
}

function executionRatio(probes: readonly ProbeResult[]): number {
	if (probes.length === 0) return 0;
	return (
		probes.filter((probe) => probe.status === "completed").length /
		probes.length
	);
}

/**
 * Score fixed telemetry domains rather than individual span observations.
 * Repeated spans therefore add evidence without adding positive points.
 */
export function scoreVariant(assessment: ScoreVariantInput): number {
	const quality = qualityScore(assessment);
	if (assessment.completion === "complete") return quality;

	const started = assessment.probes.some(
		(probe) =>
			probe.status === "running" ||
			probe.status === "completed" ||
			probe.status === "failed",
	);
	if (!started) return 0;
	return Math.max(1, Math.round(quality * executionRatio(assessment.probes)));
}

export function classifyScore(
	score: number,
	completion: AssessmentCompletion,
): AssessmentRating {
	if (completion === "incomplete") return "out_of_spec";
	if (score >= 85) return "all_good";
	if (score >= 70) return "improvements_needed";
	return "significant_improvements_needed";
}

export function averageScore(scores: readonly number[]): number {
	if (scores.length === 0) return 100;
	return Math.round(
		scores.reduce((total, score) => total + score, 0) / scores.length,
	);
}
