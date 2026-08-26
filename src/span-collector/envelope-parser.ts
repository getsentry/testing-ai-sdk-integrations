import type { CapturedSpan } from "../assessment/types.js";

export interface ParsedEnvelope {
	spans: CapturedSpan[];
	failures: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseJson(line: string | undefined): unknown {
	if (line === undefined) throw new Error("envelope item body is missing");
	try {
		return JSON.parse(line);
	} catch (error) {
		throw new Error("invalid envelope JSON", { cause: error });
	}
}

function v2SpanToCapturedSpan(value: unknown): CapturedSpan | undefined {
	if (!isRecord(value)) return undefined;
	const data: Record<string, unknown> = {};
	if (isRecord(value.attributes)) {
		for (const [key, attribute] of Object.entries(value.attributes)) {
			data[key] =
				isRecord(attribute) && "value" in attribute
					? attribute.value
					: attribute;
		}
	}
	if (
		typeof value.span_id !== "string" ||
		typeof value.trace_id !== "string" ||
		typeof value.start_timestamp !== "number" ||
		typeof value.end_timestamp !== "number"
	) {
		return undefined;
	}
	return {
		span_id: value.span_id,
		trace_id: value.trace_id,
		parent_span_id:
			typeof value.parent_span_id === "string"
				? value.parent_span_id
				: undefined,
		op: typeof data["sentry.op"] === "string" ? data["sentry.op"] : "",
		description: typeof value.name === "string" ? value.name : undefined,
		start_timestamp: value.start_timestamp,
		timestamp: value.end_timestamp,
		data,
		status: typeof value.status === "string" ? value.status : undefined,
		is_segment:
			typeof value.is_segment === "boolean" ? value.is_segment : undefined,
	};
}

function embeddedTransactionSpan(
	body: Record<string, unknown>,
): CapturedSpan | undefined {
	if (typeof body.span_id === "string") return body as unknown as CapturedSpan;
	if (!isRecord(body.contexts) || !isRecord(body.contexts.trace))
		return undefined;
	const trace = body.contexts.trace;
	if (
		typeof trace.span_id !== "string" ||
		typeof trace.trace_id !== "string" ||
		typeof body.start_timestamp !== "number" ||
		typeof body.timestamp !== "number"
	) {
		return undefined;
	}
	let op = "";
	if (typeof trace.op === "string") op = trace.op;
	else if (typeof body.op === "string") op = body.op;
	let description: string | undefined;
	if (typeof body.transaction === "string") description = body.transaction;
	else if (typeof trace.description === "string") {
		description = trace.description;
	}
	return {
		span_id: trace.span_id,
		trace_id: trace.trace_id,
		parent_span_id:
			typeof trace.parent_span_id === "string"
				? trace.parent_span_id
				: undefined,
		op,
		description,
		start_timestamp: body.start_timestamp,
		timestamp: body.timestamp,
		data: isRecord(trace.data) ? trace.data : {},
		status: typeof trace.status === "string" ? trace.status : undefined,
	};
}

function parseItem(headerValue: unknown, bodyValue: unknown): CapturedSpan[] {
	if (!isRecord(headerValue) || !isRecord(bodyValue)) return [];
	if (
		headerValue.type === "span" &&
		typeof headerValue.content_type === "string" &&
		headerValue.content_type.includes("span.v2") &&
		Array.isArray(bodyValue.items)
	) {
		return bodyValue.items.flatMap((item) => {
			const span = v2SpanToCapturedSpan(item);
			return span ? [span] : [];
		});
	}
	if (headerValue.type !== "transaction" && headerValue.type !== "span") {
		return [];
	}
	const spans: CapturedSpan[] = [];
	if (Array.isArray(bodyValue.spans)) {
		for (const span of bodyValue.spans) {
			if (isRecord(span)) spans.push(span as unknown as CapturedSpan);
		}
	}
	const transaction = embeddedTransactionSpan(bodyValue);
	if (transaction) spans.push(transaction);
	return spans;
}

export function parseEnvelope(body: string): ParsedEnvelope {
	if (!body.trim()) {
		return { spans: [], failures: ["Received an empty Sentry envelope."] };
	}
	const lines = body.trim().split("\n");
	try {
		parseJson(lines[0]);
	} catch {
		return {
			spans: [],
			failures: ["Failed to parse Sentry envelope header."],
		};
	}

	const parsed: ParsedEnvelope = { spans: [], failures: [] };
	for (let index = 1; index < lines.length; index += 2) {
		try {
			parsed.spans.push(
				...parseItem(parseJson(lines[index]), parseJson(lines[index + 1])),
			);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			parsed.failures.push(
				`Failed to parse Sentry envelope item ${Math.floor(index / 2) + 1}: ${message}`,
			);
		}
	}
	return parsed;
}
