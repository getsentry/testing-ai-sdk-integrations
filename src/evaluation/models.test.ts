import assert from "node:assert/strict";
import test from "node:test";
import type { CapturedSpan, ProbeResult } from "../assessment/types.js";
import { evaluateModels } from "./evaluators/models.js";

const probe: ProbeResult = {
	probeId: "llm.baseline",
	status: "completed",
	callModes: ["blocking"],
	traceIds: [],
	spanIds: [],
};

function clientSpan(responseModel: string): CapturedSpan {
	return {
		span_id: "client",
		trace_id: "trace",
		op: "gen_ai.chat",
		start_timestamp: 1,
		timestamp: 2,
		data: {
			"gen_ai.request.model": "gemini-2.5-flash-lite",
			"gen_ai.response.model": responseModel,
		},
	};
}

function responseState(actual: string, expected: string) {
	return evaluateModels(probe, "variant", clientSpan(actual), {
		response: expected,
	}).find((observation) => observation.capability === "model.response")?.state;
}

test("model expectations support wildcard suffixes", () => {
	assert.equal(
		responseState("gemini-2.5-flash-lite-001", "gemini-2.5-flash-lite*"),
		"healthy",
	);
});

test("model expectations support multiple wildcards", () => {
	assert.equal(
		responseState("anthropic/claude-haiku-4-5-20251001", "*/claude-*-2025*"),
		"healthy",
	);
});

test("model expectations still reject nonmatching models", () => {
	assert.equal(
		responseState("gemini-2.0-flash", "gemini-2.5-flash-lite*"),
		"malformed",
	);
	assert.equal(responseState("gpt-4o-mini-2024", "gpt-4o-mini"), "malformed");
});
