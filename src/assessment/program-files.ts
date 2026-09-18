import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { getFileExtension } from "../platform-utils.js";
import type { AssessmentTargetConfig, ResolvedVariant } from "./matrix.js";
import { renderAssessmentProgram } from "./program-renderer.js";

export interface GeneratedAssessmentProgram {
	programPath: string;
	logPath: string;
	probeCallModes: Record<string, Array<"blocking" | "streaming">>;
}

/** Write programs under a stable variant-oriented path, never a scenario name. */
export async function writeAssessmentProgram(
	target: AssessmentTargetConfig,
	variant: ResolvedVariant,
	options: {
		runsDirectory?: string;
		probeIds?: ReadonlySet<string>;
	} = {},
): Promise<GeneratedAssessmentProgram> {
	const variantDirectory = path.join(
		options.runsDirectory ?? path.join(process.cwd(), "runs"),
		target.platform,
		target.category,
		target.framework,
		encodeURIComponent(variant.id),
	);
	await mkdir(variantDirectory, { recursive: true });

	const { contents, probeCallModes } = renderAssessmentProgram(
		target,
		variant,
		options.probeIds,
	);
	const extension = getFileExtension(target.platform);
	const programPath = path.join(variantDirectory, `assessment.${extension}`);
	const logPath = path.join(variantDirectory, "assessment.log");
	await writeFile(programPath, contents, "utf8");
	return { programPath, logPath, probeCallModes };
}
