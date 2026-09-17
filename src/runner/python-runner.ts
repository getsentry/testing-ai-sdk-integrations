import { execFile } from "node:child_process";
import { access, constants, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import type {
	AssessmentEnvironmentContext,
	AssessmentExecutionContext,
	AssessmentExecutionResult,
	AssessmentRunner,
} from "./execution.js";
import { executionLog, resolveDependencyVersion } from "./execution.js";

import { executeProcess } from "./process.js";

const execFileAsync = promisify(execFile);

export class PythonRunner implements AssessmentRunner {
	async needsSetup(context: AssessmentEnvironmentContext): Promise<boolean> {
		const pythonPath = path.join(context.workDir, ".venv", "bin", "python");
		try {
			await access(pythonPath, constants.X_OK);
			await execFileAsync(pythonPath, ["--version"]);
			return false;
		} catch {
			await rm(path.join(context.workDir, ".venv"), {
				recursive: true,
				force: true,
			});
			return true;
		}
	}

	async setupEnvironment(context: AssessmentEnvironmentContext): Promise<void> {
		await this.syncDependencies(context);
	}

	private async syncDependencies(
		context: AssessmentEnvironmentContext,
	): Promise<void> {
		await this.writePyprojectToml(context);
		await execFileAsync("uv", ["sync"], {
			cwd: context.workDir,
			timeout: 300_000,
		});
		await this.installLocalSentrySdk(context);
	}

	private async writePyprojectToml(
		context: AssessmentEnvironmentContext,
	): Promise<void> {
		const { framework } = context;
		const dependencies = framework.dependencies.map((dependency) => {
			const version = resolveDependencyVersion(dependency.version, framework);
			if (version === "latest") return dependency.package;
			if (/^[<>=!~]/.test(version)) return `${dependency.package}${version}`;
			return `${dependency.package}==${version}`;
		});
		if (framework.sentryVersion === "latest") {
			dependencies.push("sentry-sdk");
		} else if (framework.sentryVersion !== "local") {
			dependencies.push(`sentry-sdk==${framework.sentryVersion}`);
		}

		const minimumPython = framework.minimumPlatformVersion ?? "3.10";
		const pyproject = `[project]
name = "sentry-assessment-${framework.name}"
version = "0.1.0"
requires-python = ">=${minimumPython}"
dependencies = [
${dependencies.map((dependency) => `    ${JSON.stringify(dependency)},`).join("\n")}
]
`;
		await writeFile(path.join(context.workDir, "pyproject.toml"), pyproject);
	}

	private async installLocalSentrySdk(
		context: AssessmentEnvironmentContext,
	): Promise<void> {
		const localSentryPath = process.env.SENTRY_PYTHON_PATH;
		if (!localSentryPath || context.framework.sentryVersion !== "local") return;
		await execFileAsync("uv", ["pip", "install", "-e", localSentryPath], {
			cwd: context.workDir,
			env: {
				...process.env,
				VIRTUAL_ENV: path.join(context.workDir, ".venv"),
			},
		});
	}

	async executeAssessmentProgram(
		context: AssessmentExecutionContext,
	): Promise<AssessmentExecutionResult> {
		const pythonPath = path.join(context.workDir, ".venv", "bin", "python");
		const result = await executeProcess(
			pythonPath,
			[context.programPath],
			context,
		);
		await writeFile(context.logPath, executionLog(context, result), "utf8");
		return result;
	}
}
