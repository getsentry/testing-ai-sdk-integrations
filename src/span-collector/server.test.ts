import assert from "node:assert/strict";
import test from "node:test";
import { partitionSpansByProbe } from "../assessment/partition.js";
import { SpanCollector } from "./server.js";

async function postEnvelope(dsn: string, body: string): Promise<Response> {
	const url = URL.parse(dsn);
	if (!url) throw new Error(`Invalid collector DSN: ${dsn}`);
	return fetch(`${url.origin}${url.pathname}/envelope/`, {
		method: "POST",
		body,
		headers: { "content-type": "application/x-sentry-envelope" },
	});
}

test("collects and assigns Python transaction roots with ISO timestamps", async () => {
	const collector = new SpanCollector();
	await collector.start();
	try {
		const runId = "python-collector-test";
		collector.registerRun(runId);
		const dsn = collector.getDsn(runId);
		const transaction = [
			JSON.stringify({ event_id: "python-event" }),
			JSON.stringify({ type: "transaction" }),
			JSON.stringify({
				type: "transaction",
				transaction: "llm.baseline",
				contexts: {
					trace: {
						span_id: "python-root",
						trace_id: "python-trace",
						op: "test.assessment",
						data: { "test.probe.id": "llm.baseline" },
					},
				},
				start_timestamp: "2026-08-27T05:35:38.442666Z",
				timestamp: "2026-08-27T05:35:38.443051Z",
				spans: [],
			}),
		].join("\n");
		const transactionResponse = await postEnvelope(dsn, transaction);
		assert.equal(transactionResponse.status, 200);

		const spanV2 = [
			JSON.stringify({ event_id: "python-span-event" }),
			JSON.stringify({
				type: "span",
				content_type: "application/vnd.sentry.items.span.v2+json",
			}),
			JSON.stringify({
				version: 2,
				items: [
					{
						span_id: "python-child",
						trace_id: "python-trace",
						parent_span_id: "python-root",
						name: "chat model",
						start_timestamp: 1,
						end_timestamp: 2,
						attributes: {
							"sentry.op": { type: "string", value: "gen_ai.chat" },
						},
					},
				],
			}),
		].join("\n");
		const spanResponse = await postEnvelope(dsn, spanV2);
		assert.equal(spanResponse.status, 200);

		const spans = collector.getSpans(runId);
		const root = spans.find((span) => span.span_id === "python-root");
		assert.equal(
			root?.start_timestamp,
			Date.parse("2026-08-27T05:35:38.442666Z") / 1_000,
		);
		assert.equal(
			root?.timestamp,
			Date.parse("2026-08-27T05:35:38.443051Z") / 1_000,
		);
		assert.deepEqual(
			partitionSpansByProbe(spans)
				.byProbe.get("llm.baseline")
				?.map((span) => span.span_id)
				.sort((left, right) => left.localeCompare(right)),
			["python-child", "python-root"],
		);
	} finally {
		await collector.stop();
	}
});

test("collects transaction and span-v2 envelope items for a registered run", async () => {
	const collector = new SpanCollector();
	await collector.start();
	try {
		const runId = "collector-test";
		collector.registerRun(runId);
		const dsn = collector.getDsn(runId);
		const transaction = [
			JSON.stringify({ event_id: "event" }),
			JSON.stringify({ type: "transaction" }),
			JSON.stringify({
				span_id: "root",
				trace_id: "trace",
				start_timestamp: 1,
				timestamp: 2,
				spans: [
					{
						span_id: "child",
						trace_id: "trace",
						parent_span_id: "root",
						start_timestamp: 1.1,
						timestamp: 1.9,
						data: { "gen_ai.operation.name": "chat" },
					},
				],
			}),
		].join("\n");
		const response = await postEnvelope(dsn, transaction);
		assert.equal(response.status, 200);
		const spanV2 = [
			JSON.stringify({ event_id: "span-event" }),
			JSON.stringify({
				type: "span",
				content_type: "application/vnd.sentry.items.span.v2+json",
			}),
			JSON.stringify({
				version: 2,
				items: [
					{
						span_id: "v2",
						trace_id: "trace-v2",
						name: "chat model",
						start_timestamp: 3,
						end_timestamp: 4,
						attributes: {
							"sentry.op": { type: "string", value: "gen_ai.chat" },
						},
					},
				],
			}),
		].join("\n");
		const spanResponse = await postEnvelope(dsn, spanV2);
		assert.equal(spanResponse.status, 200);
		assert.deepEqual(
			collector
				.getSpans(runId)
				.map((span) => span.span_id)
				.sort((left, right) => left.localeCompare(right)),
			["child", "root", "v2"],
		);

		const malformed = await postEnvelope(dsn, "not-json");
		assert.equal(malformed.status, 200);
		assert.match(
			collector.getFailures(runId)[0]?.message ?? "",
			/envelope header/i,
		);
	} finally {
		await collector.stop();
	}
});
