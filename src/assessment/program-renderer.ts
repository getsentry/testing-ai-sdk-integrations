import { getProbeInputs } from "../probes/inputs.js";
import {
	renderTemplate,
	type TemplateContext,
} from "../runner/template-renderer.js";
import { getProbeCatalog } from "./catalog.js";
import type { AssessmentTargetConfig, ResolvedVariant } from "./matrix.js";

export interface RenderedAssessmentProgram {
	contents: string;
	templatePath: string;
	probeCallModes: Record<string, Array<"blocking" | "streaming">>;
}

function callModes(
	streamingMode: AssessmentTargetConfig["streamingMode"],
): Array<"blocking" | "streaming"> {
	if (streamingMode === "streaming") return ["streaming"];
	if (streamingMode === "blocking") return ["blocking"];
	return ["blocking", "streaming"];
}

/** Render one ordered assessment program without expanding the variant matrix. */
export function renderAssessmentProgram(
	target: AssessmentTargetConfig,
	variant: ResolvedVariant,
	probeIds?: ReadonlySet<string>,
): RenderedAssessmentProgram {
	const inputs = getProbeInputs(target.category);
	const probeCallModes: Record<string, Array<"blocking" | "streaming">> = {};
	const probes = getProbeCatalog(target.category).flatMap((probe) => {
		if (probeIds && !probeIds.has(probe.id)) return [];
		const input = inputs[probe.id];
		const modes = callModes(target.streamingMode);
		probeCallModes[probe.id] = modes;
		const calls = modes.flatMap((mode) =>
			input.calls.map((call, callIndex) => ({
				...call,
				model: variant.modelOverrides.request ?? call.model,
				streaming: mode === "streaming",
				assessmentCallId: `${probe.id}:${mode}:${callIndex}`,
				assessmentCallMode: mode,
			})),
		);
		return [{ ...probe, input: { ...input, calls } }];
	});
	const templatePath = `${target.category}/${target.platform}/${target.framework}/assessment.njk`;
	const context: TemplateContext = {
		...(target.versionTemplateOptions?.[variant.identity.frameworkVersion] ??
			{}),
		...variant.identity.options,
		baseTemplate: `base.${target.platform}.assessment.njk`,
		targetId: variant.targetId,
		variantId: variant.id,
		probes,
		isAsync: variant.identity.executionMode === "async",
	};
	return {
		contents: renderTemplate(templatePath, context),
		templatePath,
		probeCallModes,
	};
}
