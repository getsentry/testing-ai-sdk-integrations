import path from "node:path";
import { getProbeCatalog } from "./catalog.js";
import { toAssessmentTargetConfig } from "./discovery.js";
import { resolveInstalledSentryVersion } from "./installed-version.js";
import type { ResolvedVariant } from "./matrix.js";
import { partitionSpansByProbe } from "./partition.js";
import { writeAssessmentProgram } from "./program-files.js";
import { parseHarnessEvents } from "./protocol.js";
import { reconcileExecution } from "./reconciliation.js";
import type {
	ProbeResult,
	RuntimeFailure,
	VariantAssessment,
} from "./types.js";
import { evaluateVariant } from "./variant-evaluation.js";
import { CloudflareRunner } from "../runner/cloudflare-runner.js";
import { JavaScriptRunner } from "../runner/javascript-runner.js";
import { PythonRunner } from "../runner/python-runner.js";
import type { AssessmentRunner } from "../runner/execution.js";
import type { DiscoveredFramework } from "../runner/framework-discovery.js";
import {
	resolveFrameworkDependencies,
	type ResolvedFramework,
} from "../runner/framework-config.js";
import type { SpanCollector } from "../span-collector/server.js";

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
	return getProbeCatalog(framework.category as "llm" | "agents").flatMap(
		(probe) => {
			if (probeIds && !probeIds.has(probe.id)) return [];
			return [
				{
					probeId: probe.id,
					status: "pending",
					callModes: [],
					traceIds: [],
					spanIds: [],
				},
			];
		},
	);
}

function runtimeFailure(
	kind: RuntimeFailure["kind"],
	message: string,
	stopsVariant = true,
): RuntimeFailure {
	return { kind, message, stopsVariant };
}

function isRuntimeFailure(error: unknown): error is RuntimeFailure {
	return (
		typeof error === "object" &&
		error !== null &&
		"kind" in error &&
		"message" in error &&
		"stopsVariant" in error &&
		typeof error.kind === "string" &&
		typeof error.message === "string" &&
		typeof error.stopsVariant === "boolean"
	);
}

/** Executes a rendered assessment and converts runtime evidence to a variant assessment. */
export class AssessmentExecutor {
	private readonly cloudflareRunner = new CloudflareRunner();
	private readonly javascriptRunner = new JavaScriptRunner();
	private readonly pythonRunner = new PythonRunner();

	constructor(private readonly collector: SpanCollector) {}

	private runnerFor(
		platform: DiscoveredFramework["platform"],
	): AssessmentRunner {
		if (platform === "cloudflare") return this.cloudflareRunner;
		if (platform === "python") return this.pythonRunner;
		return this.javascriptRunner;
	}

	async execute(
		framework: DiscoveredFramework,
		variant: ResolvedVariant,
		options: { probeIds?: ReadonlySet<string> } = {},
	): Promise<VariantAssessment> {
		const probes = initialProbes(framework, options.probeIds);
		const failures: RuntimeFailure[] = [];
		let generatedProgramPath: string | undefined;
		let logPath: string | undefined;
		let spans: VariantAssessment["spans"] = [];
		let resolvedSentryVersion: string | undefined;

		try {
			const target = toAssessmentTargetConfig(framework);
			const generated = await writeAssessmentProgram(target, variant, {
				probeIds: options.probeIds,
			});
			generatedProgramPath = generated.programPath;
			logPath = generated.logPath;
			for (const probe of probes) {
				probe.callModes = generated.probeCallModes[probe.probeId] ?? [];
			}
			const workDir = path.dirname(generated.programPath);
			const executionFramework = runnerFramework(framework, variant);

			const executionContext = {
				workDir,
				sentryDsn: this.collector.getDsn(variant.id),
				programPath: generated.programPath,
				logPath: generated.logPath,
				timeoutMs: framework.platform === "cloudflare" ? 300_000 : 120_000,
			};
			const runner = this.runnerFor(framework.platform);
			const environmentContext = {
				workDir,
				framework: executionFramework,
			};
			if (await runner.needsSetup(environmentContext)) {
				await runner.setupEnvironment(environmentContext);
			}
			resolvedSentryVersion = await resolveInstalledSentryVersion(
				workDir,
				framework.platform,
			);
			this.collector.registerRun(variant.id);
			const execution = await runner.executeAssessmentProgram(executionContext);
			const protocol = parseHarnessEvents(
				`${execution.stdout}\n${execution.stderr}`,
			);
			failures.push(...reconcileExecution(probes, execution, protocol));

			await new Promise((resolve) => setTimeout(resolve, 250));
			spans = this.collector.getSpans(variant.id);
			const collectorFailures = this.collector.getFailures(variant.id);
			failures.push(...collectorFailures);
			const partition = partitionSpansByProbe(spans);
			for (const probe of probes) {
				const probeSpans = partition.byProbe.get(probe.probeId) ?? [];
				probe.spanIds = probeSpans.map((span) => span.span_id);
				probe.traceIds = [...new Set(probeSpans.map((span) => span.trace_id))];
			}
		} catch (error) {
			if (isRuntimeFailure(error)) {
				failures.push(error);
			} else {
				failures.push(
					runtimeFailure(
						generatedProgramPath ? "setup" : "render",
						error instanceof Error ? error.message : String(error),
					),
				);
			}
		}

		return evaluateVariant({
			variant,
			category: framework.category,
			probes,
			spans,
			runtimeFailures: failures,
			resolvedSentryVersion,
			generatedProgramPath,
			logPath,
		});
	}
}
