import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { discoverFrameworks } from "../runner/framework-discovery.js";
import type {
	AssessmentExecutionContext,
	AssessmentExecutionResult,
	AssessmentRunner,
} from "../runner/execution.js";
import { plannedCalls } from "./call-evidence.js";
import { toAssessmentTargetConfig } from "./discovery.js";
import { AssessmentExecutor } from "./executor.js";
import { resolveVariants } from "./matrix.js";
import type { CapturedSpan, RuntimeFailure } from "./types.js";

const prefix = "@@SENTRY_ASSESSMENT@@ ";
function output(probeId: string, firstOnly = false): string {
	const calls = plannedCalls("llm", {
		probeId,
		callModes: ["blocking", "streaming"],
	});
	const events: object[] = [{ type: "probe_started", probeId }];
	for (const call of firstOnly ? calls.slice(0, 1) : calls) {
		events.push(
			{
				type: "call_started",
				probeId,
				callId: call.callId,
				mode: call.mode,
				timestamp: "2026-09-11T00:00:00Z",
			},
			{
				type: "call_finished",
				probeId,
				callId: call.callId,
				mode: call.mode,
				status: "succeeded",
				timestamp: "2026-09-11T00:00:01Z",
			},
		);
	}
	if (!firstOnly)
		events.push(
			{ type: "probe_finished", probeId, status: "completed" },
			{ type: "assessment_finished" },
		);
	return events.map((event) => prefix + JSON.stringify(event)).join("\n");
}

function firstAttemptSpans(): CapturedSpan[] {
	return [
		{
			span_id: "root",
			trace_id: "trace",
			op: "test.assessment",
			start_timestamp: 1,
			timestamp: 3,
			data: { "test.probe.id": "llm.baseline" },
		},
		{
			span_id: "call",
			trace_id: "trace",
			parent_span_id: "root",
			op: "test.assessment.call",
			start_timestamp: 1,
			timestamp: 2,
			data: { "test.call.id": "llm.baseline:blocking:0" },
		},
		{
			span_id: "client",
			trace_id: "trace",
			parent_span_id: "call",
			op: "gen_ai.chat",
			start_timestamp: 1,
			timestamp: 2,
			data: {
				"gen_ai.operation.name": "chat",
				"gen_ai.request.model": "expected",
				"gen_ai.response.model": "wrong",
			},
		},
	];
}

test("isolates probe retries, retains earlier findings, and continues later probes", async (t) => {
	const root = await mkdtemp(path.join(os.tmpdir(), "assessment-executor-"));
	t.after(() => rm(root, { recursive: true, force: true }));
	const discovered = discoverFrameworks().find(
		(framework) =>
			framework.platform === "node" &&
			framework.category === "llm" &&
			framework.name === "manual",
	);
	assert.ok(discovered);
	const framework = {
		...discovered,
		dependencies: [],
		streamingMode: "both" as const,
	};
	const variant = resolveVariants(toAssessmentTargetConfig(framework))[0];
	assert.ok(variant);
	variant.modelOverrides.response = "expected";
	let setups = 0;
	const paths: string[] = [];
	const ids: string[] = [];
	const dsns: string[] = [];
	const runner: AssessmentRunner = {
		needsSetup: async () => true,
		setupEnvironment: async () => {
			setups++;
		},
		executeAssessmentProgram: async (
			context: AssessmentExecutionContext,
		): Promise<AssessmentExecutionResult> => {
			paths.push(context.logPath);
			dsns.push(context.sentryDsn);
			const probeId = path.basename(
				path.dirname(path.dirname(context.programPath)),
			);
			const first = paths.length === 1;
			const stdout = output(probeId, first);
			await writeFile(context.logPath, stdout);
			return {
				stdout,
				stderr: "",
				timedOut: first,
				...(first ? { exitError: "deadline" } : {}),
			};
		},
	};
	const collector = {
		registerRun: (id: string) => {
			ids.push(id);
		},
		getDsn: (id: string) => `http://public@localhost/${ids.indexOf(id) + 1}`,
		getSpans: (id: string) => (id === ids[0] ? firstAttemptSpans() : []),
		getFailures: (): RuntimeFailure[] => [],
	};
	const delays: number[] = [];
	const executor = new AssessmentExecutor(collector, {
		runner,
		executionId: "test-run",
		runsDirectory: root,
		sleep: async (ms) => {
			delays.push(ms);
		},
		snapshotDependencies: async (_context, directory) =>
			path.join(directory, "dependencies.json"),
	});
	const result = await executor.execute(framework, variant);
	assert.equal(setups, 1);
	assert.equal(paths.length, 6);
	assert.equal(new Set(paths).size, 6);
	assert.equal(new Set(dsns).size, 6);
	assert.equal(delays.length, 1);
	assert.equal(result.probes.length, 5);
	assert.ok(result.probes.every((probe) => probe.status === "completed"));
	assert.equal(result.coverage?.succeeded, 20);
	assert.equal(result.completion, "complete");
	assert.equal(result.executionHealth, "recovered");
	assert.equal(result.attempts?.[1].retryReason, "diagnostic_timeout");
	assert.ok(result.runtimeFailures.every((failure) => failure.recovered));
	assert.ok(
		result.findings.some(
			(finding) =>
				finding.findingId === "model.response.mismatch" &&
				finding.occurrences.some(
					(occurrence) => occurrence.attemptId === ids[0],
				),
		),
	);
	assert.match(await readFile(paths[0], "utf8"), /call_finished/);
	assert.ok(
		result.attempts?.[0].probe.calls?.some(
			(call) => call.status === "not_executed",
		),
	);
});
