import type { CapturedSpan } from "./types.js"

export interface SpanPartition {
	byProbe: Map<string, CapturedSpan[]>;
	unassigned: CapturedSpan[];
}

function spanKey(span: CapturedSpan): string {
	return `${span.trace_id}:${span.span_id}`;
}

function parentKey(span: CapturedSpan): string | undefined {
	const parentSpanId = span.parent_span_id;
	return typeof parentSpanId === "string"
		? `${span.trace_id}:${parentSpanId}`
		: undefined;
}

function probeId(span: CapturedSpan): string | undefined {
	const value = span.data?.["test.probe.id"];
	return typeof value === "string" ? value : undefined;
}

/**
 * Assign a span by its root's test.probe.id, not by timestamps. This works for
 * both transaction-embedded spans and normalized span-v2 envelopes.
 */
export function partitionSpansByProbe(
	spans: readonly CapturedSpan[],
): SpanPartition {
	const bySpanId = new Map(spans.map((span) => [spanKey(span), span]));
	const byProbe = new Map<string, CapturedSpan[]>();
	const unassigned: CapturedSpan[] = [];

	for (const span of spans) {
		let current: CapturedSpan | undefined = span;
		const visited = new Set<string>();
		let assignedProbe: string | undefined;
		while (current) {
			const key = spanKey(current);
			if (visited.has(key)) break;
			visited.add(key);
			assignedProbe = probeId(current);
			if (assignedProbe) break;
			const parent = parentKey(current);
			current = parent ? bySpanId.get(parent) : undefined;
		}

		if (!assignedProbe) {
			unassigned.push(span);
			continue;
		}
		const bucket = byProbe.get(assignedProbe) ?? [];
		bucket.push(span);
		byProbe.set(assignedProbe, bucket);
	}

	return { byProbe, unassigned };
}
