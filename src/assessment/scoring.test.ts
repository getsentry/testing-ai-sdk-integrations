import assert from "node:assert/strict";
import test from "node:test";
import { classifyScore, scoreVariant } from "./scoring.js";
import type {
	AssessmentCategory,
	Finding,
	Observation,
	ProbeResult,
	VariantAssessment,
} from "./types.js";

function observation(
	capability: string,
	state: Observation["state"] = "healthy",
	observationId = capability,
): Observation {
	return {
		observationId,
		capability,
		state,
		probeId: "llm.baseline",
		variantId: "variant",
		evidence: [],
	};
}

function finding(
	capability: string,
	severity: Finding["severity"],
	observationId = capability,
): Finding {
	return {
		findingId: `${capability}.finding`,
		capability,
		severity,
		title: "Finding",
		description: "Finding description",
		occurrences: [
			{
				variantId: "variant",
				probeId: "llm.baseline",
				observationIds: [observationId],
				evidence: [],
			},
		],
	};
}

function probe(
	probeId: string,
	status: ProbeResult["status"] = "completed",
): ProbeResult {
	return {
		probeId,
		status,
		callModes: ["blocking", "streaming"],
		traceIds: [],
		spanIds: [],
	};
}

function assessment(
	observations: Observation[],
	findings: Finding[] = [],
	options: {
		completion?: VariantAssessment["completion"];
		category?: AssessmentCategory;
		probes?: ProbeResult[];
	} = {},
) {
	return {
		id: "variant",
		completion: options.completion ?? "complete",
		observations,
		findings,
		probes: options.probes ?? [probe("llm.baseline")],
		category: options.category ?? "llm",
	};
}

test("healthy domains score 100", () => {
	const score = scoreVariant(
		assessment([observation("model.request"), observation("model.response")]),
	);
	assert.equal(score, 100);
	assert.equal(classifyScore(score, "complete"), "all_good");
});

test("repeated healthy span observations do not dilute a finding", () => {
	const observations = Array.from({ length: 500 }, (_, index) =>
		observation("model.request", "healthy", `model.request:${index}`),
	);
	observations.push(
		observation(
			"conventions.unknown",
			"malformed",
			"conventions.unknown:attribute",
		),
	);
	const score = scoreVariant(
		assessment(observations, [
			finding("conventions.unknown", "info", "conventions.unknown:attribute"),
		]),
	);
	assert.equal(score, 95);
});

test("independent minor domains cap the score at 90", () => {
	const observations = [
		observation("tools.definition", "missing"),
		observation("input.trimming", "malformed"),
		observation("conventions.deprecated", "legacy"),
	];
	const findings = [
		finding("tools.definition", "minor"),
		finding("input.trimming", "minor"),
		finding("conventions.deprecated", "minor"),
	];
	const score = scoreVariant(
		assessment(observations, findings, {
			category: "agents",
			probes: [
				probe("agent.baseline"),
				probe("agent.tools_success"),
				probe("agent.tool_error"),
				probe("agent.conversation"),
				probe("agent.long_input"),
			],
		}),
	);
	assert.equal(score, 90);
});

test("major and critical findings apply score ceilings", () => {
	const majorScore = scoreVariant(
		assessment(
			[observation("tools.arguments", "malformed")],
			[finding("tools.arguments", "major")],
			{
				category: "agents",
				probes: [probe("agent.tools_success")],
			},
		),
	);
	assert.equal(majorScore, 75);

	const criticalScore = scoreVariant(
		assessment(
			[observation("spans.gen_ai", "missing")],
			[finding("spans.gen_ai", "critical")],
			{
				category: "agents",
				probes: [
					probe("agent.baseline"),
					probe("agent.tools_success"),
					probe("agent.tool_error"),
					probe("agent.conversation"),
					probe("agent.long_input"),
				],
			},
		),
	);
	assert.ok(criticalScore > 0);
	assert.ok(criticalScore <= 59);
	assert.equal(
		classifyScore(criticalScore, "complete"),
		"significant_improvements_needed",
	);
});

test("zero is reserved for variants that never started", () => {
	const score = scoreVariant(
		assessment([], [], {
			completion: "incomplete",
			probes: [probe("llm.baseline", "pending")],
		}),
	);
	assert.equal(score, 0);
	assert.equal(classifyScore(score, "incomplete"), "out_of_spec");
});

test("partial execution receives a positive coverage-adjusted score", () => {
	const score = scoreVariant(
		assessment([], [], {
			completion: "incomplete",
			probes: [
				probe("llm.baseline"),
				probe("llm.multi_turn", "blocked"),
				probe("llm.provider_error", "blocked"),
				probe("llm.conversation", "blocked"),
				probe("llm.long_input", "blocked"),
			],
		}),
	);
	assert.equal(score, 20);
	assert.equal(classifyScore(score, "incomplete"), "out_of_spec");
});
