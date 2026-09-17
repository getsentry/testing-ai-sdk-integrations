import assert from "node:assert/strict";
import test from "node:test";
import {
	aggregateTarget,
	createReport,
	summarizeReport,
} from "./aggregation.js";
import type { TargetAssessment, VariantAssessment } from "./types.js";

function variant(id: string, score: number): VariantAssessment {
	return {
		id,
		identity: {
			frameworkVersion: "latest",
			sentryVersion: "latest",
			options: {},
		},
		completion: "complete",
		health: "healthy",
		score,
		rating: "all_good",
		probes: [],
		observations: [],
		findings: [],
		runtimeFailures: [],
		spans: [],
	};
}

function target(
	id: string,
	score: number,
	variantScores: readonly number[],
): TargetAssessment {
	return {
		id,
		identity: { platform: "node", category: "llm", framework: id },
		completion: "complete",
		health: "healthy",
		score,
		rating: "all_good",
		variants: variantScores.map((value, index) =>
			variant(`${id}/${index}`, value),
		),
		findings: [],
		capabilitySummary: {},
	};
}

test("report score gives each integration equal influence", () => {
	const summary = summarizeReport([
		target(
			"many-variants",
			50,
			Array.from({ length: 10 }, () => 50),
		),
		target("one-variant", 100, [100]),
	]);

	assert.equal(summary.score, 75);
	assert.equal(summary.targets, 2);
	assert.equal(summary.variants, 11);
});

test("target scores average their capped variant scores", () => {
	const aggregated = aggregateTarget(
		{ platform: "node", category: "llm", framework: "integration" },
		[variant("integration/minor", 90), variant("integration/major", 75)],
	);
	assert.equal(aggregated.score, 83);
});

test("unassessed telemetry is excluded from averages without hiding execution failure", () => {
	const unknown = {
		...variant("unknown", 0),
		telemetryScore: null,
		completion: "incomplete" as const,
	};
	const target = aggregateTarget(
		{ platform: "node", category: "llm", framework: "integration" },
		[unknown, variant("measured", 100)],
	);
	assert.equal(target.score, 100);
	assert.equal(target.completion, "incomplete");
	assert.equal(createReport([target], 1).summary.incomplete, 1);
	const unassessed = aggregateTarget(target.identity, [unknown]);
	assert.equal(unassessed.telemetryScore, null);
	assert.equal(createReport([unassessed], 1).summary.telemetryScore, null);
});

test("reports identify the scoring contract", () => {
	const report = createReport([target("integration", 100, [100])], 25);

	assert.equal(report.schemaVersion, "2");
	assert.equal(report.scoringVersion, "4");
});
