import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { getFileExtension } from "../platform-utils.js";
import type { AssessmentTargetConfig, ResolvedVariant } from "./matrix.js";
import { renderAssessmentProgram } from "./program-renderer.js";

export interface GeneratedAssessmentProgram {
	programPath: string;
	logPath: string;
	probeCallModes: Record<string, Array<"blocking" | "streaming">>;
	environmentDirectory: string;
}

/** Keep dependency environments stable while giving executed programs attempt-specific paths. */
export async function writeAssessmentProgram(
	target: AssessmentTargetConfig,
	variant: ResolvedVariant,
	options: {
		runsDirectory?: string;
		probeIds?: ReadonlySet<string>;
		attemptPath?: string[];
	} = {},
): Promise<GeneratedAssessmentProgram> {
	const variantDirectory = path.resolve(
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
	const programDirectory = path.join(
		variantDirectory,
		...(options.attemptPath ?? []),
	);
	await mkdir(programDirectory, { recursive: true });
	const programPath = path.join(programDirectory, `assessment.${extension}`);
	const logPath = path.join(programDirectory, "assessment.log");
	await writeFile(programPath, contents, "utf8");
	return {
		programPath,
		logPath,
		probeCallModes,
		environmentDirectory: variantDirectory,
	};
}
