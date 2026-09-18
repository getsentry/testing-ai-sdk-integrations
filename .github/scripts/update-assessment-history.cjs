#!/usr/bin/env node
const { createHash } = require("node:crypto");
const fs = require("node:fs");

const HISTORY_SCHEMA_VERSION = "3";
const [, , reportPath, historyPath] = process.argv;

if (!reportPath || !historyPath) {
	console.error(
		"Usage: update-assessment-history.cjs <assessment-report.json> <history.json>",
	);
	process.exit(1);
}

function readJson(filePath) {
	try {
		return JSON.parse(fs.readFileSync(filePath, "utf8"));
	} catch (error) {
		throw new Error(`Could not read ${filePath}: ${error.message}`);
	}
}

function countFindings(findings) {
	const counts = { critical: 0, major: 0, minor: 0, info: 0 };
	for (const finding of findings) counts[finding.severity]++;
	return counts;
}

const capabilityRank = {
	healthy: 0,
	not_observed: 1,
	not_applicable: 1,
	unsupported: 1,
	legacy: 2,
	blocked: 3,
	missing: 4,
	malformed: 5,
};

function summarizeCapabilities(observations) {
	const states = {};
	for (const observation of observations) {
		const current = states[observation.capability];
		if (
			!current ||
			capabilityRank[observation.state] > capabilityRank[current]
		) {
			states[observation.capability] = observation.state;
		}
	}
	return states;
}

function snapshotVariant(variant) {
	return {
		id: variant.id,
		identity: variant.identity,
		score: variant.score,
		completion: variant.completion,
		health: variant.health,
		findings: countFindings(variant.findings),
		findingIds: variant.findings.map((finding) => finding.findingId).sort(),
		capabilityStates: summarizeCapabilities(variant.observations),
	};
}

function snapshotTarget(target) {
	return {
		id: target.id,
		identity: target.identity,
		score: target.score,
		completion: target.completion,
		health: target.health,
		findings: countFindings(target.findings),
		findingIds: target.findings.map((finding) => finding.findingId).sort(),
		capabilityStates: target.capabilitySummary,
		variants: target.variants.map(snapshotVariant),
	};
}

try {
	const report = readJson(reportPath);
	if (
		report.schemaVersion !== "2" ||
		typeof report.scoringVersion !== "string" ||
		!Array.isArray(report.targets)
	) {
		throw new Error(
			"Assessment report must use schema version 2 and identify its scoring version.",
		);
	}

	// Older test history and earlier assessment-history drafts are intentionally
	// discarded because their scores are not comparable with this series.
	let history = {
		schemaVersion: HISTORY_SCHEMA_VERSION,
		scoringVersion: report.scoringVersion,
		entries: [],
	};
	if (fs.existsSync(historyPath)) {
		const existing = readJson(historyPath);
		if (
			existing.schemaVersion === HISTORY_SCHEMA_VERSION &&
			existing.scoringVersion === report.scoringVersion &&
			Array.isArray(existing.entries)
		) {
			history = existing;
		}
	}

	const integrations = report.targets.map(snapshotTarget);
	const variantIds = integrations
		.flatMap((integration) => integration.variants.map((variant) => variant.id))
		.sort();
	const entry = {
		date: report.generatedAt.slice(0, 10),
		generatedAt: report.generatedAt,
		commitSha: process.env.GITHUB_SHA || null,
		reportSchemaVersion: report.schemaVersion,
		scoringVersion: report.scoringVersion,
		matrixFingerprint: createHash("sha256")
			.update(variantIds.join("\n"))
			.digest("hex")
			.slice(0, 16),
		durationMs: report.durationMs,
		targets: report.summary.targets,
		variants: report.summary.variants,
		score: report.summary.score,
		findings: report.summary.findings,
		integrations,
	};

	const index = history.entries.findIndex((item) => item.date === entry.date);
	if (index >= 0) history.entries[index] = entry;
	else history.entries.push(entry);
	history.entries.sort((left, right) => left.date.localeCompare(right.date));

	fs.writeFileSync(
		historyPath,
		`${JSON.stringify(history, null, 2)}\n`,
		"utf8",
	);
	console.log(
		`Updated assessment history for ${entry.date}: ${entry.targets} integrations, score ${entry.score}`,
	);
} catch (error) {
	console.error(error.message);
	process.exit(1);
}
