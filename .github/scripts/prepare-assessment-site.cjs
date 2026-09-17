const fs = require("node:fs");
const path = require("node:path");
const { gzipSync } = require("node:zlib");
const { reportPath } = require("./report-path.cjs");

const [, , jsonPath, htmlPath, siteDir] = process.argv;
if (!jsonPath || !htmlPath || !siteDir)
	throw new Error(
		"Usage: prepare-assessment-site.cjs <report.json> <report.html> <site-dir>",
	);

try {
	const report = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
	const archive = path.join(siteDir, reportPath(report));
	const dated = path.join(siteDir, "reports", report.generatedAt.slice(0, 10));
	fs.mkdirSync(archive, { recursive: true });
	fs.copyFileSync(htmlPath, path.join(archive, "index.html"));
	fs.writeFileSync(
		path.join(archive, "assessment.json.gz"),
		gzipSync(fs.readFileSync(jsonPath)),
	);
	const redirect = (url) =>
		`<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=${url}"><title>Assessment report</title><a href="${url}">Open assessment report</a>`;
	fs.writeFileSync(
		path.join(dated, "index.html"),
		redirect(`${path.basename(archive)}/index.html`),
	);
	fs.copyFileSync(jsonPath, path.join(dated, "assessment.json"));
	fs.writeFileSync(
		path.join(siteDir, "index.html"),
		redirect(`${reportPath(report)}/index.html`),
	);
	fs.copyFileSync(jsonPath, path.join(siteDir, "assessment.json"));
} catch (error) {
	console.error(`Could not prepare the assessment site: ${error.message}`);
	process.exitCode = 1;
}
