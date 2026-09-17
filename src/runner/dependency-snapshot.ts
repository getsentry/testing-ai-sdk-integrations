import { execFile } from "node:child_process";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import type { AssessmentEnvironmentContext } from "./execution.js";

const execFileAsync = promisify(execFile);

function parseDependencyOutput(output: string): unknown {
	try {
		return JSON.parse(output);
	} catch (cause) {
		throw new Error("Could not parse the installed dependency snapshot.", {
			cause,
		});
	}
}

export async function snapshotDependencies(
	context: AssessmentEnvironmentContext,
	directory: string,
): Promise<string> {
	let packages: unknown;
	if (context.framework.platform === "python") {
		const { stdout } = await execFileAsync(
			path.join(context.workDir, ".venv/bin/python"),
			[
				"-c",
				'import importlib.metadata,json; print(json.dumps(sorted([{"name":d.metadata["Name"],"version":d.version} for d in importlib.metadata.distributions()],key=lambda d:d["name"].lower())))',
			],
			{ timeout: 30_000 },
		);
		packages = parseDependencyOutput(stdout);
	} else {
		let stdout: string;
		try {
			({ stdout } = await execFileAsync("npm", ["ls", "--all", "--json"], {
				cwd: context.workDir,
				timeout: 30_000,
				maxBuffer: 20 * 1024 * 1024,
			}));
		} catch (error) {
			// npm still supplies a useful dependency graph when peer validation fails.
			const output = (error as { stdout?: string }).stdout;
			if (!output) throw error;
			stdout = output;
		}
		packages = parseDependencyOutput(stdout);
	}
	const snapshotPath = path.join(directory, "dependencies.json");
	await writeFile(
		snapshotPath,
		`${JSON.stringify({ capturedAt: new Date().toISOString(), node: process.version, requested: context.framework, packages }, null, 2)}\n`,
	);
	return snapshotPath;
}
