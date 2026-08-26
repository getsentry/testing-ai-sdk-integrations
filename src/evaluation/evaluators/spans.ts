import type { Observation, ProbeResult } from "../../assessment/types.js";
import type { CapturedSpan } from "../../assessment/types.js"

function isGenAiSpan(span: CapturedSpan): boolean {
	return (
		(typeof span.op === "string" && span.op.startsWith("gen_ai")) ||
		Object.keys(span.data ?? {}).some((attribute) =>
			attribute.startsWith("gen_ai."),
		)
	);
}

function isClientSpan(span: CapturedSpan): boolean {
	const operation = span.data?.["gen_ai.operation.name"];
	return (
		isGenAiSpan(span) &&
		typeof operation === "string" &&
		!operation.includes("tool") &&
		!operation.includes("agent")
	);
}

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
