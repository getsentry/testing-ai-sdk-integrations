import { deriveCompletion, deriveHealth, worseHealth } from "./health.js";
import { averageScore, classifyScore, scoreVariant } from "./scoring.js";
import type {
	AssessmentHealth,
	AssessmentReport,
	AssessmentSummary,
	CapabilityState,
	Finding,
	FindingOccurrence,
	TargetAssessment,
	TargetIdentity,
	VariantAssessment,
} from "./types.js";

const capabilityRank: Record<CapabilityState, number> = {
	healthy: 0,
	legacy: 1,
	blocked: 2,
	missing: 3,
	malformed: 4,
};

function mergeOccurrences(
	occurrences: readonly FindingOccurrence[],
): FindingOccurrence[] {
	const byLocation = new Map<string, FindingOccurrence>();
	for (const occurrence of occurrences) {
		const key = `${occurrence.variantId}\u0000${occurrence.probeId}`;
		const current = byLocation.get(key);
		if (current) {
			current.observationIds = [
				...new Set([...current.observationIds, ...occurrence.observationIds]),
			];
			current.evidence = [...current.evidence, ...occurrence.evidence];
		} else {
			byLocation.set(key, { ...occurrence });
		}
	}
	return [...byLocation.values()].sort((a, b) =>
		`${a.variantId}/${a.probeId}`.localeCompare(`${b.variantId}/${b.probeId}`),
	);
}

/** Deduplicate a finding within an assessment while retaining each probe's evidence. */
function deduplicateFindings(findings: readonly Finding[]): Finding[] {
	const byId = new Map<string, Finding>();
	for (const finding of findings) {
		const existing = byId.get(finding.findingId);
		if (existing) {
			existing.occurrences.push(...finding.occurrences);
		} else {
			byId.set(finding.findingId, {
				...finding,
				occurrences: [...finding.occurrences],
			});
		}
	}

	return [...byId.values()]
		.map((finding) => ({
			...finding,
			occurrences: mergeOccurrences(finding.occurrences),
		}))
		.sort((a, b) => a.findingId.localeCompare(b.findingId));
}

export function finalizeVariant(
	variant: Omit<
		VariantAssessment,
		"completion" | "health" | "score" | "rating" | "findings"
	> & {
		findings: Finding[];
	},
): VariantAssessment {
	const findings = deduplicateFindings(variant.findings);
	const completion = deriveCompletion(variant.runtimeFailures);
	const health = deriveHealth(findings);
	const score = scoreVariant({
		id: variant.id,
		completion,
		observations: variant.observations,
		findings,
	});
	return {
		...variant,
		findings,
		completion,
		health,
		score,
		rating: classifyScore(score, completion),
	};
}

function summarizeCapabilities(
	variants: readonly VariantAssessment[],
): Record<string, CapabilityState> {
	const summary: Record<string, CapabilityState> = {};
	for (const variant of variants) {
		for (const observation of variant.observations) {
			const current = summary[observation.capability];
			if (
				!current ||
				capabilityRank[observation.state] > capabilityRank[current]
			) {
				summary[observation.capability] = observation.state;
			}
		}
	}
	return summary;
}

export function aggregateTarget(
	identity: TargetIdentity,
	variants: readonly VariantAssessment[],
): TargetAssessment {
	const findings = deduplicateFindings(
		variants.flatMap((variant) => variant.findings),
	);
	const completion = variants.some(
		(variant) => variant.completion === "incomplete",
	)
		? "incomplete"
		: "complete";
	const score = averageScore(variants.map((variant) => variant.score));
	return {
		id: `${identity.platform}/${identity.category}/${identity.framework}`,
		identity,
		variants: [...variants].sort((a, b) => a.id.localeCompare(b.id)),
		findings,
		completion,
		health: variants.reduce<AssessmentHealth>(
			(health, variant) => worseHealth(health, variant.health),
			deriveHealth(findings),
		),
		score,
		rating: classifyScore(score, completion),
		capabilitySummary: summarizeCapabilities(variants),
	};
}

export function summarizeReport(
	targets: readonly TargetAssessment[],
): AssessmentSummary {
	const summary: AssessmentSummary = {
		targets: targets.length,
		variants: 0,
		complete: 0,
		incomplete: 0,
		score: 100,
		ratings: {
			all_good: 0,
			improvements_needed: 0,
			significant_improvements_needed: 0,
			out_of_spec: 0,
		},
		health: { healthy: 0, healthy_with_notes: 0, degraded: 0, broken: 0 },
		findings: { critical: 0, major: 0, minor: 0, info: 0 },
	};
	for (const target of targets) {
		summary.health[target.health]++;
		for (const variant of target.variants) {
			summary.variants++;
			summary[variant.completion]++;
			summary.ratings[variant.rating]++;
		}
		for (const finding of target.findings) {
			summary.findings[finding.severity]++;
		}
	}
	// Give every integration equal influence, regardless of its variant count.
	summary.score = averageScore(targets.map((target) => target.score));
	return summary;
}

export function createReport(
	targets: readonly TargetAssessment[],
	durationMs: number,
	generatedAt = new Date().toISOString(),
): AssessmentReport {
	const orderedTargets = [...targets].sort((a, b) => a.id.localeCompare(b.id));
	return {
		schemaVersion: "2",
		scoringVersion: "2",
		generatedAt,
		durationMs,
		targets: orderedTargets,
		summary: summarizeReport(orderedTargets),
	};
}
