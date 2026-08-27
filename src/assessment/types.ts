export interface CapturedSpan {
	span_id: string;
	trace_id: string;
	op: string;
	description?: string;
	start_timestamp: number;
	timestamp: number;
	data?: Record<string, unknown>;
	tags?: Record<string, unknown>;
	[key: string]: unknown;
}

export type AssessmentPlatform = "node" | "python" | "nextjs" | "cloudflare";
export type AssessmentCategory = "llm" | "agents";
export type FindingSeverity = "critical" | "major" | "minor" | "info";
export type AssessmentCompletion = "complete" | "incomplete";
export type AssessmentRating =
	| "all_good"
	| "improvements_needed"
	| "significant_improvements_needed"
	| "out_of_spec";
export type AssessmentHealth =
	| "healthy"
	| "healthy_with_notes"
	| "degraded"
	| "broken";
export type ProbeStatus =
	| "pending"
	| "running"
	| "completed"
	| "failed"
	| "blocked";
export type CapabilityState =
	| "healthy"
	| "legacy"
	| "malformed"
	| "missing"
	| "blocked";
export interface TargetIdentity {
	platform: AssessmentPlatform;
	category: AssessmentCategory;
	framework: string;
}

export interface VariantIdentity {
	frameworkVersion: string;
	sentryVersion: string;
	executionMode?: "sync" | "async";
	options: Record<string, string>;
}

export interface Evidence {
	spanId?: string;
	traceId?: string;
	attribute?: string;
	value?: unknown;
	description?: string;
}

export interface RuntimeFailure {
	kind:
		| "setup"
		| "render"
		| "process_start"
		| "process_exit"
		| "timeout"
		| "provider"
		| "collector"
		| "flush"
		| "protocol";
	message: string;
	probeId?: string;
	stopsVariant: boolean;
}

export interface ProbeResult {
	probeId: string;
	status: ProbeStatus;
	startedAt?: string;
	finishedAt?: string;
	durationMs?: number;
	runtimeError?: RuntimeFailure;
	callModes: Array<"blocking" | "streaming">;
	traceIds: string[];
	spanIds: string[];
}

export interface Observation {
	observationId: string;
	capability: string;
	state: CapabilityState;
	probeId: string;
	variantId: string;
	source?: "modern" | "legacy";
	expected?: unknown;
	actual?: unknown;
	evidence: Evidence[];
}

export interface FindingOccurrence {
	variantId: string;
	probeId: string;
	observationIds: string[];
	evidence: Evidence[];
}

export interface Finding {
	findingId: string;
	capability: string;
	severity: FindingSeverity;
	title: string;
	description: string;
	remediation?: string;
	occurrences: FindingOccurrence[];
}

export interface VariantAssessment {
	id: string;
	identity: VariantIdentity;
	resolvedSentryVersion?: string;
	completion: AssessmentCompletion;
	health: AssessmentHealth;
	score: number;
	rating: AssessmentRating;
	probes: ProbeResult[];
	observations: Observation[];
	findings: Finding[];
	runtimeFailures: RuntimeFailure[];
	spans: CapturedSpan[];
	generatedProgramPath?: string;
	logPath?: string;
}

export interface TargetAssessment {
	id: string;
	identity: TargetIdentity;
	completion: AssessmentCompletion;
	health: AssessmentHealth;
	score: number;
	rating: AssessmentRating;
	variants: VariantAssessment[];
	findings: Finding[];
	capabilitySummary: Record<string, CapabilityState>;
}

export interface AssessmentSummary {
	targets: number;
	variants: number;
	complete: number;
	incomplete: number;
	score: number;
	ratings: Record<AssessmentRating, number>;
	health: Record<AssessmentHealth, number>;
	findings: Record<FindingSeverity, number>;
}

export interface AssessmentReport {
	schemaVersion: "2";
	scoringVersion: "2" | "3";
	generatedAt: string;
	durationMs: number;
	targets: TargetAssessment[];
	summary: AssessmentSummary;
}
