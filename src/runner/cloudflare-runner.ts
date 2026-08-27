import { execFile, spawn, type ChildProcess } from "node:child_process";
import { access, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { allocatePort } from "./port-allocator.js";
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
		const devVarsPath = path.join(context.workDir, ".dev.vars");
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
			const configPath = path.join(context.workDir, "wrangler.assessment.json");
			await writeFile(
				configPath,
				`${JSON.stringify(
					{
						name: "sentry-ai-assessment",
						main: path.basename(context.programPath),
						compatibility_date: "2024-09-23",
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
							reject(new Error("Wrangler did not start within 30 seconds.")),
						),
					30_000,
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
						cwd: context.workDir,
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
				processHandle.stdout?.on("data", (data: Buffer) => {
					const text = data.toString();
					stdout += text;
					inspect(text);
				});
				processHandle.stderr?.on("data", (data: Buffer) => {
					const text = data.toString();
					stderr += text;
					inspect(text);
				});
				processHandle.on("error", (error) => finish(() => reject(error)));
				processHandle.on("exit", (code) => {
					if (code !== null && code !== 0) {
						finish(() =>
							reject(new Error(`Wrangler exited with code ${code}.`)),
						);
					}
				});
			});

			const response = await fetch(`http://localhost:${port}/`, {
				signal: AbortSignal.timeout(context.timeoutMs),
			});
			const responseText = await response.text();
			stdout += `\n${responseText}\n`;
			if (!response.ok) {
				throw new Error(`Assessment worker returned HTTP ${response.status}.`);
			}
			await new Promise((resolve) => setTimeout(resolve, 1_000));
			result = { stdout, stderr, timedOut: false };
		} catch (error) {
			result = { ...executionFailure(error), stdout, stderr };
		} finally {
			if (processHandle?.pid) {
				try {
					process.kill(-processHandle.pid, "SIGTERM");
				} catch {
					processHandle.kill("SIGTERM");
				}
			}
			await rm(devVarsPath, { force: true });
		}
		await writeFile(context.logPath, executionLog(context, result), "utf8");
		return result;
	}
}
