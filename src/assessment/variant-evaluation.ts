import {
	blockedMessageObservations,
	evaluateMessages,
} from "../evaluation/evaluators/messages.js";
import {
	blockedModelObservations,
	evaluateModels,
} from "../evaluation/evaluators/models.js";
import { evaluateClientSpans } from "../evaluation/evaluators/spans.js";
import {
	evaluateConventions,
	evaluateProbeTelemetry,
	evaluateUnassignedSpans,
} from "../evaluation/evaluators/telemetry.js";
import { isClientSpan } from "../evaluation/evaluators/telemetry-shared.js";
import { findingFromObservation } from "../evaluation/findings.js";
import { getProbeInputs } from "../probes/inputs.js";
import { finalizeVariant } from "./aggregation.js";
import { coverage } from "./call-evidence.js";
import {
	evaluateModelBehavior,
	evaluateRecordedCalls,
} from "./live-evaluation.js";
import type { ResolvedVariant } from "./matrix.js";
import { partitionSpansByProbe } from "./partition.js";
import type {
	AssessmentCategory,
	Finding,
	Observation,
	ProbeAttempt,
	ProbeResult,
	RuntimeFailure,
	VariantAssessment,
} from "./types.js";

export interface VariantEvaluationInput {
	variant: ResolvedVariant;
	category: AssessmentCategory;
	probes: ProbeResult[];
	spans: VariantAssessment["spans"];
	runtimeFailures: RuntimeFailure[];
	resolvedFrameworkVersion?: string;
	resolvedSentryVersion?: string;
	generatedProgramPath?: string;
	logPath?: string;
	attempts?: ProbeAttempt[];
	endpoint?: string;
	dependencySnapshotPath?: string;
}

function shouldEvaluate(probe: ProbeResult): boolean {
	return (
		probe.status !== "pending" &&
		probe.status !== "running" &&
		probe.status !== "blocked" &&
		!probe.runtimeError?.stopsVariant
	);
}

function observationsForProbe(
	probe: ProbeResult,
	variant: ResolvedVariant,
	category: AssessmentCategory,
	spans: VariantAssessment["spans"],
): Observation[] {
	if (probe.calls)
		return evaluateRecordedCalls(probe, variant, category, spans);
	if (!shouldEvaluate(probe)) return [];
	const canonicalInput = getProbeInputs(category)[probe.probeId];
	const callModes = probe.callModes.length
		? probe.callModes
		: ["blocking" as const];
	const input = canonicalInput
		? {
				...canonicalInput,
				calls: callModes.flatMap((mode) =>
					canonicalInput.calls.map((call, callIndex) => ({
						...call,
						streaming: mode === "streaming",
						assessmentCallId: `${probe.probeId}:${mode}:${callIndex}`,
						assessmentCallMode: mode,
						allowsMultipleClientSpans:
							category === "agents" &&
							"tools" in canonicalInput &&
							canonicalInput.tools !== undefined &&
							canonicalInput.tools.length > 0,
					})),
				),
			}
		: undefined;
	const client = evaluateClientSpans(
		probe,
		variant.id,
		spans,
		input?.calls ?? [],
	);
	const telemetry = input
		? evaluateProbeTelemetry(probe, variant.id, category, spans, input)
		: [];
	if (input?.expectError) return [...client.observations, ...telemetry];
	if (!client.clientSpan) {
		return [
			...client.observations,
			...blockedModelObservations(probe, variant.id),
			...blockedMessageObservations(probe, variant.id),
			...telemetry,
		];
	}
	const clientObservations = spans
		.filter(isClientSpan)
		.flatMap((span) => [
			...evaluateModels(probe, variant.id, span, variant.modelOverrides),
			...evaluateMessages(probe, variant.id, span),
		]);
	return [...client.observations, ...clientObservations, ...telemetry];
}

export function evaluateVariant(
	input: VariantEvaluationInput,
): VariantAssessment {
	const sources = input.attempts?.map((attempt) => {
		const ids = new Set(attempt.probe.spanIds);
		return {
			id: attempt.id,
			probes: [attempt.probe],
			spans: input.spans.filter((span) => ids.has(span.span_id)),
		};
	}) ?? [{ id: undefined, probes: input.probes, spans: input.spans }];
	const observations = sources.flatMap((source) => {
		const partition = partitionSpansByProbe(source.spans);
		return [
			...source.probes.flatMap((probe) =>
				observationsForProbe(
					probe,
					input.variant,
					input.category,
					partition.byProbe.get(probe.probeId) ?? [],
				),
			),
			...evaluateConventions(input.variant.id, source.spans),
			...(source.probes.some((probe) => probe.telemetryComplete === false)
				? []
				: evaluateUnassignedSpans(input.variant.id, partition.unassigned)),
		].map((observation) => ({ ...observation, attemptId: source.id }));
	});
	const modelBehavior = sources.flatMap((source) =>
		source.probes.flatMap((probe) =>
			evaluateModelBehavior(probe, input.category).map((item) => ({
				...item,
				attemptId: source.id,
			})),
		),
	);
	const findings: Finding[] = observations.flatMap((observation) => {
		const finding = findingFromObservation(observation);
		return finding ? [finding] : [];
	});
	return finalizeVariant(
		{
			id: input.variant.id,
			identity: input.variant.identity,
			resolvedFrameworkVersion: input.resolvedFrameworkVersion,
			resolvedSentryVersion: input.resolvedSentryVersion,
			probes: input.probes,
			observations,
			findings,
			runtimeFailures: input.runtimeFailures,
			spans: input.spans,
			generatedProgramPath: input.generatedProgramPath,
			logPath: input.logPath,
			attempts: input.attempts,
			coverage: input.probes.some((probe) => probe.calls)
				? coverage(input.probes)
				: undefined,
			modelBehavior,
			endpoint: input.endpoint,
			dependencySnapshotPath: input.dependencySnapshotPath,
		},
		input.category,
	);
}
