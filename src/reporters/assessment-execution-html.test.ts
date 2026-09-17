import assert from "node:assert/strict";
import test from "node:test";
import { finalizeVariant } from "../assessment/aggregation.js";
import type { ProbeResult } from "../assessment/types.js";
import { executionDetails } from "./assessment-execution-html.js";

test("execution details expose unassessed coverage, failures, and escaped independent evidence", () => {
	const probe: ProbeResult = {
		probeId: "agent.tools_success",
		status: "failed",
		callModes: ["blocking"],
		traceIds: [],
		spanIds: [],
		calls: [
			{
				callId: "call",
				mode: "blocking",
				status: "failed",
				error: {
					kind: "provider",
					message: "<script>unsafe</script>",
					stopsVariant: true,
				},
				tools: [],
			},
		],
	};
	const runtimeFailures = [
		{ kind: "timeout" as const, message: "deadline", stopsVariant: true },
	];
	const variant = finalizeVariant({
		id: "variant",
		identity: { frameworkVersion: "1", sentryVersion: "10", options: {} },
		probes: [probe],
		observations: [],
		findings: [],
		runtimeFailures,
		spans: [],
		attempts: [
			{
				id: "attempt",
				number: 1,
				probe,
				runtimeFailures,
				startedAt: "2026-09-11T00:00:00Z",
				finishedAt: "2026-09-11T00:00:01Z",
				durationMs: 1000,
				deadlineMs: 1000,
				programPath: "program",
				logPath: "log",
			},
		],
	});
	const html = executionDetails(variant);
	assert.match(html, /not assessed/);
	assert.match(html, /execution failure/);
	assert.match(html, /&lt;script&gt;unsafe&lt;\/script&gt;/);
	assert.doesNotMatch(html, /<script>unsafe/);
});
