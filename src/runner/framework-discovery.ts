import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type {
	AssessmentCategory,
	AssessmentPlatform,
} from "../assessment/types.js";
import type {
	FrameworkConfig,
	FrameworkDependency,
	OptionValue,
} from "./framework-config.js";

const templatesDirectory = path.join(
	path.dirname(fileURLToPath(import.meta.url)),
	"templates",
);
const categories = new Set<AssessmentCategory>(["llm", "agents"]);
const platforms = new Set<AssessmentPlatform>([
	"node",
	"python",
	"nextjs",
	"cloudflare",
]);

export interface DiscoveredFramework extends FrameworkConfig {
	templatePath: string;
	category: AssessmentCategory;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
	return (
		Array.isArray(value) &&
		value.length > 0 &&
		value.every((item) => typeof item === "string" && item.length > 0)
	);
}

function isDependency(value: unknown): value is FrameworkDependency {
	return (
		isRecord(value) &&
		typeof value.package === "string" &&
		value.package.length > 0 &&
		typeof value.version === "string" &&
		value.version.length > 0
	);
}

function isOptionValue(value: unknown): value is OptionValue {
	if (typeof value === "string") return value.length > 0;
	return (
		isRecord(value) &&
		typeof value.value === "string" &&
		isRecord(value.overrides)
	);
}

function hasValidOptions(value: unknown): boolean {
	return (
		value === undefined ||
		(isRecord(value) &&
			Object.values(value).every(
				(options) =>
					Array.isArray(options) &&
					options.length > 0 &&
					options.every(isOptionValue),
			))
	);
}

function hasExecutionMode(value: unknown): boolean {
	return (
		value === undefined ||
		value === "sync" ||
		value === "async" ||
		value === "both"
	);
}

function hasStreamingMode(value: unknown): boolean {
	return (
		value === undefined ||
		value === "streaming" ||
		value === "blocking" ||
		value === "both"
	);
}

export function parseFrameworkConfig(
	value: unknown,
	expectedPlatform: AssessmentPlatform,
): FrameworkConfig {
	if (!isRecord(value)) throw new Error("config must be a JSON object");
	if (typeof value.name !== "string" || value.name.length === 0) {
		throw new Error("name must be a non-empty string");
	}
	if (value.platform !== expectedPlatform) {
		throw new Error(
			`platform must match directory (${expectedPlatform}); received ${String(value.platform)}`,
		);
	}
	if (
		!Array.isArray(value.dependencies) ||
		!value.dependencies.every(isDependency)
	) {
		throw new Error("dependencies must contain package/version objects");
	}
	if (!isStringArray(value.versions)) {
		throw new Error("versions must be a non-empty string array");
	}
	if (!isStringArray(value.sentryVersions)) {
		throw new Error("sentryVersions must be a non-empty string array");
	}
	if (!hasExecutionMode(value.executionMode)) {
		throw new Error("executionMode must be sync, async, or both");
	}
	if (!hasStreamingMode(value.streamingMode)) {
		throw new Error("streamingMode must be streaming, blocking, or both");
	}
	if (!hasValidOptions(value.options)) {
		throw new Error("options must contain non-empty option arrays");
	}
	return value as unknown as FrameworkConfig;
}

function childDirectories(directory: string): string[] {
	const names: string[] = [];
	for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
		if (entry.isDirectory() && !entry.name.startsWith(".")) {
			names.push(entry.name);
		}
	}
	return names.sort((left, right) => left.localeCompare(right));
}

function loadFramework(
	frameworkPath: string,
	platform: AssessmentPlatform,
	category: AssessmentCategory,
): DiscoveredFramework {
	const configPath = path.join(frameworkPath, "config.json");
	const templatePath = path.join(frameworkPath, "assessment.njk");
	if (!fs.existsSync(configPath) || !fs.existsSync(templatePath)) {
		throw new Error(
			`Missing config.json or assessment.njk in ${frameworkPath}`,
		);
	}
	try {
		const config = parseFrameworkConfig(
			JSON.parse(fs.readFileSync(configPath, "utf8")),
			platform,
		);
		return { ...config, templatePath, category };
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw new Error(`Invalid framework config ${configPath}: ${message}`, {
			cause: error,
		});
	}
}

export function discoverFrameworks(): DiscoveredFramework[] {
	if (!fs.existsSync(templatesDirectory)) {
		throw new Error(`Templates directory not found: ${templatesDirectory}`);
	}
	const frameworks: DiscoveredFramework[] = [];
	for (const categoryName of childDirectories(templatesDirectory)) {
		if (!categories.has(categoryName as AssessmentCategory)) continue;
		const category = categoryName as AssessmentCategory;
		const categoryPath = path.join(templatesDirectory, category);
		for (const platformName of childDirectories(categoryPath)) {
			if (!platforms.has(platformName as AssessmentPlatform)) continue;
			const platform = platformName as AssessmentPlatform;
			const platformPath = path.join(categoryPath, platform);
			for (const frameworkName of childDirectories(platformPath)) {
				frameworks.push(
					loadFramework(
						path.join(platformPath, frameworkName),
						platform,
						category,
					),
				);
			}
		}
	}
	return frameworks;
}
