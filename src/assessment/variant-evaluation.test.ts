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

test("does not treat an agent span as a client span", () => {
	const probe: ProbeResult = {
		probeId: "agent.baseline",
		status: "completed",
		callModes: ["blocking"],
		traceIds: ["trace"],
		spanIds: ["root", "agent"],
	};
	const assessment = evaluateVariant({
		variant: {
			id: "variant",
			targetId: "node/agents/openai-agents",
			identity: {
				frameworkVersion: "latest",
				sentryVersion: "latest",
				options: {},
			},
			modelOverrides: {},
		},
		category: "agents",
		probes: [probe],
		spans: [
			{
				span_id: "root",
				trace_id: "trace",
				op: "test.assessment",
				start_timestamp: 1,
				timestamp: 2,
				data: { "test.probe.id": "agent.baseline" },
			},
			{
				span_id: "agent",
				trace_id: "trace",
				parent_span_id: "root",
				op: "gen_ai.agent",
				description: "workflow",
				start_timestamp: 1.1,
				timestamp: 1.9,
				data: { "gen_ai.operation.name": "ai.run.workflow" },
			},
		],
		runtimeFailures: [],
	});

	assert.equal(
		assessment.observations.find(
			(observation) => observation.capability === "spans.client",
		)?.state,
		"missing",
	);
	for (const capability of [
		"model.request",
		"model.response",
		"messages.input",
		"messages.output",
	]) {
		assert.equal(
			assessment.observations.find(
				(observation) => observation.capability === capability,
			)?.state,
			"blocked",
		);
	}
});

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

test("ignores internal AI spans when evaluating client telemetry", () => {
	const probe: ProbeResult = {
		probeId: "agent.baseline",
		status: "completed",
		callModes: ["blocking"],
		traceIds: ["trace"],
		spanIds: ["root", "agent", "client", "internal"],
	};
	const clientSpan = client("client");
	clientSpan.parent_span_id = "agent";
	clientSpan.data = {
		...clientSpan.data,
		"gen_ai.agent.name": "Assessment Agent",
		"gen_ai.usage.total_tokens": 5,
	};
	const assessment = evaluateVariant({
		variant: {
			id: "variant",
			targetId: "node/agents/mastra",
			identity: {
				frameworkVersion: "latest",
				sentryVersion: "latest",
				options: {},
			},
			modelOverrides: {},
		},
		category: "agents",
		probes: [probe],
		spans: [
			{
				span_id: "root",
				trace_id: "trace",
				op: "test.assessment",
				start_timestamp: 1,
				timestamp: 2,
				data: { "test.probe.id": "agent.baseline" },
			},
			{
				span_id: "agent",
				trace_id: "trace",
				parent_span_id: "root",
				op: "gen_ai.invoke_agent",
				description: "invoke_agent Assessment Agent",
				start_timestamp: 1.05,
				timestamp: 1.3,
				data: {
					"gen_ai.operation.name": "invoke_agent",
					"gen_ai.agent.name": "Assessment Agent",
				},
			},
			clientSpan,
			{
				span_id: "internal",
				trace_id: "trace",
				parent_span_id: "client",
				op: "ai.span",
				description: "model_inference Assessment Agent",
				start_timestamp: 1.15,
				timestamp: 1.2,
				data: {
					"gen_ai.operation.name": "model_inference",
					"mastra.span.type": "model_inference",
				},
			},
		],
		runtimeFailures: [],
	});

	for (const capability of [
		"model.request",
		"model.response",
		"messages.input",
		"messages.output",
	]) {
		const observations = assessment.observations.filter(
			(observation) => observation.capability === capability,
		);
		assert.equal(observations.length, 1);
		assert.equal(observations[0]?.state, "healthy");
	}
	assert.equal(
		assessment.observations.some((observation) =>
			observation.evidence.some((item) => item.spanId === "internal"),
		),
		false,
	);
});
