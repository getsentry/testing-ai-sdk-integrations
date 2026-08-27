import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type { AssessmentReport } from "../assessment/types.js";
import {
	renderAssessmentHtml,
	writeAssessmentHtml,
} from "./assessment-html.js";

function report(): AssessmentReport {
	return {
		schemaVersion: "2",
		scoringVersion: "3",
		generatedAt: "2026-01-01T00:00:00.000Z",
		durationMs: 10,
		summary: {
			targets: 1,
			variants: 1,
			complete: 1,
			incomplete: 0,
			score: 100,
			ratings: {
				all_good: 1,
				improvements_needed: 0,
				significant_improvements_needed: 0,
				out_of_spec: 0,
			},
			health: {
				healthy: 1,
				healthy_with_notes: 0,
				degraded: 0,
				broken: 0,
			},
			findings: { critical: 0, major: 0, minor: 0, info: 0 },
		},
		targets: [
			{
				id: "node/llm/openai",
				identity: { platform: "node", category: "llm", framework: "openai" },
				completion: "complete",
				health: "healthy",
				score: 100,
				rating: "all_good",
				findings: [],
				capabilitySummary: {},
				variants: [
					{
						id: "node/llm/openai/framework=latest/sentry=latest",
						identity: {
							frameworkVersion: "latest",
							sentryVersion: "latest",
							options: {},
						},
						resolvedSentryVersion: "10.42.0",
						completion: "complete",
						health: "healthy",
						score: 100,
						rating: "all_good",
						probes: [
							{
								probeId: "llm.baseline",
								status: "completed",
								callModes: ["blocking", "streaming"],
								traceIds: [],
								spanIds: [],
							},
						],
						observations: [],
						findings: [],
						runtimeFailures: [],
						spans: [],
					},
				],
			},
		],
	};
}

test("trace annotations come from evaluator observations", () => {
	const assessment = report();
	const variant = assessment.targets[0]?.variants[0];
	assert.ok(variant);
	variant.spans.push({
		span_id: "client",
		trace_id: "trace",
		op: "gen_ai.chat",
		description: "chat model",
		start_timestamp: 1,
		timestamp: 2,
	});
	variant.observations.push({
		observationId: "messages.output:client",
		capability: "messages.output",
		state: "legacy",
		probeId: "llm.baseline",
		variantId: variant.id,
		evidence: [{ spanId: "client", traceId: "trace" }],
	});
	const html = renderAssessmentHtml(assessment);
	assert.match(html, /messages\.output: legacy/);
	assert.doesNotMatch(html, /missing gen_ai\.output\.messages/);
});

test("HTML reporting is pure and displays requested and resolved versions", async () => {
	const assessment = report();
	const before = structuredClone(assessment);
	const html = renderAssessmentHtml(assessment);
	assert.match(html, /10\.42\.0/);
	assert.match(html, /requested sentry/);
	assert.match(html, /blocking \+ streaming/);
	assert.match(html, /How scoring works/);
	assert.match(html, /Higher is better/);
	assert.match(html, /Repeated spans add evidence, not points/);
	assert.match(html, /85-100/);
	assert.match(html, /0-69/);
	assert.match(
		html,
		/\.rating-significant_improvements_needed\{--score-color:var\(--red\)\}/,
	);
	assert.match(html, /return'#b9363e'/);
	assert.match(html, /data-target-id="node\/llm\/openai"/);
	assert.match(
		html,
		/id="variant-node%2Fllm%2Fopenai%2Fframework%3Dlatest%2Fsentry%3Dlatest"/,
	);
	assert.match(
		html,
		/href="#variant-node%2Fllm%2Fopenai%2Fframework%3Dlatest%2Fsentry%3Dlatest"/,
	);
	assert.match(html, /data-variant-link aria-label="Link to variant 1"/);
	assert.match(html, /function revealVariant/);
	assert.match(html, /revealHash\(location\.hash\.slice\(1\)\)/);
	assert.match(html, /function filteredTrendEntries/);
	assert.match(html, /renderDashboardTrend\(allMatches,filtering\)/);
	assert.deepEqual(assessment, before);

	const directory = await mkdtemp(path.join(os.tmpdir(), "assessment-html-"));
	try {
		const output = await writeAssessmentHtml(assessment, directory);
		assert.match(await readFile(output, "utf8"), /10\.42\.0/);
		assert.deepEqual(assessment, before);
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
});
