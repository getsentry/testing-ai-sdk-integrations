import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";
import { executeProcess } from "./process.js";

async function directory(t: TestContext) {
	const root = await mkdtemp(path.join(os.tmpdir(), "assessment-process-"));
	t.after(() => rm(root, { recursive: true, force: true }));
	return root;
}

test("process deadlines stop work and retain stdout", async (t) => {
	const root = await directory(t);
	const programPath = path.join(root, "assessment.js");
	await writeFile(
		programPath,
		'console.log("started"); process.on("SIGTERM", () => {}); while (true) {}',
	);
	const started = Date.now();
	const result = await executeProcess(process.execPath, [programPath], {
		workDir: root,
		programPath,
		logPath: path.join(root, "assessment.log"),
		sentryDsn: "",
		timeoutMs: 1000,
	});
	assert.equal(result.timedOut, true);
	assert.match(result.stdout, /started/);
	assert.ok(Date.now() - started < 6000);
	assert.match(
		await readFile(path.join(root, "assessment.log"), "utf8"),
		/started/,
	);
});

test("terminates descendants rather than leaving timed-out work running", {
	skip: process.platform === "win32",
}, async (t) => {
	const root = await directory(t);
	const heartbeat = path.join(root, "heartbeat");
	const childCode = `const fs=require('fs');process.on('SIGTERM',()=>{});setInterval(()=>fs.writeFileSync(${JSON.stringify(heartbeat)},String(Date.now())),20);`;
	const code = `require('child_process').spawn(process.execPath,['-e',${JSON.stringify(childCode)}],{stdio:'ignore'});process.on('SIGTERM',()=>{});setInterval(()=>{},100);`;
	const result = await executeProcess(process.execPath, ["-e", code], {
		workDir: root,
		programPath: "test",
		logPath: path.join(root, "assessment.log"),
		sentryDsn: "",
		timeoutMs: 1000,
	});
	assert.equal(result.timedOut, true);
	const stopped = await readFile(heartbeat, "utf8");
	await new Promise((resolve) => setTimeout(resolve, 150));
	assert.equal(await readFile(heartbeat, "utf8"), stopped);
});

test("log write failures settle and stop the child instead of hanging", {
	timeout: 6000,
}, async (t) => {
	const root = await directory(t);
	const result = await executeProcess(
		process.execPath,
		["-e", "setInterval(()=>{},100)"],
		{
			workDir: root,
			programPath: "test",
			logPath: path.join(root, "missing", "assessment.log"),
			sentryDsn: "",
			timeoutMs: 3000,
		},
	);
	assert.equal(result.timedOut, false);
	assert.match(result.exitError ?? "", /persist probe output/);
});

test("preserves Unicode split across stdout chunks", async (t) => {
	const root = await directory(t);
	const result = await executeProcess(
		process.execPath,
		[
			"-e",
			'const bytes=Buffer.from("💡");process.stdout.write(bytes.subarray(0,2));setTimeout(()=>process.stdout.write(bytes.subarray(2)),20);',
		],
		{
			workDir: root,
			programPath: "test",
			logPath: path.join(root, "assessment.log"),
			sentryDsn: "",
			timeoutMs: 5000,
		},
	);
	assert.equal(result.stdout, "💡");
	assert.equal(result.timedOut, false);
});
