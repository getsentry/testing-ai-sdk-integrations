import assert from "node:assert/strict";
import test from "node:test";
import type { CapturedSpan, ProbeResult } from "./types.js";
import { evaluateVariant } from "./variant-evaluation.js";

function client(spanId: string): CapturedSpan {
	return {
		span_id: spanId,
		trace_id: "trace",
		parent_span_id: "root",
		op: "gen_ai.chat",
		description: "chat gpt-4o-mini",
		start_timestamp: spanId === "blocking" ? 1.1 : 1.2,
		timestamp: spanId === "blocking" ? 1.15 : 1.25,
		data: {
			"gen_ai.operation.name": "chat",
			"gen_ai.request.model": "gpt-4o-mini",
			"gen_ai.response.model": "gpt-4o-mini",
			"gen_ai.usage.input_tokens": 2,
			"gen_ai.usage.output_tokens": 3,
			"gen_ai.input.messages": [{ role: "user", content: "hello" }],
			"gen_ai.output.messages": [{ role: "assistant", content: "hello" }],
		},
	};
}

test("evaluates model and message telemetry for both call modes", () => {
	const probe: ProbeResult = {
		probeId: "llm.baseline",
		status: "completed",
		callModes: ["blocking", "streaming"],
		traceIds: ["trace"],
		spanIds: ["root", "blocking", "streaming"],
	};
	const assessment = evaluateVariant({
		variant: {
			id: "variant",
			targetId: "node/llm/openai",
			identity: {
				frameworkVersion: "latest",
				sentryVersion: "latest",
				options: {},
			},
			modelOverrides: {
				request: "gpt-4o-mini",
				response: "gpt-4o-mini",
			},
		},
		category: "llm",
		probes: [probe],
		spans: [
			{
				span_id: "root",
				trace_id: "trace",
				op: "test.assessment",
				start_timestamp: 1,
				timestamp: 2,
				data: { "test.probe.id": "llm.baseline" },
			},
			client("blocking"),
			client("streaming"),
		],
		runtimeFailures: [],
	});

	for (const capability of [
		"model.request",
		"model.response",
		"messages.input",
		"messages.output",
	]) {
		assert.equal(
			assessment.observations.filter(
				(observation) => observation.capability === capability,
			).length,
			2,
		);
	}
});
