#!/usr/bin/env node
/**
 * Fetches existing dated HTML and JSON reports from the live GitHub Pages site
 * so they survive redeployment (since deploy-pages replaces the entire site).
 *
 * Usage:
 *   node .github/scripts/fetch-existing-reports.cjs <history-json> <site-dir> <pages-url>
 */

const fs = require("fs");
const path = require("path");

const historyPath = process.argv[2];
const siteDir = process.argv[3];
const pagesUrl = process.argv[4];

if (!historyPath || !siteDir || !pagesUrl) {
	console.error(
		"Usage: node fetch-existing-reports.cjs <history-json> <site-dir> <pages-url>",
	);
	process.exit(1);
}

async function main() {
	let history;
	try {
		history = JSON.parse(fs.readFileSync(historyPath, "utf-8"));
	} catch (error) {
		throw new Error(`Could not read ${historyPath}: ${error.message}`);
	}
	const entries = history.schemaVersion === "3" ? history.entries : [];
	const today = new Date().toISOString().split("T")[0];

	let fetched = 0;
	let skipped = 0;
	let failed = 0;

	for (const entry of entries) {
		// Skip today's date — we'll use the freshly generated report
		if (entry.date === today) {
			skipped++;
			continue;
		}

		const reportDir = path.join(siteDir, "reports", entry.date);
		for (const fileName of ["index.html", "assessment.json"]) {
			const reportFile = path.join(reportDir, fileName);
			if (fs.existsSync(reportFile)) {
				skipped++;
				continue;
			}

			const url = `${pagesUrl}/reports/${entry.date}/${fileName}`;
			try {
				const response = await fetch(url);
				if (response.ok) {
					const contents = await response.text();
					fs.mkdirSync(reportDir, { recursive: true });
					fs.writeFileSync(reportFile, contents, "utf-8");
					fetched++;
				} else {
					failed++;
				}
			} catch {
				failed++;
			}
		}
	}

	console.log(
		`Fetched ${fetched} report files, skipped ${skipped}, unavailable ${failed}`,
	);
}

main().catch((err) => {
	console.error("Error fetching existing reports:", err);
	process.exit(1);
});
