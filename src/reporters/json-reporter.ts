import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AssessmentReport } from "../assessment/types.js";

export async function writeAssessmentReport(
	report: AssessmentReport,
	reportDirectory = path.join(process.cwd(), "test-results"),
): Promise<string> {
	await mkdir(reportDirectory, { recursive: true });
	const timestamp = report.generatedAt.replace(/[:.]/g, "-");
	const reportPath = path.join(
		reportDirectory,
		`assessment-report-${timestamp}.json`,
	);
	await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
	return reportPath;
}
