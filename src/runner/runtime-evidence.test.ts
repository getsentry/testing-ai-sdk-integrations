import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { promisify } from "node:util";
import vm from "node:vm";

const execFileAsync = promisify(execFile);

async function javascriptHarness() {
	const source = await readFile(
		new URL("./templates/shared/runtime.javascript.njk", import.meta.url),
		"utf8",
	);
	const events: Array<Record<string, unknown>> = [];
	const context = vm.createContext({
		Error,
		Date,
		emit: (event: Record<string, unknown>) =>
			events.push(structuredClone(event)),
		Sentry: {
			startSpan: async (_options: unknown, callback: () => unknown) =>
				callback(),
			captureException: () => undefined,
		},
	});
	vm.runInContext(source, context);
	return { context, events };
}

test("JavaScript harness records tool inputs before execution and preserves actual outputs", async () => {
	const { context, events } = await javascriptHarness();
	await vm.runInContext(
		`runAssessmentCall({id:'agent.tools_success'}, {assessmentCallId:'agent.tools_success:streaming:0',assessmentCallMode:'streaming'}, async()=>runAssessmentTool({name:'multiply'},{'a:':8,b:4},async()=>32,'provider-tool-id'))`,
		context,
	);
	assert.deepEqual(
		events.map((event) => event.type),
		["call_started", "tool_started", "tool_finished", "call_finished"],
	);
	assert.deepEqual(events[1].arguments, { "a:": 8, b: 4 });
	assert.equal(events[1].toolCallId, "provider-tool-id");
	assert.equal(events[2].result, 32);
	assert.equal(events[3].mode, "streaming");
});

test("expected-error probes accept intended 4xx but never swallow transient 503s", async () => {
	const { context, events } = await javascriptHarness();
	await vm.runInContext(
		`runAssessmentCall({id:'llm.provider_error'}, {assessmentCallId:'llm.provider_error:blocking:0',assessmentCallMode:'blocking'}, async()=>captureExpectedError(Object.assign(new Error('invalid model'),{status:404})))`,
		context,
	);
	assert.equal(events.at(-1)?.status, "failed");
	assert.equal(events.at(-1)?.expectedError, true);
	await assert.rejects(
		vm.runInContext(
			`runAssessmentCall({id:'llm.provider_error'}, {assessmentCallId:'llm.provider_error:streaming:0',assessmentCallMode:'streaming'}, async()=>captureExpectedError(Object.assign(new Error('unavailable'),{status:503,headers:{'retry-after':'10'}})))`,
			context,
		),
	);
	const failed = events.at(-1);
	assert.equal(failed?.expectedError, false);
	assert.equal((failed?.failure as { statusCode: number }).statusCode, 503);
	assert.equal(
		(failed?.failure as { retryAfterMs: number }).retryAfterMs,
		10_000,
	);
});

test("HTTP 400 authentication errors are never treated as expected model errors", async () => {
	const { context, events } = await javascriptHarness();
	await assert.rejects(
		vm.runInContext(
			`runAssessmentCall({id:'llm.provider_error'}, {assessmentCallId:'llm.provider_error:blocking:0',assessmentCallMode:'blocking'}, async()=>captureExpectedError(Object.assign(new Error('API_KEY_INVALID for sentry-assessment-invalid-model'),{status:400})))`,
			context,
		),
	);
	assert.equal(events.at(-1)?.expectedError, false);
	const python = await pythonEvents(`
try:
 with assessment_call({'id':'llm.provider_error'}, {'assessmentCallId':'llm.provider_error:blocking:0', 'assessmentCallMode':'blocking'}):
  error = ValueError('API_KEY_INVALID for sentry-assessment-invalid-model'); error.status_code = 400; capture_expected_error(error)
except ValueError: pass
`);
	assert.equal(python.at(-1)?.expectedError, false);
});

async function pythonEvents(
	scenario: string,
): Promise<Array<Record<string, unknown>>> {
	const source = await readFile(
		new URL("./templates/shared/runtime.python.njk", import.meta.url),
		"utf8",
	);
	const program = `
from contextlib import contextmanager
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
import json, math
events = []
def emit(event): events.append(dict(event))
class Span:
 def __enter__(self): return self
 def __exit__(self, *args): pass
 def set_data(self, *args): pass
class SDK:
 def start_span(self, **kwargs): return Span()
 def capture_exception(self, error): pass
sentry_sdk = SDK()
${source}
${scenario}
print(json.dumps(events))
`;
	const { stdout } = await execFileAsync("python3", ["-c", program]);
	try {
		return JSON.parse(stdout);
	} catch (cause) {
		throw new Error("Python evidence was not JSON", { cause });
	}
}

test("Python call context records failure timing and independent tool outcomes", async () => {
	const events = await pythonEvents(`
with assessment_call({'id':'agent.tools_success'}, {'assessmentCallId':'agent.tools_success:blocking:0', 'assessmentCallMode':'blocking'}):
 with assessment_tool({'name':'multiply'}, {'a:':8, 'b':4}) as outcome: outcome['result'] = 32
try:
 with assessment_call({'id':'llm.provider_error'}, {'assessmentCallId':'llm.provider_error:streaming:0', 'assessmentCallMode':'streaming'}):
  error = ValueError('unavailable'); error.status_code = 503; capture_expected_error(error)
except ValueError: pass
`);
	assert.deepEqual(
		events.slice(0, 4).map((event) => event.type),
		["call_started", "tool_started", "tool_finished", "call_finished"],
	);
	assert.equal(events.at(-1)?.status, "failed");
	assert.equal(events.at(-1)?.expectedError, false);
	assert.equal(
		(events.at(-1)?.failure as { statusCode: number }).statusCode,
		503,
	);
});

test("intentional JavaScript tool errors are evidence, not unrelated provider failures", async () => {
	const { context, events } = await javascriptHarness();
	await vm.runInContext(
		`runAssessmentCall({id:'agent.tool_error'}, {assessmentCallId:'agent.tool_error:blocking:0',assessmentCallMode:'blocking'}, async()=>runAssessmentTool({name:'read_file'},{path:'missing'},async()=>{throw new AssessmentToolError('not found')}))`,
		context,
	);
	assert.equal(events.at(-1)?.expectedError, true);
	assert.equal(events.at(-2)?.status, "failed");
	await assert.rejects(
		vm.runInContext(
			`runAssessmentCall({id:'agent.tool_error'}, {assessmentCallId:'agent.tool_error:streaming:0',assessmentCallMode:'streaming'}, async()=>{throw Object.assign(new Error('unavailable',{cause:new AssessmentToolError('not found')}),{status:503})})`,
			context,
		),
	);
	assert.equal(events.at(-1)?.expectedError, false);
});

test("agent stream error events fail the call rather than producing false success", async () => {
	const { context, events } = await javascriptHarness();
	await assert.rejects(
		vm.runInContext(
			`runAssessmentCall({id:'agent.baseline'}, {assessmentCallId:'agent.baseline:streaming:0',assessmentCallMode:'streaming'}, async()=>consumeAssessmentStream((async function*(){yield {type:'error',error:Object.assign(new Error('unavailable'),{status:503})}})()))`,
			context,
		),
	);
	assert.equal(events.at(-1)?.status, "failed");
	assert.equal(
		(events.at(-1)?.failure as { statusCode: number }).statusCode,
		503,
	);
});

test("Python intentional tool failures do not mask a subsequent provider failure", async () => {
	const events = await pythonEvents(`
with assessment_call({'id':'agent.tool_error'}, {'assessmentCallId':'agent.tool_error:blocking:0', 'assessmentCallMode':'blocking'}):
 execute_assessment_tool({'name':'read_file', 'error':'not found'}, {'path':'missing'})
try:
 with assessment_call({'id':'agent.tool_error'}, {'assessmentCallId':'agent.tool_error:streaming:0', 'assessmentCallMode':'streaming'}):
  try: raise AssessmentToolError('not found')
  except AssessmentToolError:
   error = ValueError('unavailable'); error.status_code = 503; raise error
except ValueError: pass
`);
	assert.equal(events[3].expectedError, true);
	assert.equal(events.at(-1)?.expectedError, false);
});
