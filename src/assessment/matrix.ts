import type {
	AssessmentCategory,
	AssessmentPlatform,
	TargetIdentity,
	VariantIdentity,
} from "./types.js";

export interface AssessmentOption {
	value: string;
	overrides?: {
		modelOverrides?: { request?: string; response?: string };
	};
}

/** The discovery data needed to resolve one target into executable variants. */
export interface AssessmentTargetConfig {
	platform: AssessmentPlatform;
	category: AssessmentCategory;
	framework: string;
	frameworkVersions: readonly string[];
	sentryVersions: readonly string[];
	executionMode?: "sync" | "async" | "both";
	streamingMode?: "streaming" | "blocking" | "both";
	options?: Readonly<Record<string, readonly (string | AssessmentOption)[]>>;
	versionTemplateOptions?: Readonly<
		Record<string, Readonly<Record<string, string | number | boolean>>>
	>;
	modelOverrides?: { request?: string; response?: string };
}

export interface ResolvedVariant {
	id: string;
	targetId: string;
	identity: VariantIdentity;
	modelOverrides: { request?: string; response?: string };
}

function createTargetId(identity: TargetIdentity): string {
	return `${identity.platform}/${identity.category}/${identity.framework}`;
}

function createVariantId(targetId: string, identity: VariantIdentity): string {
	const components = [
		`framework=${encodeURIComponent(identity.frameworkVersion)}`,
		`sentry=${encodeURIComponent(identity.sentryVersion)}`,
	];

	if (identity.executionMode) {
		components.push(`execution=${identity.executionMode}`);
	}
	for (const [key, value] of Object.entries(identity.options).sort(([a], [b]) =>
		a.localeCompare(b),
	)) {
		components.push(
			`option.${encodeURIComponent(key)}=${encodeURIComponent(value)}`,
		);
	}

	return `${targetId}/${components.join("/")}`;
}

function resolveModes<T extends "sync" | "async">(
	mode: T | "both" | undefined,
	both: readonly T[],
): readonly (T | undefined)[] {
	return mode === "both" ? both : [mode];
}

function optionCombinations(options: AssessmentTargetConfig["options"]): Array<{
	values: Record<string, string>;
	modelOverrides: { request?: string; response?: string };
}> {
	const entries = Object.entries(options ?? {}).sort(([a], [b]) =>
		a.localeCompare(b),
	);
	let combinations = [
		{ values: {}, modelOverrides: {} } as {
			values: Record<string, string>;
			modelOverrides: { request?: string; response?: string };
		},
	];

	for (const [name, values] of entries) {
		const normalized = values.map((value) =>
			typeof value === "string" ? { value } : value,
		);
		combinations = combinations.flatMap((combination) =>
			normalized.map((option) => ({
				values: { ...combination.values, [name]: option.value },
				modelOverrides: {
					...combination.modelOverrides,
					...(option.overrides?.modelOverrides ?? {}),
				},
			})),
		);
	}

	return combinations;
}

export function resolveVariants(
	config: AssessmentTargetConfig,
): ResolvedVariant[] {
	const target: TargetIdentity = {
		platform: config.platform,
		category: config.category,
		framework: config.framework,
	};
	const targetId = createTargetId(target);
	const variants: ResolvedVariant[] = [];

	for (const frameworkVersion of config.frameworkVersions) {
		for (const sentryVersion of config.sentryVersions) {
			for (const executionMode of resolveModes(config.executionMode, [
				"sync",
				"async",
			])) {
				for (const combination of optionCombinations(config.options)) {
					const identity: VariantIdentity = {
						frameworkVersion,
						sentryVersion,
						executionMode,
						options: combination.values,
					};
					variants.push({
						id: createVariantId(targetId, identity),
						targetId,
						identity,
						modelOverrides: {
							...(config.modelOverrides ?? {}),
							...combination.modelOverrides,
						},
					});
				}
			}
		}
	}

	return variants;
}
