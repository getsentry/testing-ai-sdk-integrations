import { execFile, spawn, type ChildProcess } from "node:child_process";
import { access, rm, writeFile } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { allocatePort } from "./port-allocator.js";
import { stopProcessTree } from "./process.js";
import type {
	AssessmentEnvironmentContext,
	AssessmentExecutionContext,
	AssessmentExecutionResult,
	AssessmentRunner,
} from "./execution.js";
import {
	executionFailure,
	executionLog,
	resolveDependencyVersion,
} from "./execution.js";

const execFileAsync = promisify(execFile);

export class CloudflareRunner implements AssessmentRunner {
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
			timeout: 300_000,
			cwd: workDir,
			env: { ...process.env, npm_config_loglevel: "error" },
		});

		const localSentryPath = process.env.SENTRY_JAVASCRIPT_PATH;
		if (localSentryPath && framework.sentryVersion === "local") {
			await execFileAsync(
				"npm",
				["link", path.join(localSentryPath, "packages", "cloudflare")],
				{ cwd: workDir, env: { ...process.env, npm_config_loglevel: "error" } },
			);
		}
	}

	private packageJson(
		framework: AssessmentEnvironmentContext["framework"],
	): object {
		const dependencies: Record<string, string> = { wrangler: "latest" };
		if (framework.sentryVersion !== "local") {
			dependencies["@sentry/cloudflare"] = framework.sentryVersion;
		}
		for (const dependency of framework.dependencies) {
			if (dependency.package === "@sentry/cloudflare") continue;
			dependencies[dependency.package] = resolveDependencyVersion(
				dependency.version,
				framework,
			);
		}
		return {
			name: `assessment-cloudflare-${framework.name}`,
			version: "1.0.0",
			type: "module",
			dependencies,
		};
	}

	async executeAssessmentProgram(
		context: AssessmentExecutionContext,
	): Promise<AssessmentExecutionResult> {
		const startedAt = Date.now();
		const runtimeDir = path.dirname(context.programPath);
		const devVarsPath = path.join(runtimeDir, ".dev.vars");
		const log = createWriteStream(context.logPath);
		let logError: Error | undefined;
		log.on("error", (error) => {
			logError = error;
		});
		let processHandle: ChildProcess | undefined;
		let stdout = "";
		let stderr = "";
		let result: AssessmentExecutionResult;
		try {
			await rm(devVarsPath, { force: true });
			await writeFile(
				devVarsPath,
				[
					`OPENAI_API_KEY=${process.env.OPENAI_API_KEY ?? ""}`,
					`OPENROUTER_API_KEY=${process.env.OPENROUTER_API_KEY ?? ""}`,
					`GOOGLE_GENAI_API_KEY=${process.env.GOOGLE_GENAI_API_KEY ?? ""}`,
				].join("\n"),
				{ encoding: "utf8", mode: 0o600 },
			);
			const configPath = path.join(runtimeDir, "wrangler.assessment.json");
			await writeFile(
				configPath,
				`${JSON.stringify(
					{
						name: "sentry-ai-assessment",
						main: path.basename(context.programPath),
						compatibility_date: "2026-02-19",
						compatibility_flags: ["nodejs_compat"],
						vars: { SENTRY_DSN: context.sentryDsn },
					},
					null,
					2,
				)}\n`,
				"utf8",
			);

			const port = await allocatePort();
			await new Promise<void>((resolve, reject) => {
				let settled = false;
				const finish = (callback: () => void) => {
					if (settled) return;
					settled = true;
					clearTimeout(timeout);
					callback();
				};
				const timeout = setTimeout(
					() =>
						finish(() =>
							reject(
								Object.assign(
									new Error("Wrangler exceeded its startup deadline."),
									{ name: "TimeoutError" },
								),
							),
						),
					Math.min(30_000, context.timeoutMs),
				);
				processHandle = spawn(
					"npx",
					[
						"wrangler",
						"dev",
						"--config",
						path.basename(configPath),
						"--port",
						String(port),
						"--inspector-port",
						"0",
					],
					{
						cwd: runtimeDir,
						env: {
							...process.env,
							SENTRY_DSN: context.sentryDsn,
						},
						stdio: ["ignore", "pipe", "pipe"],
						detached: true,
					},
				);
				const inspect = (text: string) => {
					if (/Ready on (https?:\/\/[^\s]+)/.test(text)) finish(resolve);
				};
				processHandle.stdout?.setEncoding("utf8");
				processHandle.stderr?.setEncoding("utf8");
				processHandle.stdout?.on("data", (text: string) => {
					stdout += text;
					log.write(text);
					inspect(stdout);
				});
				processHandle.stderr?.on("data", (text: string) => {
					stderr += text;
					log.write(text);
					inspect(stderr);
				});
				processHandle.on("error", (error) => finish(() => reject(error)));
				processHandle.on("exit", (code) => {
					if (code !== null && code !== 0) {
						finish(() =>
							reject(
								new Error(
									`Wrangler exited with code ${code}.${/EADDRINUSE|Address already in use/i.test(stderr) ? " Address already in use (EADDRINUSE)." : ""}`,
								),
							),
						);
					}
				});
			});

			const response = await fetch(`http://localhost:${port}/`, {
				signal: AbortSignal.timeout(
					Math.max(1, context.timeoutMs - (Date.now() - startedAt)),
				),
			});
			const responseText = await response.text();
			stdout += `\n${responseText}\n`;
			if (!response.ok) {
				throw new Error(`Assessment worker returned HTTP ${response.status}.`);
			}
			await new Promise((resolve) => setTimeout(resolve, 1_000));
			if (logError) throw logError;
			result = { stdout, stderr, timedOut: false };
		} catch (error) {
			result = { ...executionFailure(error), stdout, stderr };
		} finally {
			if (processHandle) await stopProcessTree(processHandle);
			await new Promise<void>((resolve) => log.end(resolve));
			await rm(devVarsPath, { force: true });
		}
		await writeFile(context.logPath, executionLog(context, result), "utf8");
		return result;
	}
}
