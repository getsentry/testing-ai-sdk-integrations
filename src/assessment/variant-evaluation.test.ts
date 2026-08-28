import assert from "node:assert/strict";
import test from "node:test";
import { evaluateClientSpans } from "../evaluation/evaluators/spans.js";
import type { CapturedSpan, ProbeResult } from "./types.js";
import { evaluateVariant } from "./variant-evaluation.js";

function client(spanId: string, parentSpanId = "root"): CapturedSpan {
	return {
		span_id: spanId,
		trace_id: "trace",
		parent_span_id: parentSpanId,
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

function assessmentCall(
	spanId: string,
	callId: string,
	mode: "blocking" | "streaming",
): CapturedSpan {
	return {
		span_id: spanId,
		trace_id: "trace",
		parent_span_id: "root",
		op: "test.assessment.call",
		description: callId,
		start_timestamp: 1.05,
		timestamp: 1.95,
		data: {
			"test.probe.id": callId.split(":", 1)[0],
			"test.call.id": callId,
			"test.call.mode": mode,
		},
	};
}

test("allows multiple client spans for an agent tool loop", () => {
	const toolProbe: ProbeResult = {
		probeId: "agent.tools_success",
		status: "completed",
		callModes: ["blocking"],
		traceIds: ["trace"],
		spanIds: [],
	};
	const result = evaluateClientSpans(
		toolProbe,
		"variant",
		[
			assessmentCall("tool-call", "agent.tools_success:blocking:0", "blocking"),
			client("tool-client-1", "tool-call"),
			client("tool-client-2", "tool-call"),
		],
		[
			{
				assessmentCallId: "agent.tools_success:blocking:0",
				assessmentCallMode: "blocking",
				allowsMultipleClientSpans: true,
			},
		],
	);

	assert.equal(result.observations[0]?.state, "healthy");
});

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
			assessmentCall("blocking-call", "llm.baseline:blocking:0", "blocking"),
			assessmentCall("streaming-call", "llm.baseline:streaming:0", "streaming"),
			client("blocking", "blocking-call"),
			client("streaming", "streaming-call"),
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

test("requires exactly one client span for each call mode", () => {
	const probe: ProbeResult = {
		probeId: "llm.baseline",
		status: "completed",
		callModes: ["blocking", "streaming"],
		traceIds: ["trace"],
		spanIds: [],
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
			modelOverrides: {},
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
			assessmentCall("blocking-call", "llm.baseline:blocking:0", "blocking"),
			assessmentCall("streaming-call", "llm.baseline:streaming:0", "streaming"),
			client("blocking-1", "blocking-call"),
			client("blocking-2", "blocking-call"),
		],
		runtimeFailures: [],
	});

	const cardinality = assessment.observations.filter(
		(observation) => observation.capability === "spans.client",
	);
	assert.deepEqual(
		cardinality.map((observation) => [
			(observation.actual as { mode: string }).mode,
			observation.state,
		]),
		[
			["blocking", "malformed"],
			["streaming", "missing"],
		],
	);
	assert.ok(
		assessment.findings.some(
			(finding) => finding.findingId === "spans.client.malformed",
		),
	);
	assert.ok(
		assessment.findings.some(
			(finding) => finding.findingId === "spans.client.missing",
		),
	);
});

test("ignores internal AI spans when evaluating client telemetry", () => {
	const probe: ProbeResult = {
		probeId: "agent.baseline",
		status: "completed",
		callModes: ["blocking"],
		traceIds: ["trace"],
		spanIds: ["root", "agent-call", "agent", "client", "internal"],
	};
	const clientSpan = client("client", "agent");
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
			assessmentCall("agent-call", "agent.baseline:blocking:0", "blocking"),
			{
				span_id: "agent",
				trace_id: "trace",
				parent_span_id: "agent-call",
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
