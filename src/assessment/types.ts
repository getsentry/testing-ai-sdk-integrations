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

export type FailureCategory =
	| "provider"
	| "setup"
	| "harness"
	| "telemetry"
	| "unknown";
export type ExecutionHealth = "healthy" | "recovered" | "failed";

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
		| "protocol"
		| "harness";
	message: string;
	probeId?: string;
	callId?: string;
	attemptId?: string;
	stopsVariant: boolean;
	category?: FailureCategory;
	statusCode?: number;
	code?: string;
	retryAfterMs?: number;
	recovered?: boolean;
	secondary?: boolean;
}

export interface ToolExecution {
	id: string;
	name: string;
	toolCallId?: string;
	arguments: unknown;
	result?: unknown;
	error?: string;
	status: "running" | "succeeded" | "failed" | "cancelled";
	startedAt: string;
	finishedAt?: string;
}

export interface CallResult {
	callId: string;
	mode: "blocking" | "streaming";
	status: "not_executed" | "running" | "succeeded" | "failed" | "cancelled";
	startedAt?: string;
	finishedAt?: string;
	durationMs?: number;
	expectedError?: boolean;
	error?: RuntimeFailure;
	tools: ToolExecution[];
}

export interface ModelBehavior {
	probeId: string;
	callId: string;
	attemptId?: string;
	toolName?: string;
	kind: "arguments_differ" | "tool_not_called" | "expected_error_not_raised";
	actual?: unknown;
	expected?: unknown;
}

export interface ProbeAttempt {
	id: string;
	probe: ProbeResult;
	number: number;
	startedAt: string;
	finishedAt: string;
	durationMs: number;
	deadlineMs: number;
	runtimeFailures: RuntimeFailure[];
	retryReason?:
		| "transient_provider"
		| "diagnostic_timeout"
		| "diagnostic_flush"
		| "port_collision";
	retryDelayMs?: number;
	programPath: string;
	logPath: string;
}

export interface ExecutionCoverage {
	planned: number;
	succeeded: number;
	expectedErrors: number;
	failed: number;
	cancelled: number;
	notExecuted: number;
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
	calls?: CallResult[];
	telemetryComplete?: boolean;
}

export interface Observation {
	observationId: string;
	capability: string;
	state: CapabilityState;
	probeId: string;
	variantId: string;
	attemptId?: string;
	source?: "modern" | "legacy";
	expected?: unknown;
	actual?: unknown;
	evidence: Evidence[];
}

export interface FindingOccurrence {
	variantId: string;
	attemptId?: string;
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
	resolvedFrameworkVersion?: string;
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
	attempts?: ProbeAttempt[];
	executionHealth?: ExecutionHealth;
	coverage?: ExecutionCoverage;
	modelBehavior?: ModelBehavior[];
	endpoint?: string;
	dependencySnapshotPath?: string;
	telemetryScore?: number | null;
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
	telemetryScore?: number | null;
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
	execution?: Record<ExecutionHealth, number>;
	coverage?: ExecutionCoverage;
	modelBehavior?: number;
	telemetryScore?: number | null;
}

export interface AssessmentReport {
	schemaVersion: "2";
	scoringVersion: "2" | "3" | "4";
	executionId?: string;
	runId?: string;
	runAttempt?: string;
	commitSha?: string;
	executionPolicy?: {
		parallel: number;
		endpointLimits: Record<string, number>;
		defaultProbeTimeoutMs: number;
		probeTimeoutMs?: number;
		retries: number;
		sdkRetries: string;
	};
	generatedAt: string;
	durationMs: number;
	targets: TargetAssessment[];
	summary: AssessmentSummary;
}
