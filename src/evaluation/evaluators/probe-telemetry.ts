import type {
	CapturedSpan,
	Observation,
	ProbeResult,
} from "../../assessment/types.js";
import { normalizeInputMessages } from "../normalizers/messages.js";
import {
	errorStatuses,
	isClientSpan,
	isGenAiSpan,
	observation,
	type ProbeInput,
} from "./telemetry-shared.js";

export function evaluateProviderError(
	probe: ProbeResult,
	variantId: string,
	spans: readonly CapturedSpan[],
): Observation[] {
	const span = spans.find(
		(candidate) =>
			isGenAiSpan(candidate) &&
			((typeof candidate.status === "string" &&
				errorStatuses.has(candidate.status)) ||
				candidate.data?.["error.type"] !== undefined ||
				(typeof candidate.data?.["http.status_code"] === "number" &&
					candidate.data["http.status_code"] >= 400)),
	);
	return [
		observation(
			"provider.error",
			span ? "healthy" : "missing",
			probe,
			variantId,
			span,
			span?.data?.["error.type"] !== undefined ? "error.type" : "status",
			span?.data?.["error.type"] ?? span?.status,
		),
	];
}

export function evaluateConversation(
	probe: ProbeResult,
	variantId: string,
	spans: readonly CapturedSpan[],
	input: ProbeInput,
): Observation[] {
	const expected = input.calls
		.map((call) => call.conversationId)
		.filter((value): value is string => typeof value === "string");
	const clients = spans
		.filter(isClientSpan)
		.sort((left, right) => left.start_timestamp - right.start_timestamp);
	const clientObservations = expected.map((conversationId, index) => {
		const span = clients[index];
		const actual = span?.data?.["gen_ai.conversation.id"];
		let state: Observation["state"] = "malformed";
		if (actual === conversationId) state = "healthy";
		else if (actual === undefined) state = "missing";
		return observation(
			"conversation.id",
			state,
			probe,
			variantId,
			span,
			"gen_ai.conversation.id",
			actual,
			conversationId,
		);
	});
	const propagationObservations = spans.flatMap((span) => {
		if (!isGenAiSpan(span) || isClientSpan(span)) return [];
		const actual = span.data?.["gen_ai.conversation.id"];
		let state: Observation["state"] = "malformed";
		if (actual === undefined) state = "missing";
		else if (typeof actual === "string" && expected.includes(actual)) {
			state = "healthy";
		}
		return [
			observation(
				"conversation.id",
				state,
				probe,
				variantId,
				span,
				"gen_ai.conversation.id",
				actual,
				expected,
			),
		];
	});
	return [...clientObservations, ...propagationObservations];
}

export function evaluateLongInput(
	probe: ProbeResult,
	variantId: string,
	spans: readonly CapturedSpan[],
	input: ProbeInput,
): Observation[] {
	if (input.originalInputBytes === undefined) return [];
	const span = spans.find((candidate) => {
		if (!isClientSpan(candidate)) return false;
		const messages = normalizeInputMessages(candidate);
		return messages.state === "modern" || messages.state === "legacy";
	});
	if (!span) {
		return [observation("input.trimming", "missing", probe, variantId)];
	}
	const messages = normalizeInputMessages(span);
	const bytes = Buffer.byteLength(JSON.stringify(messages.value));
	return [
		observation(
			"input.trimming",
			bytes < input.originalInputBytes ? "healthy" : "malformed",
			probe,
			variantId,
			span,
			messages.attribute,
			bytes,
			`< ${input.originalInputBytes}`,
		),
	];
}
