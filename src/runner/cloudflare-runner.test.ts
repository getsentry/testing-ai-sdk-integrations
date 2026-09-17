import assert from "node:assert/strict";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";
import { parseHarnessEvents } from "../assessment/protocol.js";
import { retryReason } from "../assessment/retry.js";
import { CloudflareRunner } from "./cloudflare-runner.js";

async function fakeWrangler(t: TestContext, code: string, timeoutMs = 5000) {
	const root = await mkdtemp(path.join(os.tmpdir(), "assessment-wrangler-"));
	const previousPath = process.env.PATH;
	t.after(async () => {
		process.env.PATH = previousPath;
		await rm(root, { recursive: true, force: true });
	});
	const executable = path.join(root, "npx");
	await writeFile(executable, `#!/usr/bin/env node\n${code}\n`);
	await chmod(executable, 0o755);
	process.env.PATH = `${root}${path.delimiter}${previousPath}`;
	return {
		root,
		context: {
			workDir: root,
			programPath: path.join(root, "assessment.js"),
			logPath: path.join(root, "assessment.log"),
			sentryDsn: "http://public@127.0.0.1:1234/1",
			timeoutMs,
		},
	};
}

test("Wrangler port collisions retain evidence and qualify for targeted recovery", async (t) => {
	const { root, context } = await fakeWrangler(
		t,
		'process.stderr.write("Address already in use (127.0.0.1:12345)\\n");process.exit(1);',
	);
	const result = await new CloudflareRunner().executeAssessmentProgram(context);
	assert.equal(result.timedOut, false);
	assert.match(result.exitError ?? "", /Address already in use/);
	assert.match(
		await readFile(context.logPath, "utf8"),
		/Address already in use/,
	);
	assert.equal(
		retryReason([
			{ kind: "process_exit", message: result.exitError!, stopsVariant: true },
		]),
		"port_collision",
	);
	await assert.rejects(readFile(path.join(root, ".dev.vars")), {
		code: "ENOENT",
	});
});

test("Wrangler HTTP deadlines terminate the worker and remove credential files", async (t) => {
	const { root, context } = await fakeWrangler(
		t,
		'const port=Number(process.argv[process.argv.indexOf("--port")+1]);require("http").createServer(()=>{}).listen(port,()=>console.log(`Ready on http://localhost:${port}`));',
		1000,
	);
	const startedAt = Date.now();
	const result = await new CloudflareRunner().executeAssessmentProgram(context);
	assert.equal(result.timedOut, true);
	assert.ok(Date.now() - startedAt < 5000);
	await assert.rejects(readFile(path.join(root, ".dev.vars")), {
		code: "ENOENT",
	});
});

test("Wrangler console and response echoes reconcile into one lifecycle", async (t) => {
	const event =
		'@@SENTRY_ASSESSMENT@@ {"type":"assessment_finished","eventId":"echo:1"}';
	const { context } = await fakeWrangler(
		t,
		`const port=Number(process.argv[process.argv.indexOf('--port')+1]);require('http').createServer((request,response)=>{const event=${JSON.stringify(event)};console.log(event);response.end(event)}).listen(port,()=>console.log('Ready on http://localhost:'+port));`,
	);
	const result = await new CloudflareRunner().executeAssessmentProgram(context);
	assert.equal(result.exitError, undefined);
	const protocol = parseHarnessEvents(result.stdout);
	assert.equal(protocol.failures.length, 0);
	assert.equal(protocol.events.length, 1);
});
