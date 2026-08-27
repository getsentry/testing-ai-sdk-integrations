import type {
	CapturedSpan,
	Observation,
	ProbeResult,
} from "../../assessment/types.js";
import { isClientSpan, isGenAiSpan } from "./telemetry-shared.js";

export interface ClientSpanEvaluation {
	clientSpan?: CapturedSpan;
	observations: Observation[];
}

/**
 * Establish the root prerequisite for dependent evaluators. A missing client
 * span creates one finding; callers use the absence of clientSpan to report
 * blocked dependent observations instead of cascading missing findings.
 */
export function evaluateClientSpan(
	probe: ProbeResult,
	variantId: string,
	spans: readonly CapturedSpan[],
): ClientSpanEvaluation {
	const genAiSpans = spans.filter(isGenAiSpan);
	if (genAiSpans.length === 0) {
		return {
			observations: [
				{
					observationId: "spans.gen_ai",
					capability: "spans.gen_ai",
					state: "missing",
					probeId: probe.probeId,
					variantId,
					evidence: [],
				},
			],
		};
	}

	const clientSpan = genAiSpans.find(isClientSpan);
	if (!clientSpan) {
		return {
			observations: [
				{
					observationId: "spans.client",
					capability: "spans.client",
					state: "missing",
					probeId: probe.probeId,
					variantId,
					evidence: genAiSpans.map((span) => ({
						spanId: span.span_id,
						traceId: span.trace_id,
						description: span.description,
					})),
				},
			],
		};
	}

	return {
		clientSpan,
		observations: [
			{
				observationId: "spans.client",
				capability: "spans.client",
				state: "healthy",
				probeId: probe.probeId,
				variantId,
				evidence: [
					{
						spanId: clientSpan.span_id,
						traceId: clientSpan.trace_id,
						description: clientSpan.description,
					},
				],
			},
		],
	};
}
