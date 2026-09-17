import { evaluateMessages } from "../evaluation/evaluators/messages.js";
import { evaluateModels } from "../evaluation/evaluators/models.js";
import { evaluateProviderError } from "../evaluation/evaluators/probe-telemetry.js";
import {
	evaluateClientSpans,
	spansForCall,
} from "../evaluation/evaluators/spans.js";
import { evaluateProbeTelemetry } from "../evaluation/evaluators/telemetry.js";
import {
	equal,
	isClientSpan,
	isToolSpan,
	isAgentSpan,
} from "../evaluation/evaluators/telemetry-shared.js";
import { getProbeInputs } from "../probes/inputs.js";
import type { ResolvedVariant } from "./matrix.js";
import type {
	AssessmentCategory,
	CallResult,
	CapturedSpan,
	ModelBehavior,
	Observation,
	ProbeResult,
} from "./types.js";

function completed(call: CallResult): boolean {
	return call.status === "succeeded" || call.status === "failed";
}

export function evaluateRecordedCalls(
	probe: ProbeResult,
	variant: ResolvedVariant,
	category: AssessmentCategory,
	spans: readonly CapturedSpan[],
): Observation[] {
	const canonical = getProbeInputs(category)[probe.probeId];
	return (probe.calls ?? []).flatMap((call) => {
		if (call.status === "not_executed") return [];
		const callSpans = spansForCall(spans, call.callId);
		const request = canonical.calls[Number(call.callId.split(":").at(-1))];
		if (!request) return [];
		const failed = call.status !== "succeeded";
		const scopedProbe = { ...probe, calls: [call] };
		const input = {
			...canonical,
			expectError: Boolean(failed),
			calls: [
				{
					...request,
					streaming: call.mode === "streaming",
					assessmentCallId: call.callId,
					assessmentCallMode: call.mode,
					// Agent fallbacks and internal steps can call a model more than once, even without tools.
					allowsMultipleClientSpans: category === "agents",
				},
			],
		};
		const client = evaluateClientSpans(
			scopedProbe,
			variant.id,
			callSpans,
			input.calls,
		);
		const observations = [
			...client.observations,
			...evaluateProbeTelemetry(
				scopedProbe,
				variant.id,
				category,
				callSpans,
				input,
			),
			...callSpans
				.filter(isClientSpan)
				.flatMap((span) =>
					[
						...evaluateModels(
							scopedProbe,
							variant.id,
							span,
							canonical.expectError ? {} : variant.modelOverrides,
						),
						...evaluateMessages(scopedProbe, variant.id, span),
					].filter(
						(item) =>
							!failed ||
							(item.capability !== "model.response" &&
								item.capability !== "messages.output"),
					),
				),
		];
		if (
			call.status === "failed" &&
			call.error?.kind === "provider" &&
			!probe.probeId.endsWith("provider_error")
		) {
			observations.push(
				...evaluateProviderError(scopedProbe, variant.id, callSpans),
			);
		}
		const settled =
			completed(call) &&
			(call.status === "succeeded" ||
				call.expectedError ||
				call.error?.kind === "provider");
		const captured = new Set(
			callSpans
				.filter(
					(span) => isClientSpan(span) || isToolSpan(span) || isAgentSpan(span),
				)
				.map((span) => span.span_id),
		);
		// Delivery uncertainty blocks absence claims, not defects in completed spans already received.
		const capturedField = (item: Observation) =>
			item.evidence.some(
				(evidence) =>
					evidence.spanId &&
					captured.has(evidence.spanId) &&
					evidence.attribute &&
					(/^(gen_ai\.|ai\.)/.test(evidence.attribute) ||
						["status", "description"].includes(evidence.attribute)),
			);
		return observations
			.filter(
				(item) =>
					item.state !== "missing" ||
					(settled &&
						(probe.telemetryComplete !== false || capturedField(item))),
			)
			.map((item) => ({
				...item,
				observationId: `${call.callId}:${item.observationId}`,
			}));
	});
}

export function evaluateModelBehavior(
	probe: ProbeResult,
	category: AssessmentCategory,
): ModelBehavior[] {
	if (probe.probeId.endsWith("provider_error")) {
		return (probe.calls ?? [])
			.filter((call) => call.status === "succeeded")
			.map((call) => ({
				probeId: probe.probeId,
				callId: call.callId,
				kind: "expected_error_not_raised",
			}));
	}
	if (
		!probe.probeId.endsWith("tools_success") &&
		!probe.probeId.endsWith("tool_error")
	)
		return [];
	const input = getProbeInputs(category)[probe.probeId];
	if (!("tools" in input) || !input.tools) return [];
	return (probe.calls ?? []).flatMap((call) =>
		input.tools!.flatMap((tool): ModelBehavior[] => {
			const executions = call.tools.filter(
				(execution) => execution.name === tool.name,
			);
			const base = {
				probeId: probe.probeId,
				callId: call.callId,
				toolName: tool.name,
			};
			if (!executions.length)
				return call.status === "succeeded"
					? [{ ...base, kind: "tool_not_called" }]
					: [];
			return executions
				.filter((execution) => !equal(execution.arguments, tool.arguments))
				.map((execution) => ({
					...base,
					kind: "arguments_differ",
					actual: execution.arguments,
					expected: tool.arguments,
				}));
		}),
	);
}
