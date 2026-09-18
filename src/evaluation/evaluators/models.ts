import type { Observation, ProbeResult } from "../../assessment/types.js";
import type { CapturedSpan } from "../../assessment/types.js";

function evidence(span: CapturedSpan, attribute: string, value: unknown) {
	return [{ spanId: span.span_id, traceId: span.trace_id, attribute, value }];
}

function matchesModelExpectation(actual: string, expected: string): boolean {
	if (!expected.includes("*")) return actual === expected;

	const parts = expected.split("*");
	let offset = 0;
	for (const [index, part] of parts.entries()) {
		if (part.length === 0) continue;
		if (index === 0) {
			if (!actual.startsWith(part)) return false;
			offset = part.length;
			continue;
		}
		if (index === parts.length - 1) {
			return actual.endsWith(part) && actual.length - part.length >= offset;
		}
		const matchIndex = actual.indexOf(part, offset);
		if (matchIndex === -1) return false;
		offset = matchIndex + part.length;
	}
	return true;
}

function modelObservation(
	capability: "model.request" | "model.response",
	attribute: string,
	probe: ProbeResult,
	variantId: string,
	span: CapturedSpan,
	expected?: string,
): Observation {
	const actual = span.data?.[attribute];
	let state: Observation["state"] = "healthy";
	if (typeof actual !== "string" || actual.length === 0) {
		state = "missing";
	} else if (
		capability === "model.response" &&
		expected !== undefined &&
		!matchesModelExpectation(actual, expected)
	) {
		// CapabilityState intentionally has no mismatch state. The finding mapper
		// distinguishes this malformed expected value from malformed schema data.
		state = "malformed";
	}
	return {
		observationId: `${capability}:${span.span_id}`,
		capability,
		state,
		probeId: probe.probeId,
		variantId,
		expected,
		actual,
		evidence: actual === undefined ? [] : evidence(span, attribute, actual),
	};
}

/** Request and response model findings are intentionally independent. */
export function evaluateModels(
	probe: ProbeResult,
	variantId: string,
	clientSpan: CapturedSpan,
	expectations: { request?: string; response?: string } = {},
): Observation[] {
	return [
		modelObservation(
			"model.request",
			"gen_ai.request.model",
			probe,
			variantId,
			clientSpan,
			expectations.request,
		),
		modelObservation(
			"model.response",
			"gen_ai.response.model",
			probe,
			variantId,
			clientSpan,
			expectations.response,
		),
	];
}

export function blockedModelObservations(
	probe: ProbeResult,
	variantId: string,
): Observation[] {
	return ["model.request", "model.response"].map((capability) => ({
		observationId: capability,
		capability,
		state: "blocked",
		probeId: probe.probeId,
		variantId,
		evidence: [],
	}));
}
