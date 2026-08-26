import type {
	AssessmentCompletion,
	AssessmentRating,
	FindingSeverity,
	VariantAssessment,
} from "./types.js";

const severityScore: Record<FindingSeverity, number> = {
	critical: 0,
	major: 50,
	minor: 80,
	info: 95,
};

const severityRank: Record<FindingSeverity, number> = {
	info: 0,
	minor: 1,
	major: 2,
	critical: 3,
};

const severityWeight: Record<FindingSeverity, number> = {
	info: 1,
	minor: 2,
	major: 5,
	critical: 10,
};

const fallbackState = {
	healthy: { score: 100, weight: 1 },
	legacy: { score: 80, weight: 2 },
	missing: { score: 50, weight: 5 },
	malformed: { score: 50, weight: 5 },
} as const;

/**
 * Score evaluated observations from 0 to 100.
 *
 * Healthy observations receive 100 points. Observations with findings receive
 * points based on the worst associated finding severity. States that do not
 * represent an evaluated product outcome are excluded from the average.
 */
export function scoreVariant(
	assessment: Pick<
		VariantAssessment,
		"id" | "completion" | "observations" | "findings"
	>,
): number {
	if (assessment.completion === "incomplete") return 0;

	const severityByObservation = new Map<string, FindingSeverity>();
	for (const finding of assessment.findings) {
		for (const occurrence of finding.occurrences) {
			if (occurrence.variantId !== assessment.id) continue;
			for (const observationId of occurrence.observationIds) {
				const key = `${occurrence.probeId}\u0000${observationId}`;
				const current = severityByObservation.get(key);
				if (
					!current ||
					severityRank[finding.severity] > severityRank[current]
				) {
					severityByObservation.set(key, finding.severity);
				}
			}
		}
	}

	const outcomes: Array<{ score: number; weight: number }> = [];
	for (const observation of assessment.observations) {
		if (!(observation.state in fallbackState)) continue;
		const severity = severityByObservation.get(
			`${observation.probeId}\u0000${observation.observationId}`,
		);
		outcomes.push(
			severity
				? { score: severityScore[severity], weight: severityWeight[severity] }
				: fallbackState[observation.state as keyof typeof fallbackState],
		);
	}

	if (outcomes.length === 0) {
		if (assessment.findings.length === 0) return 100;
		const totalWeight = assessment.findings.reduce(
			(total, finding) => total + severityWeight[finding.severity],
			0,
		);
		return Math.round(
			assessment.findings.reduce(
				(total, finding) =>
					total +
					severityScore[finding.severity] * severityWeight[finding.severity],
				0,
			) / totalWeight,
		);
	}

	const totalWeight = outcomes.reduce(
		(total, outcome) => total + outcome.weight,
		0,
	);
	return Math.round(
		outcomes.reduce(
			(total, outcome) => total + outcome.score * outcome.weight,
			0,
		) / totalWeight,
	);
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
