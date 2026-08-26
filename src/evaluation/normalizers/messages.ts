import type { CapturedSpan } from "../../assessment/types.js"
import type { Evidence } from "../../assessment/types.js";
import {
	normalizeAttribute,
	parseJson,
	type NormalizedAttribute,
} from "./attribute.js";

export interface NormalizedMessage {
	role: string;
	content?: unknown;
	toolCalls?: unknown;
	[key: string]: unknown;
}

export interface LegacyOutput {
	kind: "text" | "tool_calls";
	value: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isMessage(value: unknown): value is NormalizedMessage {
	return isRecord(value) && typeof value.role === "string";
}

function parseMessages(value: unknown): NormalizedMessage[] | undefined {
	return parseJson(
		value,
		(parsed): parsed is NormalizedMessage[] =>
			Array.isArray(parsed) && parsed.every(isMessage),
	);
}

function evidence(
	span: CapturedSpan,
	attribute: string,
	value: unknown,
): Evidence[] {
	return [{ spanId: span.span_id, traceId: span.trace_id, attribute, value }];
}

export function normalizeInputMessages(
	span: CapturedSpan,
): NormalizedAttribute<NormalizedMessage[]> {
	return normalizeAttribute(
		span,
		"gen_ai.input.messages",
		"gen_ai.request.messages",
		parseMessages,
	);
}

/**
 * Legacy output has two valid forms. Text and tool calls are useful partial
 * telemetry and must not be marked missing merely because modern messages are
 * absent.
 */
export function normalizeOutputMessages(
	span: CapturedSpan,
): NormalizedAttribute<NormalizedMessage[] | LegacyOutput> {
	const modern = span.data?.["gen_ai.output.messages"];
	if (modern !== undefined) {
		const value = parseMessages(modern);
		return value
			? {
					state: "modern",
					value,
					attribute: "gen_ai.output.messages",
					evidence: evidence(span, "gen_ai.output.messages", modern),
				}
			: {
					state: "malformed",
					attribute: "gen_ai.output.messages",
					evidence: evidence(span, "gen_ai.output.messages", modern),
				};
	}

	const text = span.data?.["gen_ai.response.text"];
	if (typeof text === "string") {
		return {
			state: "legacy",
			value: { kind: "text", value: text },
			attribute: "gen_ai.response.text",
			replacement: "gen_ai.output.messages",
			evidence: evidence(span, "gen_ai.response.text", text),
		};
	}
	if (text !== undefined) {
		return {
			state: "malformed",
			attribute: "gen_ai.response.text",
			replacement: "gen_ai.output.messages",
			evidence: evidence(span, "gen_ai.response.text", text),
		};
	}

	const toolCalls = span.data?.["gen_ai.response.tool_calls"];
	if (toolCalls !== undefined) {
		const value = parseJson(toolCalls, Array.isArray);
		return value
			? {
					state: "legacy",
					value: { kind: "tool_calls", value },
					attribute: "gen_ai.response.tool_calls",
					replacement: "gen_ai.output.messages",
					evidence: evidence(span, "gen_ai.response.tool_calls", toolCalls),
				}
			: {
					state: "malformed",
					attribute: "gen_ai.response.tool_calls",
					replacement: "gen_ai.output.messages",
					evidence: evidence(span, "gen_ai.response.tool_calls", toolCalls),
				};
	}

	return { state: "missing", evidence: [] };
}
