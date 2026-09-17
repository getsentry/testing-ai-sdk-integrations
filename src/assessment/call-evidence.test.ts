import assert from "node:assert/strict";
import test from "node:test";
import { coverage, plannedCalls } from "./call-evidence.js";
import { deriveCompletion } from "./health.js";
import { parseHarnessEvents } from "./protocol.js";
import { reconcileExecution } from "./reconciliation.js";
import type { ProbeResult } from "./types.js";

const line = (event: object) =>
	`@@SENTRY_ASSESSMENT@@ ${JSON.stringify(event)}`;
function probe(): ProbeResult {
	const result: ProbeResult = {
		probeId: "llm.baseline",
		status: "pending",
		callModes: ["blocking", "streaming"],
		spanIds: [],
		traceIds: [],
	};
	result.calls = plannedCalls("llm", result);
	return result;
}

test("reconciliation distinguishes cancelled work from calls never executed", () => {
	const current = probe();
	const stdout = [
		line({ type: "probe_started", probeId: current.probeId }),
		line({
			type: "call_started",
			probeId: current.probeId,
			callId: "llm.baseline:blocking:0",
			mode: "blocking",
			timestamp: "2026-09-11T00:00:00Z",
		}),
	].join("\n");
	const failures = reconcileExecution(
		[current],
		{ stdout, stderr: "", timedOut: true, exitError: "deadline" },
		parseHarnessEvents(stdout),
		"2026-09-11T00:00:02Z",
	);
	assert.equal(
		failures.find((item) => item.kind === "protocol")?.secondary,
		true,
	);
	assert.deepEqual(
		current.calls?.map((call) => call.status),
		["cancelled", "not_executed"],
	);
	assert.equal(current.calls?.[0].durationMs, 2000);
	assert.deepEqual(coverage([current]), {
		planned: 2,
		succeeded: 0,
		expectedErrors: 0,
		failed: 0,
		cancelled: 1,
		notExecuted: 1,
	});
});

test("deduplicates echoed Cloudflare events but rejects conflicting event ids", () => {
	const event = line({ type: "assessment_finished", eventId: "session:1" });
	const duplicate = parseHarnessEvents(`${event}\n[wrangler:info] ${event}`);
	assert.equal(duplicate.events.length, 1);
	assert.equal(duplicate.failures.length, 0);
	const conflict = parseHarnessEvents(
		`${event}\n${line({ type: "probe_started", probeId: "llm.baseline", eventId: "session:1" })}`,
	);
	assert.ok(
		conflict.failures.some((item) => item.message.includes("Conflicting")),
	);
});

test("rejects invalid call timestamps and contradictory success events", () => {
	for (const event of [
		{ type: "call_started", timestamp: "not a timestamp" },
		{
			type: "call_finished",
			timestamp: "2026-09-11T00:00:00Z",
			status: "succeeded",
			expectedError: true,
		},
	]) {
		const parsed = parseHarnessEvents(
			line({
				probeId: "llm.baseline",
				callId: "llm.baseline:blocking:0",
				mode: "blocking",
				...event,
			}),
		);
		assert.ok(
			parsed.failures.some((failure) => failure.message.includes("Malformed")),
		);
	}
});

test("recovered errors remain recorded without marking the final execution incomplete", () => {
	assert.equal(
		deriveCompletion([
			{
				kind: "timeout",
				message: "deadline",
				stopsVariant: true,
				recovered: true,
			},
		]),
		"complete",
	);
	assert.equal(
		deriveCompletion([
			{ kind: "provider", message: "503", stopsVariant: false },
		]),
		"incomplete",
	);
});
