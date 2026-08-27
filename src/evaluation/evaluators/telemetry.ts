import type {
	CapturedSpan,
	Observation,
	ProbeResult,
} from "../../assessment/types.js";
import { auditAttributes } from "../../auditor.js";
import {
	evaluateAgentHierarchy,
	evaluateOperations,
	evaluateTokens,
} from "./core-telemetry.js";
import {
	evaluateConversation,
	evaluateLongInput,
	evaluateProviderError,
} from "./probe-telemetry.js";
import {
	evidence,
	isClientSpan,
	isGenAiSpan,
	observation,
	type ProbeInput,
} from "./telemetry-shared.js";
import { evaluateTools } from "./tools.js";

type Category = "llm" | "agents";

/** Evaluate probe-specific telemetry beyond the baseline model and message checks. */
export function evaluateProbeTelemetry(
	probe: ProbeResult,
	variantId: string,
	category: Category,
	spans: readonly CapturedSpan[],
	input: ProbeInput,
): Observation[] {
	const genAiSpans = spans.filter(isGenAiSpan);
	if (genAiSpans.length === 0) {
		return category === "agents"
			? [observation("agent.hierarchy", "blocked", probe, variantId)]
			: [];
	}
	const observations = [
		...evaluateOperations(probe, variantId, genAiSpans),
		...(input.expectError
			? []
			: evaluateTokens(probe, variantId, genAiSpans.filter(isClientSpan))),
	];
	if (category === "agents") {
		observations.push(...evaluateAgentHierarchy(probe, variantId, spans));
	}
	if (
		probe.probeId.endsWith("tools_success") ||
		probe.probeId.endsWith("tool_error")
	) {
		observations.push(...evaluateTools(probe, variantId, spans, input));
	}
	if (probe.probeId.endsWith("provider_error")) {
		observations.push(...evaluateProviderError(probe, variantId, spans));
	}
	if (probe.probeId.endsWith("conversation")) {
		observations.push(...evaluateConversation(probe, variantId, spans, input));
	}
	if (probe.probeId.endsWith("long_input")) {
		observations.push(...evaluateLongInput(probe, variantId, spans, input));
	}
	return observations;
}

export function evaluateConventions(
	variantId: string,
	spans: readonly CapturedSpan[],
): Observation[] {
	const audit = auditAttributes(spans);
	const spansById = new Map(spans.map((span) => [span.span_id, span]));
	const conventionEvidence = (
		attribute: string,
		spanId: string,
		value?: unknown,
	) => {
		const span = spansById.get(spanId);
		return {
			spanId,
			traceId: span?.trace_id,
			attribute,
			value,
			description: span?.description,
		};
	};
	return [
		...audit.deprecatedAttributes.map((attribute) => ({
			observationId: `conventions.deprecated:${attribute.attribute}`,
			capability: "conventions.deprecated",
			state: "legacy" as const,
			probeId: "variant",
			variantId,
			actual: attribute.attribute,
			expected: attribute.replacement,
			evidence: attribute.spanIds.map((spanId) =>
				conventionEvidence(attribute.attribute, spanId, attribute.replacement),
			),
		})),
		...audit.unknownAttributes.map((attribute) => ({
			observationId: `conventions.unknown:${attribute.attribute}`,
			capability: "conventions.unknown",
			state: "malformed" as const,
			probeId: "variant",
			variantId,
			actual: attribute.attribute,
			evidence: attribute.spanIds.map((spanId) =>
				conventionEvidence(attribute.attribute, spanId),
			),
		})),
	];
}

export function evaluateUnassignedSpans(
	variantId: string,
	spans: readonly CapturedSpan[],
): Observation[] {
	const genAiSpans = spans.filter(isGenAiSpan);
	if (genAiSpans.length === 0) {
		return [
			{
				observationId: "spans.assignment",
				capability: "spans.assignment",
				state: "healthy",
				probeId: "variant",
				variantId,
				evidence: [],
			},
		];
	}
	return genAiSpans.map((span) => ({
		observationId: `spans.assignment:${span.span_id}`,
		capability: "spans.assignment",
		state: "missing" as const,
		probeId: "variant",
		variantId,
		actual: span.op,
		evidence: evidence(span),
	}));
}
