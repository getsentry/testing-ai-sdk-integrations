import assert from "node:assert/strict";
import test from "node:test";
import type { ProbeResult } from "./types.js";
import { parseHarnessEvents } from "./protocol.js";
import { reconcileExecution } from "./reconciliation.js";

function pendingProbe(): ProbeResult {
	return {
		probeId: "llm.baseline",
		status: "pending",
		callModes: ["blocking", "streaming"],
		traceIds: [],
		spanIds: [],
	};
}

test("preserves the process error when the terminal event is missing", () => {
	const protocol = parseHarnessEvents("process output before crash");
	const failures = reconcileExecution(
		[pendingProbe()],
		{
			stdout: "process output before crash",
			stderr: "boom",
			exitError: "process exited with code 1",
			timedOut: false,
		},
		protocol,
	);

	assert.deepEqual(
		failures.map((failure) => failure.kind),
		["protocol", "process_exit"],
	);
	assert.equal(failures[1]?.message, "process exited with code 1");
});

test("reconciles probe status, duration, and runtime failures", () => {
	const protocol = parseHarnessEvents(
		[
			'@@SENTRY_ASSESSMENT@@ {"type":"probe_started","probeId":"llm.baseline","timestamp":"2026-01-01T00:00:00.000Z"}',
			'@@SENTRY_ASSESSMENT@@ {"type":"probe_finished","probeId":"llm.baseline","status":"completed","timestamp":"2026-01-01T00:00:01.250Z"}',
			'@@SENTRY_ASSESSMENT@@ {"type":"assessment_finished"}',
		].join("\n"),
	);
	const probe = pendingProbe();
	const failures = reconcileExecution(
		[probe],
		{ stdout: "", stderr: "", timedOut: false },
		protocol,
	);

	assert.deepEqual(failures, []);
	assert.equal(probe.status, "completed");
	assert.equal(probe.durationMs, 1_250);
});
