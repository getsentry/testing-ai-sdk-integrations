import type { CapturedSpan } from "../assessment/types.js";

export class SpanStore {
	private readonly spans = new Map<string, CapturedSpan[]>();

	registerRun(runId: string): void {
		this.spans.set(runId, []);
	}

	addSpans(runId: string, spans: CapturedSpan[]): void {
		this.spans.set(runId, [...(this.spans.get(runId) ?? []), ...spans]);
	}

	getSpans(runId: string): CapturedSpan[] {
		return [...(this.spans.get(runId) ?? [])];
	}
}
