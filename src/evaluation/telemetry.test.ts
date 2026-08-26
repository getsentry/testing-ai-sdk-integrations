import assert from "node:assert/strict";
import test from "node:test";
import type { Observation, ProbeResult } from "../assessment/types.js";
import { findingFromObservation } from "./findings.js";
import type { CapturedSpan } from "../assessment/types.js";
import {
	evaluateConventions,
	evaluateProbeTelemetry,
	evaluateUnassignedSpans,
} from "./evaluators/telemetry.js";

const probe = (probeId: string): ProbeResult => ({
	probeId,
	status: "completed",
	callModes: ["blocking"],
	traceIds: ["trace"],
	spanIds: [],
});

function span(
	spanId: string,
	data: Record<string, unknown>,
	overrides: Partial<CapturedSpan> = {},
): CapturedSpan {
	return {
		span_id: spanId,
		trace_id: "trace",
		op: "gen_ai.chat",
		description: "chat gpt-4o-mini",
		start_timestamp: 1,
		timestamp: 2,
		data,
		...overrides,
	};
}

const client = (spanId = "client", overrides: Partial<CapturedSpan> = {}) =>
	span(
		spanId,
		{
			"gen_ai.operation.name": "chat",
			"gen_ai.request.model": "gpt-4o-mini",
			"gen_ai.usage.input_tokens": 10,
			"gen_ai.usage.output_tokens": 5,
			"gen_ai.usage.total_tokens": 15,
			"gen_ai.input.messages": JSON.stringify([
				{ role: "user", content: "Hello" },
			]),
		},
		overrides,
	);

function states(observations: ReturnType<typeof evaluateProbeTelemetry>) {
	return new Map(observations.map((item) => [item.capability, item.state]));
}

function requireObservation(observation: Observation | undefined): Observation {
	assert.ok(observation, "Expected an observation");
	return observation;
}

function severity(observation: Observation | undefined) {
	return findingFromObservation(requireObservation(observation))?.severity;
}

test("evaluates tokens, operation names, and span descriptions", () => {
	const result = states(
		evaluateProbeTelemetry(
			probe("llm.baseline"),
			"variant",
			"llm",
			[client()],
			{ calls: [] },
		),
	);
	assert.equal(result.get("tokens.input"), "healthy");
	assert.equal(result.get("tokens.output"), "healthy");
	assert.equal(result.get("tokens.total"), "healthy");
	assert.equal(result.get("operations"), "healthy");
	assert.equal(result.get("spans.description"), "healthy");

	const noTotal = client("no-total", {
		data: {
			"gen_ai.operation.name": "chat",
			"gen_ai.request.model": "gpt-4o-mini",
			"gen_ai.usage.input_tokens": 10,
			"gen_ai.usage.output_tokens": 5,
		},
	});
	const total = evaluateProbeTelemetry(
		probe("llm.baseline"),
		"variant",
		"llm",
		[noTotal],
		{ calls: [] },
	).find((item) => item.capability === "tokens.total");
	assert.equal(total?.state, "missing");
	assert.equal(severity(total), "minor");

	const generated = client("generated", {
		data: { ...client().data, "gen_ai.operation.name": "generate_content" },
		description: "generate_content gpt-4o-mini",
	});
	assert.equal(
		states(
			evaluateProbeTelemetry(
				probe("agent.baseline"),
				"variant",
				"agents",
				[generated],
				{ calls: [] },
			),
		).get("operations"),
		"healthy",
	);
});

test("evaluates agent hierarchy, tool definitions, results, and errors", () => {
	const agent = span(
		"agent",
		{
			"gen_ai.operation.name": "invoke_agent",
			"gen_ai.agent.name": "assistant",
		},
		{ op: "gen_ai.invoke_agent", description: "invoke_agent assistant" },
	);
	const toolClient = client("tool-client", {
		parent_span_id: "agent",
		data: {
			...client().data,
			"gen_ai.agent.name": "assistant",
			"gen_ai.tool.definitions": JSON.stringify([
				{ name: "add", description: "Add", parameters: {} },
			]),
		},
	});
	const tool = span(
		"tool",
		{
			"gen_ai.operation.name": "execute_tool",
			"gen_ai.agent.name": "assistant",
			"gen_ai.tool.name": "add",
			"gen_ai.tool.call.arguments": JSON.stringify({ b: 5, a: 3 }),
			"gen_ai.tool.call.result": "8",
		},
		{
			op: "gen_ai.execute_tool",
			parent_span_id: "agent",
			description: "execute_tool add",
		},
	);
	const success = states(
		evaluateProbeTelemetry(
			probe("agent.tools_success"),
			"variant",
			"agents",
			[agent, toolClient, tool],
			{
				calls: [],
				tools: [
					{
						name: "add",
						description: "Add",
						parameters: {},
						arguments: { a: 3, b: 5 },
						result: 8,
					},
				],
			},
		),
	);
	assert.equal(success.get("agent.hierarchy"), "healthy");
	assert.equal(success.get("tools.definition"), "healthy");
	assert.equal(success.get("tools.description"), "healthy");
	assert.equal(success.get("tools.parameters"), "healthy");
	assert.equal(success.get("tools.execution"), "healthy");
	assert.equal(success.get("tools.arguments"), "healthy");
	assert.equal(success.get("tools.result"), "healthy");

	for (const deprecatedOutput of [
		"8",
		JSON.stringify({ type: "tool-result", output: 8 }),
	]) {
		const legacyResult = evaluateProbeTelemetry(
			probe("agent.tools_success"),
			"variant",
			"agents",
			[
				agent,
				toolClient,
				{
					...tool,
					data: {
						...tool.data,
						"gen_ai.tool.call.result": undefined,
						"gen_ai.tool.output": deprecatedOutput,
					},
				},
			],
			{
				calls: [],
				tools: [
					{
						name: "add",
						description: "Add",
						parameters: {},
						arguments: { a: 3, b: 5 },
						result: 8,
					},
				],
			},
		).find((item) => item.capability === "tools.result");
		assert.equal(legacyResult?.state, "legacy");
		assert.equal(legacyResult?.source, "legacy");
		assert.equal(legacyResult?.actual, 8);
		assert.equal(legacyResult?.evidence[0]?.attribute, "gen_ai.tool.output");
		assert.equal(severity(legacyResult), "minor");
	}

	const malformed = states(
		evaluateProbeTelemetry(
			probe("agent.tools_success"),
			"variant",
			"agents",
			[
				agent,
				client("malformed-tool-client", {
					parent_span_id: "agent",
					data: {
						...client().data,
						"gen_ai.tool.definitions": JSON.stringify([
							{ name: "add", description: "Wrong", parameters: {} },
						]),
					},
				}),
				{
					...tool,
					data: {
						...tool.data,
						"gen_ai.tool.call.arguments": JSON.stringify({ a: 4 }),
					},
				},
			],
			{
				calls: [],
				tools: [
					{
						name: "add",
						description: "Add",
						parameters: {},
						arguments: { a: 3 },
						result: 8,
					},
				],
			},
		),
	);
	assert.equal(malformed.get("tools.description"), "malformed");
	assert.equal(malformed.get("tools.arguments"), "malformed");

	const errorTool = {
		...tool,
		data: {
			...tool.data,
			"gen_ai.tool.name": "read_file",
			"gen_ai.tool.call.arguments": undefined,
			"gen_ai.tool.input": JSON.stringify({ a: 3 }),
		},
		description: "execute_tool read_file",
		status: "internal_error",
	};
	const failure = states(
		evaluateProbeTelemetry(
			probe("agent.tool_error"),
			"variant",
			"agents",
			[agent, errorTool],
			{
				calls: [],
				tools: [
					{
						name: "read_file",
						description: "Read",
						parameters: {},
						arguments: { a: 3 },
						error: "missing",
					},
				],
			},
		),
	);
	assert.equal(failure.get("tools.arguments"), "healthy");
	assert.equal(failure.get("tools.error"), "healthy");
});

test("evaluates provider errors, conversation IDs, and long-input trimming", () => {
	const failed = client("failed", {
		status: "internal_error",
		data: { ...client().data, "error.type": "ProviderError" },
	});
	const providerError = states(
		evaluateProbeTelemetry(
			probe("llm.provider_error"),
			"variant",
			"llm",
			[failed],
			{ calls: [], expectError: true },
		),
	);
	assert.equal(providerError.get("provider.error"), "healthy");
	assert.equal(providerError.has("tokens.input"), false);

	const conversationA = client("a", {
		data: { ...client().data, "gen_ai.conversation.id": "a" },
	});
	const conversationB = client("b", {
		start_timestamp: 2,
		data: { ...client().data, "gen_ai.conversation.id": "b" },
	});
	assert.equal(
		states(
			evaluateProbeTelemetry(
				probe("llm.conversation"),
				"variant",
				"llm",
				[conversationA, conversationB],
				{
					calls: [
						{ model: "gpt-4o-mini", messages: [], conversationId: "a" },
						{ model: "gpt-4o-mini", messages: [], conversationId: "b" },
					],
				},
			),
		).get("conversation.id"),
		"healthy",
	);

	const trimmed = client("trimmed", {
		data: {
			...client().data,
			"gen_ai.input.messages": JSON.stringify([
				{ role: "user", content: "short" },
			]),
		},
	});
	assert.equal(
		states(
			evaluateProbeTelemetry(
				probe("llm.long_input"),
				"variant",
				"llm",
				[trimmed],
				{
					calls: [],
					originalInputBytes: 1_000,
				},
			),
		).get("input.trimming"),
		"healthy",
	);
});

test("uses the assessment severity contract", () => {
	const invalidOperation = client("invalid-operation", {
		data: { ...client().data, "gen_ai.operation.name": "invalid" },
		description: "invalid gpt-4o-mini",
	});
	const operation = evaluateProbeTelemetry(
		probe("llm.baseline"),
		"variant",
		"llm",
		[invalidOperation],
		{ calls: [] },
	).find((item) => item.capability === "operations");
	assert.equal(severity(operation), "critical");

	const badDescription = client("bad-description", { description: "wrong" });
	const description = evaluateProbeTelemetry(
		probe("llm.baseline"),
		"variant",
		"llm",
		[badDescription],
		{ calls: [] },
	).find((item) => item.capability === "spans.description");
	assert.equal(severity(description), "minor");

	const untrimmed = evaluateProbeTelemetry(
		probe("llm.long_input"),
		"variant",
		"llm",
		[client("untrimmed")],
		{ calls: [], originalInputBytes: 1 },
	).find((item) => item.capability === "input.trimming");
	assert.equal(severity(untrimmed), "minor");

	const agent = span(
		"agent",
		{
			"gen_ai.operation.name": "invoke_agent",
			"gen_ai.agent.name": "assistant",
		},
		{ op: "gen_ai.invoke_agent", description: "invoke_agent assistant" },
	);
	const hierarchy = evaluateProbeTelemetry(
		probe("agent.baseline"),
		"variant",
		"agents",
		[agent, client("orphan")],
		{ calls: [] },
	).find(
		(item) =>
			item.capability === "agent.hierarchy" && item.state === "malformed",
	);
	assert.equal(severity(hierarchy), "major");

	const unknown = evaluateConventions("variant", [
		client("unknown", {
			data: { ...client().data, "gen_ai.not_a_convention": true },
		}),
	]).find((item) => item.capability === "conventions.unknown");
	assert.equal(severity(unknown), "info");

	const missingDefinition = evaluateProbeTelemetry(
		probe("agent.tools_success"),
		"variant",
		"agents",
		[agent, client("tool-client", { parent_span_id: "agent" })],
		{
			calls: [],
			tools: [
				{
					name: "add",
					description: "Add",
					parameters: {},
					arguments: { a: 3 },
					result: 8,
				},
			],
		},
	).find((item) => item.capability === "tools.definition");
	assert.equal(severity(missingDefinition), "minor");

	const incompleteDefinition = evaluateProbeTelemetry(
		probe("agent.tools_success"),
		"variant",
		"agents",
		[
			agent,
			client("parameters-client", {
				parent_span_id: "agent",
				data: {
					...client().data,
					"gen_ai.tool.definitions": JSON.stringify([{ name: "add" }]),
				},
			}),
		],
		{
			calls: [],
			tools: [
				{
					name: "add",
					description: "Add",
					parameters: {},
					arguments: { a: 3 },
					result: 8,
				},
			],
		},
	);
	const missingDescription = incompleteDefinition.find(
		(item) => item.capability === "tools.description",
	);
	const missingParameters = incompleteDefinition.find(
		(item) => item.capability === "tools.parameters",
	);
	assert.equal(severity(missingDescription), "minor");
	assert.equal(severity(missingParameters), "major");

	const missingToolData = evaluateProbeTelemetry(
		probe("agent.tools_success"),
		"variant",
		"agents",
		[
			agent,
			span(
				"tool-without-result",
				{
					"gen_ai.operation.name": "execute_tool",
					"gen_ai.tool.name": "add",
				},
				{
					op: "gen_ai.execute_tool",
					parent_span_id: "agent",
					description: "execute_tool add",
				},
			),
		],
		{
			calls: [],
			tools: [
				{
					name: "add",
					description: "Add",
					parameters: {},
					arguments: { a: 3 },
					result: 8,
				},
			],
		},
	);
	const missingArguments = missingToolData.find(
		(item) => item.capability === "tools.arguments",
	);
	const missingResult = missingToolData.find(
		(item) => item.capability === "tools.result",
	);
	assert.equal(severity(missingArguments), "major");
	assert.equal(severity(missingResult), "major");
});

test("blocks dependent agent observations when no GenAI span exists", () => {
	const observations = evaluateProbeTelemetry(
		probe("agent.baseline"),
		"variant",
		"agents",
		[],
		{ calls: [] },
	);
	assert.deepEqual(
		observations.map((item) => item.state),
		["blocked"],
	);
	assert.equal(
		findingFromObservation(requireObservation(observations[0])),
		undefined,
	);
});

test("maps every degraded evaluator outcome to a finding", () => {
	const degraded = [
		...evaluateProbeTelemetry(
			probe("llm.provider_error"),
			"variant",
			"llm",
			[],
			{ calls: [] },
		),
		...evaluateProbeTelemetry(probe("llm.long_input"), "variant", "llm", [], {
			calls: [],
			originalInputBytes: 1_000,
		}),
		...evaluateProbeTelemetry(
			probe("agent.tools_success"),
			"variant",
			"agents",
			[],
			{
				calls: [],
				tools: [
					{
						name: "add",
						description: "Add",
						parameters: {},
						arguments: { a: 3 },
						result: 8,
					},
				],
			},
		),
		...evaluateUnassignedSpans("variant", [client("unassigned")]),
	];
	for (const item of degraded.filter(
		(item) => item.state !== "healthy" && item.state !== "blocked",
	)) {
		assert.ok(
			findingFromObservation(item),
			`${item.capability} should create a finding`,
		);
	}
});

test("reports deprecated and unknown conventions and unassigned spans", () => {
	const telemetry = client("conventions", {
		data: {
			...client().data,
			"gen_ai.request.messages": "[]",
			"gen_ai.not_a_convention": true,
		},
	});
	const conventions = evaluateConventions("variant", [telemetry]);
	assert.ok(
		conventions.some((item) => item.capability === "conventions.deprecated"),
	);
	assert.ok(
		conventions.some((item) => item.capability === "conventions.unknown"),
	);
	assert.equal(
		evaluateUnassignedSpans("variant", [telemetry])[0]?.state,
		"missing",
	);
	assert.equal(evaluateUnassignedSpans("variant", [])[0]?.state, "healthy");
});
