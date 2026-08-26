import assert from "node:assert/strict";
import test from "node:test";
import { ASSESSMENT_EVENT_PREFIX, parseHarnessEvents } from "./protocol.js";

test("parses lifecycle events embedded in platform runner output", () => {
	const result = parseHarnessEvents(
		`[wrangler:info] ${ASSESSMENT_EVENT_PREFIX}{"type":"assessment_finished","timestamp":"2026-01-01T00:00:00.000Z"}`,
	);
	assert.equal(result.finished, true);
	assert.equal(result.failures.length, 0);
	assert.equal(result.events[0]?.type, "assessment_finished");
});

test("parses runtime failures emitted by the assessment harness", () => {
	const result = parseHarnessEvents(
		[
			`${ASSESSMENT_EVENT_PREFIX}{"type":"runtime_failure","failure":{"kind":"flush","message":"flush timed out","stopsVariant":true}}`,
			`${ASSESSMENT_EVENT_PREFIX}{"type":"assessment_finished"}`,
		].join("\n"),
	);

	assert.deepEqual(result.events[0], {
		type: "runtime_failure",
		failure: {
			kind: "flush",
			message: "flush timed out",
			probeId: undefined,
			stopsVariant: true,
		},
		timestamp: undefined,
	});
	assert.equal(result.failures.length, 0);
});
