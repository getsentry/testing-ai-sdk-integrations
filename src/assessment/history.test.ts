import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { gunzipSync } from "node:zlib";
import {
	aggregateTarget,
	createReport,
	finalizeVariant,
} from "./aggregation.js";
import type { AssessmentReport } from "./types.js";

const execFileAsync = promisify(execFile);
const script = (name: string) => path.resolve(".github/scripts", `${name}.cjs`);

function report(id: string): AssessmentReport {
	const variant = finalizeVariant({
		id: "variant",
		identity: { frameworkVersion: "1", sentryVersion: "10", options: {} },
		probes: [
			{
				probeId: "llm.baseline",
				status: "completed",
				callModes: ["blocking"],
				traceIds: [],
				spanIds: [],
				calls: [
					{
						callId: "llm.baseline:blocking:0",
						mode: "blocking",
						status: "succeeded",
						tools: [],
					},
				],
			},
		],
		observations: [
			{
				observationId: "capture",
				capability: "spans.client",
				state: "healthy",
				probeId: "llm.baseline",
				variantId: "variant",
				evidence: [],
			},
		],
		findings: [],
		runtimeFailures: [],
		spans: [],
	});
	return {
		...createReport(
			[
				aggregateTarget(
					{ platform: "node", category: "llm", framework: "manual" },
					[variant],
				),
			],
			1,
			`2026-09-11T${id === "first" ? "06" : "10"}:00:00.000Z`,
		),
		executionId: id,
		runId: "42",
		runAttempt: id === "first" ? "1" : "2",
	};
}

async function readJson(file: string, compressed = false) {
	try {
		const contents = await readFile(file);
		return JSON.parse(
			(compressed ? gunzipSync(contents) : contents).toString("utf8"),
		);
	} catch (cause) {
		throw new Error(`Could not read test JSON ${file}`, { cause });
	}
}

test("archive download failures do not finalize a destructive history migration", async (t) => {
	const root = await mkdtemp(
		path.join(os.tmpdir(), "assessment-archive-failure-"),
	);
	t.after(() => rm(root, { recursive: true, force: true }));
	const historyPath = path.join(root, "history.json");
	await writeFile(
		historyPath,
		JSON.stringify({
			schemaVersion: "4",
			entries: [
				{
					date: "2026-09-11",
					reportPath: "reports/2026-09-11/legacy",
					migrateFrom: "reports/2026-09-11",
					reportJsonFile: "assessment.json.gz",
				},
			],
		}),
	);
	let requests = 0;
	const server = createServer((_request, response) => {
		requests++;
		response.statusCode = 503;
		response.end();
	});
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
	const address = server.address();
	assert.ok(address && typeof address !== "string");
	await assert.rejects(
		execFileAsync(process.execPath, [
			script("fetch-existing-reports"),
			historyPath,
			path.join(root, "site"),
			`http://127.0.0.1:${address.port}`,
		]),
		/refusing to publish an incomplete archive/,
	);
	assert.equal(requests, 3);
	assert.equal(
		(await readJson(historyPath)).entries[0].migrateFrom,
		"reports/2026-09-11",
	);
});

test("site and history preserve same-day attempts and earlier scoring versions", async (t) => {
	const root = await mkdtemp(path.join(os.tmpdir(), "assessment-history-"));
	t.after(() => rm(root, { recursive: true, force: true }));
	const historyPath = path.join(root, "history.json");
	await writeFile(
		historyPath,
		JSON.stringify({
			schemaVersion: "3",
			scoringVersion: "3",
			entries: [
				{
					date: "2026-09-11",
					generatedAt: "2026-09-11T00:00:00Z",
					scoringVersion: "3",
				},
			],
		}),
	);
	const htmlPath = path.join(root, "report.html");
	const site = path.join(root, "site");
	for (const id of ["first", "second"]) {
		const reportPath = path.join(root, `${id}.json`);
		await writeFile(reportPath, JSON.stringify(report(id)));
		await writeFile(htmlPath, id);
		await execFileAsync(process.execPath, [
			script("prepare-assessment-site"),
			reportPath,
			htmlPath,
			site,
		]);
		await execFileAsync(process.execPath, [
			script("update-assessment-history"),
			reportPath,
			historyPath,
		]);
	}
	const history = await readJson(historyPath);
	assert.equal(history.schemaVersion, "4");
	assert.equal(history.entries.length, 3);
	assert.equal(history.entries[0].scoringVersion, "3");
	assert.equal(history.entries[0].migrateFrom, "reports/2026-09-11");
	assert.notEqual(history.entries[0].reportPath, "reports/2026-09-11");
	assert.notEqual(history.entries[1].reportPath, history.entries[2].reportPath);
	assert.equal(
		await readFile(
			path.join(site, history.entries[1].reportPath, "index.html"),
			"utf8",
		),
		"first",
	);
	assert.match(
		await readFile(path.join(site, "index.html"), "utf8"),
		new RegExp(history.entries[2].reportPath),
	);
	assert.equal(
		(await readJson(path.join(site, "assessment.json"))).executionId,
		"second",
	);
	assert.equal(
		(
			await readJson(
				path.join(site, history.entries[1].reportPath, "assessment.json.gz"),
				true,
			)
		).executionId,
		"first",
	);
	await execFileAsync(process.execPath, [
		script("update-assessment-history"),
		path.join(root, "second.json"),
		historyPath,
	]);
	assert.equal((await readJson(historyPath)).entries.length, 3);

	const restored = path.join(root, "restored");
	await mkdir(restored);
	const requests: string[] = [];
	const server = createServer((request, response) => {
		requests.push(request.url ?? "");
		response.end("retained");
	});
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
	const address = server.address();
	assert.ok(address && typeof address !== "string");
	await execFileAsync(process.execPath, [
		script("fetch-existing-reports"),
		historyPath,
		restored,
		`http://127.0.0.1:${address.port}`,
	]);
	assert.ok(requests.includes(`/${history.entries[1].reportPath}/index.html`));
	assert.ok(requests.includes("/reports/2026-09-11/index.html"));
	assert.equal(
		await readFile(
			path.join(restored, history.entries[0].reportPath, "index.html"),
			"utf8",
		),
		"retained",
	);
	assert.equal((await readJson(historyPath)).entries[0].migrateFrom, undefined);
	assert.equal(
		gunzipSync(
			await readFile(
				path.join(
					restored,
					history.entries[0].reportPath,
					"assessment.json.gz",
				),
			),
		).toString(),
		"retained",
	);
	assert.equal(
		await readFile(
			path.join(restored, history.entries[1].reportPath, "index.html"),
			"utf8",
		),
		"retained",
	);
});

test("comparison separates reproduced execution failures and never calls missing coverage an improvement", async (t) => {
	const root = await mkdtemp(path.join(os.tmpdir(), "assessment-comparison-"));
	t.after(() => rm(root, { recursive: true, force: true }));
	const before = report("first");
	const after = report("second");
	const variant = after.targets[0].variants[0];
	variant.completion = "incomplete";
	variant.probes[0].status = "failed";
	variant.runtimeFailures = [
		{
			kind: "timeout",
			message: "deadline",
			stopsVariant: true,
			probeId: "llm.baseline",
		},
	];
	variant.attempts = [1, 2].map((number) => ({
		id: `attempt-${number}`,
		number,
		probe: variant.probes[0],
		startedAt: after.generatedAt,
		finishedAt: after.generatedAt,
		durationMs: 1,
		deadlineMs: 1,
		runtimeFailures: variant.runtimeFailures,
		programPath: "program",
		logPath: "log",
	}));
	before.targets[0].variants[0].findings = [
		{
			findingId: "messages.output.missing",
			capability: "messages.output",
			severity: "major",
			title: "Missing",
			description: "Missing",
			occurrences: [
				{
					variantId: "variant",
					probeId: "llm.baseline",
					observationIds: ["missing"],
					evidence: [],
				},
			],
		},
	];
	const baseline = path.join(root, "before.json");
	const candidate = path.join(root, "after.json");
	const output = path.join(root, "comparison.md");
	await writeFile(baseline, JSON.stringify(before));
	await writeFile(candidate, JSON.stringify(after));
	await execFileAsync(process.execPath, [
		script("compare-assessments"),
		baseline,
		candidate,
		output,
	]);
	assert.doesNotMatch(await readFile(output, "utf8"), /finding removed/);
	assert.match(
		await readFile(output.replace(/\.md$/, ".env"), "utf8"),
		/HAS_REGRESSIONS=false/,
	);
	assert.match(
		await readFile(output.replace(/\.md$/, ".env"), "utf8"),
		/HAS_CONFIRMED_EXECUTION_FAILURES=true/,
	);
	before.scoringVersion = "3";
	await writeFile(baseline, JSON.stringify(before));
	await execFileAsync(process.execPath, [
		script("compare-assessments"),
		baseline,
		candidate,
		output,
	]);
	assert.match(await readFile(output, "utf8"), /not comparable/);
});

test("comparison retains but does not miscompare findings from earlier failed attempts", async (t) => {
	const root = await mkdtemp(
		path.join(os.tmpdir(), "assessment-attempt-comparison-"),
	);
	t.after(() => rm(root, { recursive: true, force: true }));
	const before = report("first");
	const after = report("second");
	const variant = after.targets[0].variants[0];
	variant.attempts = ["old", "new"].map((id, index) => ({
		id,
		number: index + 1,
		probe: {
			...variant.probes[0],
			status: index === 0 ? "failed" : "completed",
		},
		startedAt: after.generatedAt,
		finishedAt: after.generatedAt,
		durationMs: 1,
		deadlineMs: 1,
		runtimeFailures: [],
		programPath: "program",
		logPath: "log",
	}));
	variant.findings = [
		{
			findingId: "messages.output.missing",
			capability: "messages.output",
			severity: "major",
			title: "Missing",
			description: "Missing",
			occurrences: [
				{
					variantId: "variant",
					probeId: "llm.baseline",
					attemptId: "old",
					observationIds: ["missing"],
					evidence: [],
				},
			],
		},
	];
	const baseline = path.join(root, "before.json");
	const candidate = path.join(root, "after.json");
	const output = path.join(root, "comparison.md");
	await writeFile(baseline, JSON.stringify(before));
	await writeFile(candidate, JSON.stringify(after));
	await execFileAsync(process.execPath, [
		script("compare-assessments"),
		baseline,
		candidate,
		output,
	]);
	assert.match(
		await readFile(path.join(root, "comparison.env"), "utf8"),
		/HAS_REGRESSIONS=false/,
	);
	variant.findings[0].occurrences[0].attemptId = "new";
	await writeFile(candidate, JSON.stringify(after));
	await execFileAsync(process.execPath, [
		script("compare-assessments"),
		baseline,
		candidate,
		output,
	]);
	assert.match(
		await readFile(path.join(root, "comparison.env"), "utf8"),
		/HAS_REGRESSIONS=true/,
	);
});
