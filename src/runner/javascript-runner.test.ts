import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type { AssessmentEnvironmentContext } from "./execution.js";
import { JavaScriptRunner } from "./javascript-runner.js";

const framework: AssessmentEnvironmentContext["framework"] = {
	name: "vercel",
	platform: "nextjs",
	version: "6",
	sentryVersion: "10",
	dependencies: [
		{ package: "ai", version: "framework" },
		{ package: "@sentry/nextjs", version: "sentry" },
	],
};

test("requires setup when a cached JavaScript environment has no package manifest", async () => {
	const workDir = await mkdtemp(path.join(os.tmpdir(), "javascript-runner-"));
	try {
		await mkdir(path.join(workDir, "node_modules", "ai"), { recursive: true });
		await mkdir(path.join(workDir, "node_modules", "@sentry", "nextjs"), {
			recursive: true,
		});

		const runner = new JavaScriptRunner();
		assert.equal(await runner.needsSetup({ workDir, framework }), true);

		await writeFile(path.join(workDir, "package.json"), "{}\n", "utf8");
		assert.equal(await runner.needsSetup({ workDir, framework }), false);
	} finally {
		await rm(workDir, { recursive: true, force: true });
	}
});
