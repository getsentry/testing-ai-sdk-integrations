#!/usr/bin/env node
/**
 * Fetches existing dated HTML and JSON reports from the live GitHub Pages site
 * so they survive redeployment (since deploy-pages replaces the entire site).
 *
 * Usage:
 *   node .github/scripts/fetch-existing-reports.cjs <history-json> <site-dir> <pages-url>
 */

const fs = require("node:fs");
const path = require("node:path");
const { gzipSync } = require("node:zlib");
const { retainedReportPath } = require("./report-path.cjs");

const historyPath = process.argv[2];
const siteDir = process.argv[3];
const pagesUrl = process.argv[4];

if (!historyPath || !siteDir || !pagesUrl) {
	console.error(
		"Usage: node fetch-existing-reports.cjs <history-json> <site-dir> <pages-url>",
	);
	process.exit(1);
}

async function fetchReport(url) {
	for (let attempt = 0; attempt < 3; attempt++) {
		try {
			const response = await fetch(url, {
				signal: AbortSignal.timeout(30_000),
			});
			if (!response.ok) throw new Error(`HTTP ${response.status}`);
			return Buffer.from(await response.arrayBuffer());
		} catch (cause) {
			if (attempt === 2)
				throw new Error(
					`Cannot preserve ${url}; refusing to publish an incomplete archive.`,
					{ cause },
				);
			await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
		}
	}
}

async function main() {
	let history;
	try {
		history = JSON.parse(fs.readFileSync(historyPath, "utf-8"));
	} catch (error) {
		throw new Error(`Could not read ${historyPath}: ${error.message}`);
	}
	const entries = ["3", "4"].includes(history.schemaVersion)
		? history.entries
		: [];

	let fetched = 0;
	let skipped = 0;
	const paths = new Map();
	for (const entry of entries) {
		const archive = retainedReportPath(entry);
		const jsonFile = entry.reportJsonFile || "assessment.json";
		if (!["assessment.json", "assessment.json.gz"].includes(jsonFile))
			throw new Error("History contains an unsafe JSON report filename.");
		paths.set(archive, {
			source: entry.migrateFrom
				? retainedReportPath({ reportPath: entry.migrateFrom })
				: archive,
			jsonFile,
			migrate: Boolean(entry.migrateFrom),
		});
		const dated = retainedReportPath({ date: entry.date });
		if (dated !== archive)
			paths.set(dated, {
				source: dated,
				jsonFile: "assessment.json",
				migrate: false,
			});
	}

	for (const [archivePath, { source, jsonFile, migrate }] of paths) {
		const reportDir = path.join(siteDir, archivePath);
		for (const fileName of ["index.html", jsonFile]) {
			const reportFile = path.join(reportDir, fileName);
			if (fs.existsSync(reportFile)) {
				skipped++;
				continue;
			}

			const compress = migrate && fileName === "assessment.json.gz";
			const url = `${pagesUrl}/${source}/${compress ? "assessment.json" : fileName}`;
			const contents = await fetchReport(url);
			fs.mkdirSync(reportDir, { recursive: true });
			fs.writeFileSync(reportFile, compress ? gzipSync(contents) : contents);
			fetched++;
		}
	}

	for (const entry of entries) delete entry.migrateFrom;
	fs.writeFileSync(historyPath, `${JSON.stringify(history, null, 2)}\n`);
	console.log(`Fetched ${fetched} report files, skipped ${skipped}`);
}

main().catch((err) => {
	console.error("Error fetching existing reports:", err);
	process.exit(1);
});
