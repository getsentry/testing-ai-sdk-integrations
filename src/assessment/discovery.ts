import type { DiscoveredFramework } from "../runner/framework-discovery.js";
import type { AssessmentCategory } from "./types.js";
import type { AssessmentOption, AssessmentTargetConfig } from "./matrix.js";

function categoryFor(framework: DiscoveredFramework): AssessmentCategory {
	if (framework.category === "llm" || framework.category === "agents") {
		return framework.category;
	}
	throw new Error(
		`Framework ${framework.name} has unsupported assessment category ${framework.category}.`,
	);
}

function assessmentOptions(
	framework: DiscoveredFramework,
): AssessmentTargetConfig["options"] {
	if (!framework.options) {
		return undefined;
	}
	return Object.fromEntries(
		Object.entries(framework.options).map(([name, values]) => [
			name,
			values.map<AssessmentOption>((value) => {
				if (typeof value === "string") return { value };
				const { modelOverrides } = value.overrides;
				return {
					value: value.value,
					...(modelOverrides && { overrides: { modelOverrides } }),
				};
			}),
		]),
	);
}

/** Convert discovery's filesystem schema into the assessment execution schema. */
export function toAssessmentTargetConfig(
	framework: DiscoveredFramework,
): AssessmentTargetConfig {
	return {
		platform: framework.platform,
		category: categoryFor(framework),
		framework: framework.name,
		frameworkVersions: framework.versions,
		sentryVersions: framework.sentryVersions,
		executionMode: framework.executionMode,
		streamingMode: framework.streamingMode,
		options: assessmentOptions(framework),
		versionTemplateOptions: Object.fromEntries(
			Object.entries(framework.versionOverrides ?? {}).map(
				([version, override]) => [version, override.templateOptions ?? {}],
			),
		),
		modelOverrides: framework.modelOverrides,
	};
}
