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
import {
	assessmentEnvironment,
	executionFailure,
	executionLog,
	resolveDependencyVersion,
} from "./execution.js";

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
		await execFileAsync("uv", ["sync"], { cwd: context.workDir });
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
		let result: AssessmentExecutionResult;
		try {
			const execution = await execFileAsync(pythonPath, [context.programPath], {
				cwd: context.workDir,
				env: assessmentEnvironment(context),
				timeout: context.timeoutMs,
			});
			result = {
				stdout: execution.stdout,
				stderr: execution.stderr,
				timedOut: false,
			};
		} catch (error) {
			result = executionFailure(error);
		}
		await writeFile(context.logPath, executionLog(context, result), "utf8");
		return result;
	}
}
