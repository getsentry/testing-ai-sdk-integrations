import type {
	AssessmentCompletion,
	AssessmentHealth,
	Finding,
	FindingSeverity,
	RuntimeFailure,
} from "./types.js";

const severityRank: Record<FindingSeverity, number> = {
	info: 0,
	minor: 1,
	major: 2,
	critical: 3,
};

export function deriveHealth(findings: readonly Finding[]): AssessmentHealth {
	const worst = findings.reduce<FindingSeverity | undefined>(
		(current, finding) => {
			return !current || severityRank[finding.severity] > severityRank[current]
				? finding.severity
				: current;
		},
		undefined,
	);

	switch (worst) {
		case "critical":
			return "broken";
		case "major":
			return "degraded";
		case "minor":
		case "info":
			return "healthy_with_notes";
		default:
			return "healthy";
	}
}

export function deriveCompletion(
	runtimeFailures: readonly RuntimeFailure[],
): AssessmentCompletion {
	return runtimeFailures.some((failure) => failure.stopsVariant)
		? "incomplete"
		: "complete";
}

export function worseHealth(
	left: AssessmentHealth,
	right: AssessmentHealth,
): AssessmentHealth {
	const rank: Record<AssessmentHealth, number> = {
		healthy: 0,
		healthy_with_notes: 1,
		degraded: 2,
		broken: 3,
	};
	return rank[left] >= rank[right] ? left : right;
}
