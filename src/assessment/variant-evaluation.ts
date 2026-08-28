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
import type { ResolvedVariant } from "./matrix.js";
import { partitionSpansByProbe } from "./partition.js";
import type {
	AssessmentCategory,
	Finding,
	Observation,
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
	resolvedSentryVersion?: string;
	generatedProgramPath?: string;
	logPath?: string;
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
	const partition = partitionSpansByProbe(input.spans);
	const observations = [
		...input.probes.flatMap((probe) =>
			observationsForProbe(
				probe,
				input.variant,
				input.category,
				partition.byProbe.get(probe.probeId) ?? [],
			),
		),
		...evaluateConventions(input.variant.id, input.spans),
		...evaluateUnassignedSpans(input.variant.id, partition.unassigned),
	];
	const findings: Finding[] = observations.flatMap((observation) => {
		const finding = findingFromObservation(observation);
		return finding ? [finding] : [];
	});
	return finalizeVariant(
		{
			id: input.variant.id,
			identity: input.variant.identity,
			resolvedSentryVersion: input.resolvedSentryVersion,
			probes: input.probes,
			observations,
			findings,
			runtimeFailures: input.runtimeFailures,
			spans: input.spans,
			generatedProgramPath: input.generatedProgramPath,
			logPath: input.logPath,
		},
		input.category,
	);
}
