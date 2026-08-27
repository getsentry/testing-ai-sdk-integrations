import type { Observation, ProbeResult } from "../../assessment/types.js";
import type { CapturedSpan } from "../../assessment/types.js";
import {
	normalizeInputMessages,
	normalizeOutputMessages,
} from "../normalizers/messages.js";

function toCapabilityState(
	state: "modern" | "legacy" | "missing" | "malformed",
): Observation["state"] {
	return state === "modern" ? "healthy" : state;
}

function observation(
	capability: "messages.input" | "messages.output",
	probe: ProbeResult,
	variantId: string,
	span: CapturedSpan,
): Observation {
	const normalized =
		capability === "messages.input"
			? normalizeInputMessages(span)
			: normalizeOutputMessages(span);
	return {
		observationId: `${capability}:${span.span_id}`,
		capability,
		state: toCapabilityState(normalized.state),
		probeId: probe.probeId,
		variantId,
		source:
			normalized.state === "modern" || normalized.state === "legacy"
				? normalized.state
				: undefined,
		actual: normalized.value,
		evidence: normalized.evidence,
	};
}

/**
 * Evaluate message telemetry without throwing. Callers should invoke this only
 * after the client-span prerequisite succeeds; otherwise they emit blocked
 * observations instead of derivative missing-message findings.
 */
export function evaluateMessages(
	probe: ProbeResult,
	variantId: string,
	clientSpan: CapturedSpan,
): Observation[] {
	return [
		observation("messages.input", probe, variantId, clientSpan),
		observation("messages.output", probe, variantId, clientSpan),
	];
}

export function blockedMessageObservations(
	probe: ProbeResult,
	variantId: string,
): Observation[] {
	return ["messages.input", "messages.output"].map((capability) => ({
		observationId: capability,
		capability,
		state: "blocked",
		probeId: probe.probeId,
		variantId,
		evidence: [],
	}));
}
