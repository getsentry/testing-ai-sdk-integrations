import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { toAssessmentTargetConfig } from "../assessment/discovery.js";
import { resolveVariants } from "../assessment/matrix.js";
import { renderAssessmentProgram } from "../assessment/program-renderer.js";
import { discoverFrameworks } from "./framework-discovery.js";

const execFileAsync = promisify(execFile);

test("every matrix variant renders syntactically valid JavaScript or Python with call evidence", async (t) => {
	const root = await mkdtemp(path.join(os.tmpdir(), "assessment-rendering-"));
	t.after(() => rm(root, { recursive: true, force: true }));
	const javascript: string[] = [];
	const python: string[] = [];
	let count = 0;
	for (const framework of discoverFrameworks()) {
		const target = toAssessmentTargetConfig(framework);
		for (const variant of resolveVariants(target)) {
			const rendered = renderAssessmentProgram(target, variant);
			assert.match(rendered.contents, /call_started/);
			assert.match(rendered.contents, /call_finished/);
			const isPython = framework.platform === "python";
			const file = path.join(root, `${count++}.${isPython ? "py" : "mjs"}`);
			await writeFile(file, rendered.contents);
			(isPython ? python : javascript).push(file);
		}
	}
	assert.ok(count >= 81);
	await execFileAsync(process.execPath, [
		"--experimental-vm-modules",
		"-e",
		"const fs=require('fs'),vm=require('vm');for(const file of process.argv.slice(1))new vm.SourceTextModule(fs.readFileSync(file,'utf8'),{identifier:file});",
		...javascript,
	]);
	await execFileAsync("python3", [
		"-c",
		"import ast,pathlib,sys\nfor file in sys.argv[1:]: ast.parse(pathlib.Path(file).read_text(), filename=file)",
		...python,
	]);
});
