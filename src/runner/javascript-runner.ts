import { execFile } from "node:child_process";
import { access, writeFile } from "node:fs/promises";
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

export class JavaScriptRunner implements AssessmentRunner {
	async needsSetup(context: AssessmentEnvironmentContext): Promise<boolean> {
		const nodeModulesPath = path.join(context.workDir, "node_modules");
		try {
			await access(path.join(context.workDir, "package.json"));
			await access(nodeModulesPath);
			for (const dependency of context.framework.dependencies) {
				await access(path.join(nodeModulesPath, dependency.package));
			}
			return false;
		} catch {
			return true;
		}
	}

	async setupEnvironment(context: AssessmentEnvironmentContext): Promise<void> {
		const { framework, workDir } = context;
		await writeFile(
			path.join(workDir, "package.json"),
			`${JSON.stringify(this.packageJson(framework), null, 2)}\n`,
			"utf8",
		);
		await execFileAsync("npm", ["install", "--no-save"], {
			cwd: workDir,
			env: { ...process.env, npm_config_loglevel: "error" },
		});

		const localSentryPath = process.env.SENTRY_JAVASCRIPT_PATH;
		if (localSentryPath && framework.sentryVersion === "local") {
			const packageDirectory =
				framework.platform === "nextjs" ? "nextjs" : "node";
			await execFileAsync(
				"npm",
				["link", path.join(localSentryPath, "packages", packageDirectory)],
				{ cwd: workDir, env: { ...process.env, npm_config_loglevel: "error" } },
			);
		}
	}

	private packageJson(
		framework: AssessmentEnvironmentContext["framework"],
	): object {
		const dependencies: Record<string, string> = {};
		if (framework.sentryVersion !== "local") {
			const sentryPackage =
				framework.platform === "nextjs" ? "@sentry/nextjs" : "@sentry/node";
			dependencies[sentryPackage] = framework.sentryVersion;
		}
		for (const dependency of framework.dependencies) {
			if (
				dependency.package === "@sentry/node" ||
				dependency.package === "@sentry/nextjs"
			) {
				continue;
			}
			dependencies[dependency.package] = resolveDependencyVersion(
				dependency.version,
				framework,
			);
		}
		return {
			name: `assessment-${framework.name}`,
			version: "1.0.0",
			type: "module",
			dependencies,
		};
	}

	async executeAssessmentProgram(
		context: AssessmentExecutionContext,
	): Promise<AssessmentExecutionResult> {
		let result: AssessmentExecutionResult;
		try {
			const execution = await execFileAsync("node", [context.programPath], {
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
