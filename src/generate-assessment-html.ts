#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";
import { writeAssessmentHtml } from "./reporters/assessment-html.js";
import type { AssessmentReport } from "./assessment/types.js";

const reportPath = process.argv[2];
if (!reportPath) {
	console.error(
		"Usage: node dist/generate-assessment-html.js <assessment-report.json>",
	);
	process.exitCode = 1;
} else {
	try {
		const report = JSON.parse(
			await readFile(reportPath, "utf8"),
		) as AssessmentReport;
		const htmlPath = await writeAssessmentHtml(
			report,
			path.dirname(reportPath),
		);
		console.log(htmlPath);
	} catch (error) {
		console.error(error instanceof Error ? error.message : error);
		process.exitCode = 1;
	}
}
