import assert from "node:assert/strict";
import test from "node:test";
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
