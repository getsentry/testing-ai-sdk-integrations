#!/usr/bin/env node
import "dotenv/config";
import { spawn } from "node:child_process";
import { parseArgs } from "node:util";
import {
	aggregateTarget,
	AssessmentExecutor,
	createReport,
	getProbeCatalog,
	resolveVariants,
	toAssessmentTargetConfig,
	writeAssessmentProgram,
} from "./assessment/index.js";
import type {
	AssessmentCategory,
	AssessmentPlatform,
} from "./assessment/types.js";
import type { ResolvedVariant } from "./assessment/matrix.js";
import { createLimiter } from "./concurrency.js";
import { writeAssessmentHtml } from "./reporters/assessment-html.js";
import { writeAssessmentReport } from "./reporters/json-reporter.js";
import {
	discoverFrameworks,
	type DiscoveredFramework,
} from "./runner/framework-discovery.js";
import { SpanCollector } from "./span-collector/server.js";

const DEFAULT_PARALLEL = 10;

const help = `Sentry AI SDK Assessments

Usage:
  npm test [command] [options]

Commands:
  run                          Run assessments (default)
  setup, render                Render assessment programs without provider calls
  list                         List targets and resolved variant counts

Options:
  --framework <pattern>        Filter by framework name or wildcard (repeatable)
  --platform <platform>        Filter by node, python, nextjs, cloudflare, or js
  --category, --type <value>   Filter by llm or agents (repeatable)
  --sync | --async             Filter by execution mode
  --option <key=value>         Filter by variant option (repeatable)
  --probe <id>                 Run selected probes for debugging (repeatable)
  --sentry-python <path>       Use a local sentry-python checkout
  --sentry-javascript <path>   Use a local sentry-javascript checkout
  --quick                      Run one representative variant per target
  --parallel, -j <N>           Run up to N variants in parallel (default: 10)
  --open                       Open the generated dashboard
  --verbose, -v               Show variant execution progress
  --help, -h                   Show this help
`;

type Command = "list" | "render" | "run";

interface CliOptions {
	command: Command;
	frameworks?: string[];
	platforms?: Set<AssessmentPlatform>;
	categories?: Set<AssessmentCategory>;
	executionModes?: Set<"sync" | "async">;
	optionFilters: Record<string, string>;
	probeIds?: Set<string>;
	sentryPythonPath?: string;
	sentryJavaScriptPath?: string;
	quick: boolean;
	parallel: number;
	open: boolean;
	verbose: boolean;
	help: boolean;
}

function parseParallel(value: string | undefined): number {
	if (!value) return DEFAULT_PARALLEL;
	const parsed = Number.parseInt(value.replace(/^=/, ""), 10);
	if (!Number.isInteger(parsed) || parsed < 1) {
		throw new Error("--parallel must be a positive integer.");
	}
	return parsed;
}

function parseOptions(values: string[] | undefined): Record<string, string> {
	const filters: Record<string, string> = {};
	for (const value of values ?? []) {
		const separator = value.indexOf("=");
		if (separator <= 0) {
			throw new Error(`--option must use key=value format. Received: ${value}`);
		}
		filters[value.slice(0, separator)] = value.slice(separator + 1);
	}
	return filters;
}

function parsePlatforms(
	values: string[] | undefined,
): Set<AssessmentPlatform> | undefined {
	if (!values) return undefined;
	const platforms = new Set<AssessmentPlatform>();
	for (const value of values) {
		if (value === "js") {
			platforms.add("node");
			platforms.add("nextjs");
			platforms.add("cloudflare");
			continue;
		}
		if (
			value !== "node" &&
			value !== "python" &&
			value !== "nextjs" &&
			value !== "cloudflare"
		) {
			throw new Error(
				"--platform must be node, python, nextjs, cloudflare, or js.",
			);
		}
		platforms.add(value);
	}
	return platforms;
}

function parseCategories(
	categories: string[] | undefined,
	types: string[] | undefined,
): Set<AssessmentCategory> | undefined {
	const values = [...(categories ?? []), ...(types ?? [])];
	if (values.length === 0) return undefined;
	const result = new Set<AssessmentCategory>();
	for (const value of values) {
		if (value !== "llm" && value !== "agents") {
			throw new Error("--category and --type must be llm or agents.");
		}
		result.add(value);
	}
	return result;
}

function selectedModes<T extends string>(
	firstSelected: boolean,
	first: T,
	secondSelected: boolean,
	second: T,
): Set<T> | undefined {
	if (!firstSelected && !secondSelected) return undefined;
	const result = new Set<T>();
	if (firstSelected) result.add(first);
	if (secondSelected) result.add(second);
	return result;
}

function parseCommand(): CliOptions {
	const { values, positionals } = parseArgs({
		args: process.argv.slice(2),
		options: {
			framework: { type: "string", multiple: true },
			platform: { type: "string", multiple: true },
			category: { type: "string", multiple: true },
			type: { type: "string", multiple: true },
			sync: { type: "boolean", default: false },
			async: { type: "boolean", default: false },
			option: { type: "string", multiple: true },
			probe: { type: "string", multiple: true },
			"sentry-python": { type: "string" },
			"sentry-javascript": { type: "string" },
			quick: { type: "boolean", default: false },
			parallel: { type: "string", short: "j" },
			open: { type: "boolean", default: false },
			verbose: { type: "boolean", short: "v", default: false },
			help: { type: "boolean", short: "h", default: false },
		},
		allowPositionals: true,
	});

	const requestedCommand = positionals[0] ?? "run";
	const command = requestedCommand === "setup" ? "render" : requestedCommand;
	if (command !== "list" && command !== "render" && command !== "run") {
		throw new Error(`Unknown assessment command: ${requestedCommand}`);
	}

	return {
		command,
		frameworks: values.framework,
		platforms: parsePlatforms(values.platform),
		categories: parseCategories(values.category, values.type),
		executionModes: selectedModes(values.sync, "sync", values.async, "async"),
		optionFilters: parseOptions(values.option),
		probeIds: values.probe ? new Set(values.probe) : undefined,
		sentryPythonPath: values["sentry-python"],
		sentryJavaScriptPath: values["sentry-javascript"],
		quick: values.quick,
		parallel: parseParallel(values.parallel),
		open: values.open,
		verbose: values.verbose,
		help: values.help,
	};
}

function variantMatches(
	variant: ResolvedVariant,
	options: CliOptions,
): boolean {
	if (
		options.executionModes &&
		(!variant.identity.executionMode ||
			!options.executionModes.has(variant.identity.executionMode))
	) {
		return false;
	}
	return Object.entries(options.optionFilters).every(
		([key, value]) => variant.identity.options[key] === value,
	);
}

interface TargetWork {
	framework: DiscoveredFramework;
	target: ReturnType<typeof toAssessmentTargetConfig>;
	variants: ResolvedVariant[];
}

function matchesWildcard(value: string, pattern: string): boolean {
	let valueIndex = 0;
	let patternIndex = 0;
	let wildcardIndex = -1;
	let wildcardValueIndex = 0;

	while (valueIndex < value.length) {
		if (
			patternIndex < pattern.length &&
			(pattern[patternIndex] === "?" ||
				pattern[patternIndex] === value[valueIndex])
		) {
			valueIndex++;
			patternIndex++;
		} else if (pattern[patternIndex] === "*") {
			wildcardIndex = patternIndex++;
			wildcardValueIndex = valueIndex;
		} else if (wildcardIndex !== -1) {
			patternIndex = wildcardIndex + 1;
			valueIndex = ++wildcardValueIndex;
		} else {
			return false;
		}
	}

	while (pattern[patternIndex] === "*") patternIndex++;
	return patternIndex === pattern.length;
}

function matchesFrameworkFilters(
	frameworkName: string,
	filters: string[] | undefined,
): boolean {
	return (
		!filters || filters.some((filter) => matchesWildcard(frameworkName, filter))
	);
}

function resolveWork(options: CliOptions): TargetWork[] {
	const work: TargetWork[] = [];
	for (const framework of discoverFrameworks()) {
		if (!matchesFrameworkFilters(framework.name, options.frameworks)) {
			continue;
		}
		if (options.platforms && !options.platforms.has(framework.platform)) {
			continue;
		}
		if (
			options.categories &&
			!options.categories.has(framework.category as AssessmentCategory)
		) {
			continue;
		}

		if (
			options.probeIds &&
			!getProbeCatalog(framework.category as AssessmentCategory).some((probe) =>
				options.probeIds?.has(probe.id),
			)
		) {
			continue;
		}

		let target = toAssessmentTargetConfig(framework);
		const useLocalSentry =
			(framework.platform === "python" && options.sentryPythonPath) ||
			(framework.platform !== "python" && options.sentryJavaScriptPath);
		if (useLocalSentry) {
			target = { ...target, sentryVersions: ["local"] };
		}
		const matchingVariants = resolveVariants(target).filter((variant) =>
			variantMatches(variant, options),
		);
		const variants = options.quick
			? matchingVariants.slice(0, 1)
			: matchingVariants;
		if (variants.length > 0) work.push({ framework, target, variants });
	}
	return work;
}

function openReport(reportPath: string): void {
	let command = "xdg-open";
	let args = [reportPath];
	if (process.platform === "darwin") {
		command = "open";
	} else if (process.platform === "win32") {
		command = "cmd";
		args = ["/c", "start", "", reportPath];
	}
	const child = spawn(command, args, { detached: true, stdio: "ignore" });
	child.on("error", (error) => {
		console.warn(`Could not open the dashboard: ${error.message}`);
	});
	child.unref();
}

async function main() {
	const options = parseCommand();
	if (options.help) {
		console.log(help);
		return;
	}

	if (options.sentryPythonPath) {
		process.env.SENTRY_PYTHON_PATH = options.sentryPythonPath;
	}
	if (options.sentryJavaScriptPath) {
		process.env.SENTRY_JAVASCRIPT_PATH = options.sentryJavaScriptPath;
	}

	const work = resolveWork(options);
	if (work.length === 0) {
		throw new Error("No assessment variants match the selected filters.");
	}

	if (options.command === "list") {
		for (const { target, variants } of work) {
			console.log(
				`${target.platform}/${target.category}/${target.framework}: ${variants.length} variants`,
			);
		}
		return;
	}

	if (options.command === "render") {
		let rendered = 0;
		for (const { target, variants } of work) {
			for (const variant of variants) {
				const output = await writeAssessmentProgram(target, variant, {
					probeIds: options.probeIds,
				});
				console.log(output.programPath);
				rendered++;
			}
		}
		console.log(`Rendered ${rendered} assessment program(s).`);
		return;
	}

	const startedAt = Date.now();
	const collector = new SpanCollector();
	await collector.start();
	try {
		const executor = new AssessmentExecutor(collector);
		const tasks = work.flatMap(({ framework, variants }) =>
			variants.map((variant) => ({ framework, variant })),
		);
		const limit = createLimiter(options.parallel);
		const results = await Promise.all(
			tasks.map(({ framework, variant }) =>
				limit(async () => {
					console.log(`Assessing ${variant.id}`);
					const assessment = await executor.execute(framework, variant, {
						probeIds: options.probeIds,
					});
					if (options.verbose) {
						console.log(
							`  ${assessment.score}/100 · ${assessment.findings.length} finding(s)`,
						);
					}
					return { targetId: variant.targetId, assessment };
				}),
			),
		);
		const assessmentsByTarget = new Map<string, typeof results>();
		for (const result of results) {
			const targetResults = assessmentsByTarget.get(result.targetId) ?? [];
			targetResults.push(result);
			assessmentsByTarget.set(result.targetId, targetResults);
		}
		const targets = work.map(({ target, variants }) =>
			aggregateTarget(
				{
					platform: target.platform,
					category: target.category,
					framework: target.framework,
				},
				(assessmentsByTarget.get(variants[0].targetId) ?? []).map(
					(result) => result.assessment,
				),
			),
		);
		const report = createReport(targets, Date.now() - startedAt);
		const htmlPath = await writeAssessmentHtml(report);
		const reportPath = await writeAssessmentReport(report);
		console.log(`Assessment report: ${reportPath}`);
		console.log(`Assessment dashboard: ${htmlPath}`);
		const integrationScore = Math.round(
			targets.reduce((total, target) => total + target.score, 0) /
				targets.length,
		);
		console.log(
			`Overview: ${integrationScore}/100 · ${targets.length} integrations · ${report.summary.incomplete} incomplete variants`,
		);
		if (options.open) openReport(htmlPath);
		if (report.summary.incomplete > 0) process.exitCode = 1;
	} finally {
		await collector.stop();
	}
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : error);
	process.exitCode = 1;
});
