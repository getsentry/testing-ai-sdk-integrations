import assert from "node:assert/strict";
import test from "node:test";
import { getProbeInputs } from "../probes/inputs.js";
import { evaluateTools } from "../evaluation/evaluators/tools.js";
import {
	evaluateModelBehavior,
	evaluateRecordedCalls,
} from "./live-evaluation.js";
import type { ResolvedVariant } from "./matrix.js";
import type { CallResult, CapturedSpan, ProbeResult } from "./types.js";

const variant: ResolvedVariant = {
	id: "variant",
	targetId: "node/llm/openai",
	identity: { frameworkVersion: "1", sentryVersion: "10", options: {} },
	modelOverrides: {},
};
const span = (
	id: string,
	data: Record<string, unknown>,
	parent = "call",
): CapturedSpan => ({
	span_id: id,
	trace_id: "trace",
	parent_span_id: parent,
	op: "gen_ai.chat",
	start_timestamp: 1,
	timestamp: 2,
	data,
});
const call = (probeId: string): CallResult => ({
	callId: `${probeId}:blocking:0`,
	mode: "blocking",
	status: "succeeded",
	tools: [],
});
const probe = (probeId: string, calls: CallResult[]): ProbeResult => ({
	probeId,
	status: "completed",
	callModes: ["blocking"],
	calls,
	spanIds: [],
	traceIds: [],
	telemetryComplete: true,
});

test("failed calls retain error/input checks but never require unexecuted calls or response fields", () => {
	const failed = call("llm.multi_turn");
	failed.status = "failed";
	failed.error = {
		kind: "provider",
		message: "unavailable",
		statusCode: 503,
		stopsVariant: true,
	};
	const notExecuted = {
		...call("llm.multi_turn"),
		callId: "llm.multi_turn:blocking:1",
		status: "not_executed" as const,
	};
	const current = probe("llm.multi_turn", [failed, notExecuted]);
	current.status = "failed";
	const spans = [
		{
			...span("call", { "test.call.id": failed.callId }),
			op: "test.assessment.call",
		},
		span("client", {
			"gen_ai.operation.name": "chat",
			"gen_ai.request.model": "model",
			"gen_ai.input.messages": [{ role: "user", content: "test" }],
			"error.type": "Unavailable",
		}),
	];
	const observations = evaluateRecordedCalls(current, variant, "llm", spans);
	assert.ok(
		observations.some(
			(item) =>
				item.capability === "provider.error" && item.state === "healthy",
		),
	);
	assert.ok(observations.some((item) => item.capability === "messages.input"));
	assert.ok(
		!observations.some((item) =>
			[
				"model.response",
				"messages.output",
				"tokens.input",
				"tokens.output",
			].includes(item.capability),
		),
	);
	assert.ok(
		!observations.some((item) =>
			item.observationId.includes(notExecuted.callId),
		),
	);
});

test("missing delivery is inconclusive rather than a capture regression", () => {
	const current = probe("llm.baseline", [call("llm.baseline")]);
	current.telemetryComplete = false;
	assert.ok(
		!evaluateRecordedCalls(current, variant, "llm", []).some(
			(item) => item.state === "missing",
		),
	);
	current.telemetryComplete = true;
	assert.ok(
		evaluateRecordedCalls(current, variant, "llm", []).some(
			(item) => item.capability === "spans.gen_ai" && item.state === "missing",
		),
	);
});

test("delivery failures do not hide missing fields on completed captured spans", () => {
	const currentCall = call("llm.baseline");
	const current = probe("llm.baseline", [currentCall]);
	current.telemetryComplete = false;
	const spans = [
		{
			...span("call", { "test.call.id": currentCall.callId }),
			op: "test.assessment.call",
		},
		span("client", { "gen_ai.operation.name": "chat" }),
	];
	assert.ok(
		evaluateRecordedCalls(current, variant, "llm", spans).some(
			(item) => item.capability === "model.request" && item.state === "missing",
		),
	);
});

test("unexpected provider success is scenario behavior, not missing error instrumentation", () => {
	const currentCall = call("llm.provider_error");
	const current = probe("llm.provider_error", [currentCall]);
	const spans = [
		{
			...span("call", { "test.call.id": currentCall.callId }),
			op: "test.assessment.call",
		},
		span("client", { "gen_ai.operation.name": "chat" }),
	];
	assert.ok(
		!evaluateRecordedCalls(current, variant, "llm", spans).some(
			(item) => item.capability === "provider.error",
		),
	);
	assert.equal(
		evaluateModelBehavior(current, "llm")[0]?.kind,
		"expected_error_not_raised",
	);
});

test("tool-call identity takes precedence over a fallback span without an id", () => {
	const currentCall = call("agent.tools_success");
	currentCall.tools = [
		{
			id: "first",
			name: "multiply",
			toolCallId: "exact",
			arguments: { a: 8, b: 4 },
			result: 32,
			status: "succeeded",
			startedAt: "2026-09-11T00:00:00Z",
		},
		{
			id: "second",
			name: "multiply",
			arguments: { a: 4, b: 8 },
			result: 32,
			status: "succeeded",
			startedAt: "2026-09-11T00:00:00Z",
		},
	];
	const tools = [
		{
			...span("fallback", {
				"gen_ai.tool.name": "multiply",
				"gen_ai.tool.call.arguments": '{"a":4,"b":8}',
				"gen_ai.tool.call.result": "32",
			}),
			op: "gen_ai.execute_tool",
		},
		{
			...span("exact", {
				"gen_ai.tool.name": "multiply",
				"gen_ai.tool.call.id": "exact",
				"gen_ai.tool.call.arguments": '{"a":8,"b":4}',
				"gen_ai.tool.call.result": "32",
			}),
			op: "gen_ai.execute_tool",
		},
	];
	const observations = evaluateTools(
		probe("agent.tools_success", [currentCall]),
		variant.id,
		tools,
		getProbeInputs("agents")["agent.tools_success"],
	);
	assert.deepEqual(
		observations
			.filter((item) => item.capability === "tools.arguments")
			.map((item) => item.state),
		["healthy", "healthy"],
	);
});

for (const args of [
	{ a: 4, b: 8 },
	{ "a:": 8, b: 4 },
]) {
	test(`checks captured tool arguments against execution, not the model prompt: ${JSON.stringify(args)}`, () => {
		const currentCall = call("agent.tools_success");
		currentCall.tools.push({
			id: "tool-1",
			name: "multiply",
			arguments: args,
			result: 32,
			status: "succeeded",
			startedAt: "2026-09-11T00:00:00Z",
		});
		const current = probe("agent.tools_success", [currentCall]);
		const input = getProbeInputs("agents")[current.probeId];
		const tool = {
			...span("tool", {
				"gen_ai.tool.name": "multiply",
				"gen_ai.tool.call.arguments": JSON.stringify(args),
				"gen_ai.tool.call.result": "32",
			}),
			op: "gen_ai.execute_tool",
		};
		const observations = evaluateTools(current, variant.id, [tool], input);
		assert.equal(
			observations.find((item) => item.capability === "tools.arguments")?.state,
			"healthy",
		);
		assert.equal(
			observations.find((item) => item.capability === "tools.result")?.state,
			"healthy",
		);
		assert.ok(
			evaluateModelBehavior(current, "agents").some(
				(item) => item.kind === "arguments_differ",
			),
		);
	});
}

test("does not normalize distinct paths or hide telemetry corruption", () => {
	const currentCall = call("agent.tool_error");
	currentCall.tools.push({
		id: "tool-1",
		name: "read_file",
		arguments: { path: "./nonexistent/file.txt" },
		status: "failed",
		error: "not found",
		startedAt: "2026-09-11T00:00:00Z",
	});
	const current = probe("agent.tool_error", [currentCall]);
	const tool = {
		...span("tool", {
			"gen_ai.tool.name": "read_file",
			"gen_ai.tool.call.arguments": JSON.stringify({
				path: "/nonexistent/file.txt",
			}),
		}),
		op: "gen_ai.execute_tool",
	};
	const observations = evaluateTools(
		current,
		variant.id,
		[tool],
		getProbeInputs("agents")[current.probeId],
	);
	assert.equal(
		observations.find((item) => item.capability === "tools.arguments")?.state,
		"malformed",
	);
	assert.equal(
		observations.find((item) => item.capability === "tools.error")?.state,
		"missing",
	);
});

test("checks repeated tool executions and reports unmatched spans", () => {
	const currentCall = call("agent.tools_success");
	for (let index = 0; index < 2; index++)
		currentCall.tools.push({
			id: `tool-${index}`,
			name: "multiply",
			arguments: { a: 8, b: 4 },
			result: 32,
			status: "succeeded",
			startedAt: "2026-09-11T00:00:00Z",
		});
	const current = probe("agent.tools_success", [currentCall]);
	const tools = [
		{
			...span("first", {
				"gen_ai.tool.name": "multiply",
				"gen_ai.tool.call.arguments": '{"a":8,"b":4}',
				"gen_ai.tool.call.result": "32",
			}),
			op: "gen_ai.execute_tool",
		},
		{
			...span("second", {
				"gen_ai.tool.name": "multiply",
				"gen_ai.tool.call.arguments": '{"a":8,"b":99}',
				"gen_ai.tool.call.result": "32",
			}),
			op: "gen_ai.execute_tool",
		},
		{
			...span("orphan", { "gen_ai.tool.name": "unknown" }),
			op: "gen_ai.execute_tool",
		},
	];
	const observations = evaluateTools(
		current,
		variant.id,
		tools,
		getProbeInputs("agents")[current.probeId],
	);
	assert.deepEqual(
		observations
			.filter((item) => item.capability === "tools.arguments")
			.map((item) => item.state),
		["healthy", "malformed"],
	);
	assert.ok(
		observations.some(
			(item) =>
				item.capability === "tools.execution" && item.state === "malformed",
		),
	);
});
