import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { CloudflareRunner } from "../runner/cloudflare-runner.js";
import { snapshotDependencies } from "../runner/dependency-snapshot.js";
import type { AssessmentRunner } from "../runner/execution.js";
import {
	resolveFrameworkDependencies,
	type ResolvedFramework,
} from "../runner/framework-config.js";
import type { DiscoveredFramework } from "../runner/framework-discovery.js";
import { JavaScriptRunner } from "../runner/javascript-runner.js";
import { PythonRunner } from "../runner/python-runner.js";
import type { SpanCollector } from "../span-collector/server.js";
import { plannedCalls } from "./call-evidence.js";
import { getProbeCatalog } from "./catalog.js";
import { toAssessmentTargetConfig } from "./discovery.js";
import {
	resolveInstalledPackageVersion,
	resolveInstalledSentryVersion,
} from "./installed-version.js";
import type { AssessmentTargetConfig, ResolvedVariant } from "./matrix.js";
import { executeProbe } from "./probe-execution.js";
import { writeAssessmentProgram } from "./program-files.js";
import {
	classifyFailure,
	DEFAULT_PROBE_TIMEOUT_MS,
	retryDelay,
	retryReason,
} from "./retry.js";
import type {
	CapturedSpan,
	ProbeAttempt,
	ProbeResult,
	RuntimeFailure,
	VariantAssessment,
} from "./types.js";
import { evaluateVariant } from "./variant-evaluation.js";

export interface ExecutorOptions {
	executionId?: string;
	runsDirectory?: string;
	probeTimeoutMs?: number;
	retries?: 0 | 1;
	schedule?: <T>(endpoint: string, work: () => Promise<T>) => Promise<T>;
	runner?: AssessmentRunner;
	snapshotDependencies?: typeof snapshotDependencies;
	sleep?: (ms: number) => Promise<void>;
}

export function assessmentEndpoint(
	framework: Pick<DiscoveredFramework, "name">,
): string {
	if (framework.name === "manual") return "none";
	if (framework.name === "google-genai") return "google";
	if (
		[
			"openai",
			"anthropic",
			"langchain",
			"langgraph",
			"litellm",
			"vercel",
			"mastra",
			"openai-agents",
			"pydantic-ai",
		].includes(framework.name)
	)
		return "openrouter";
	throw new Error(
		`No assessment endpoint is configured for ${framework.name}.`,
	);
}

function runnerFramework(
	framework: DiscoveredFramework,
	variant: ResolvedVariant,
): ResolvedFramework {
	return {
		name: framework.name,
		platform: framework.platform,
		version: variant.identity.frameworkVersion,
		sentryVersion: variant.identity.sentryVersion,
		dependencies: resolveFrameworkDependencies(
			framework,
			variant.identity.frameworkVersion,
		),
		minimumPlatformVersion: framework.minimumPlatformVersion,
	};
}

function initialProbes(
	framework: DiscoveredFramework,
	probeIds?: ReadonlySet<string>,
): ProbeResult[] {
	const callModes: ProbeResult["callModes"] =
		framework.streamingMode === "blocking"
			? ["blocking"]
			: framework.streamingMode === "streaming"
				? ["streaming"]
				: ["blocking", "streaming"];
	return getProbeCatalog(framework.category)
		.filter((probe) => !probeIds || probeIds.has(probe.id))
		.map((definition) => {
			const probe: ProbeResult = {
				probeId: definition.id,
				status: "pending",
				callModes,
				traceIds: [],
				spanIds: [],
			};
			probe.calls = plannedCalls(framework.category, probe);
			return probe;
		});
}

export class AssessmentExecutor {
	readonly executionId: string;
	private readonly cloudflareRunner = new CloudflareRunner();
	private readonly javascriptRunner = new JavaScriptRunner();
	private readonly pythonRunner = new PythonRunner();

	constructor(
		private readonly collector: Pick<
			SpanCollector,
			"registerRun" | "getDsn" | "getSpans" | "getFailures"
		>,
		private readonly options: ExecutorOptions = {},
	) {
		this.executionId = options.executionId ?? randomUUID();
	}

	private runnerFor(
		platform: DiscoveredFramework["platform"],
	): AssessmentRunner {
		if (this.options.runner) return this.options.runner;
		if (platform === "cloudflare") return this.cloudflareRunner;
		if (platform === "python") return this.pythonRunner;
		return this.javascriptRunner;
	}

	private async runProbe(
		target: AssessmentTargetConfig,
		variant: ResolvedVariant,
		initial: ProbeResult,
		runner: AssessmentRunner,
		endpoint: string,
		deadlineMs: number,
	): Promise<{ attempts: ProbeAttempt[]; spans: CapturedSpan[] }> {
		const attempts: ProbeAttempt[] = [];
		const spans: CapturedSpan[] = [];
		let reason: ProbeAttempt["retryReason"];
		let delay: number | undefined;
		for (let number = 1; number <= 1 + (this.options.retries ?? 1); number++) {
			const work = () =>
				executeProbe({
					target,
					variant,
					initial,
					runner,
					collector: this.collector,
					executionId: this.executionId,
					number,
					deadlineMs,
					retryReason: reason,
					retryDelayMs: delay,
					runsDirectory: this.options.runsDirectory,
				});
			const result = this.options.schedule
				? await this.options.schedule(endpoint, work)
				: await work();
			attempts.push(result.attempt);
			spans.push(...result.spans);
			const failures = result.attempt.runtimeFailures;
			console.log(
				`  ${variant.id} / ${initial.probeId} / attempt ${number}: ${failures.length ? "failed" : "completed"} (${result.attempt.durationMs} ms)`,
			);
			if (!failures.length) {
				for (const previous of attempts.slice(0, -1))
					for (const failure of previous.runtimeFailures)
						failure.recovered = true;
				break;
			}
			reason = retryReason(failures);
			delay = retryDelay(failures);
			if (
				!reason ||
				delay === undefined ||
				number > (this.options.retries ?? 1)
			)
				break;
			console.log(
				`  Retrying ${initial.probeId}: ${reason}; waiting ${delay} ms.`,
			);
			await (
				this.options.sleep ??
				((ms) => new Promise((resolve) => setTimeout(resolve, ms)))
			)(delay);
		}
		return { attempts, spans };
	}

	async execute(
		framework: DiscoveredFramework,
		variant: ResolvedVariant,
		selection: { probeIds?: ReadonlySet<string> } = {},
	): Promise<VariantAssessment> {
		const probes = initialProbes(framework, selection.probeIds);
		const failures: RuntimeFailure[] = [];
		const attempts: ProbeAttempt[] = [];
		const spans: CapturedSpan[] = [];
		let generatedProgramPath: string | undefined;
		let logPath: string | undefined;
		let resolvedFrameworkVersion: string | undefined;
		let resolvedSentryVersion: string | undefined;
		let dependencySnapshotPath: string | undefined;
		let endpoint: string | undefined;
		let phase: RuntimeFailure["kind"] = "render";
		try {
			const target = toAssessmentTargetConfig(framework);
			const generated = await writeAssessmentProgram(target, variant, {
				probeIds: selection.probeIds,
				runsDirectory: this.options.runsDirectory,
				attemptPath: ["executions", encodeURIComponent(this.executionId)],
			});
			generatedProgramPath = generated.programPath;
			for (const probe of probes) {
				probe.callModes = generated.probeCallModes[probe.probeId] ?? [];
				probe.calls = plannedCalls(framework.category, probe);
			}
			const directory = path.dirname(generated.programPath);
			logPath = path.join(directory, "setup.log");
			phase = "setup";
			endpoint = assessmentEndpoint(framework);
			const runner = this.runnerFor(framework.platform);
			const executionFramework = runnerFramework(framework, variant);
			const environment = {
				workDir: generated.environmentDirectory,
				framework: executionFramework,
			};
			if (await runner.needsSetup(environment))
				await runner.setupEnvironment(environment);
			const frameworkPackage = executionFramework.dependencies.find(
				(dependency) => dependency.version === "framework",
			)?.package;
			if (frameworkPackage)
				resolvedFrameworkVersion = await resolveInstalledPackageVersion(
					environment.workDir,
					framework.platform,
					frameworkPackage,
				);
			resolvedSentryVersion = await resolveInstalledSentryVersion(
				environment.workDir,
				framework.platform,
			);
			dependencySnapshotPath = await (
				this.options.snapshotDependencies ?? snapshotDependencies
			)(environment, directory);
			await writeFile(
				logPath,
				"Assessment environment ready. See dependencies.json for installed versions.\n",
			);
			phase = "harness";
			const deadlineMs =
				this.options.probeTimeoutMs ??
				framework.executionTimeoutMs ??
				(framework.platform === "cloudflare"
					? 300_000
					: DEFAULT_PROBE_TIMEOUT_MS);
			for (const [index, initial] of probes.entries()) {
				const result = await this.runProbe(
					target,
					variant,
					initial,
					runner,
					endpoint,
					deadlineMs,
				);
				attempts.push(...result.attempts);
				spans.push(...result.spans);
				const latest = result.attempts.at(-1);
				if (latest) probes[index] = latest.probe;
			}
		} catch (error) {
			const failure = classifyFailure({
				kind: phase,
				message: error instanceof Error ? error.message : String(error),
				stopsVariant: true,
			});
			failures.push(failure);
			if (logPath)
				await writeFile(logPath, `${failure.kind}: ${failure.message}\n`).catch(
					() => undefined,
				);
		}
		failures.push(...attempts.flatMap((attempt) => attempt.runtimeFailures));
		return evaluateVariant({
			variant,
			category: framework.category,
			probes,
			spans,
			runtimeFailures: failures,
			resolvedFrameworkVersion,
			resolvedSentryVersion,
			generatedProgramPath,
			logPath,
			attempts,
			endpoint,
			dependencySnapshotPath,
		});
	}
}
