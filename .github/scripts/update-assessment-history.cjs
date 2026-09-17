#!/usr/bin/env node
const { createHash } = require("node:crypto");
const fs = require("node:fs");

const {
	reportPath: archiveReportPath,
	retainedReportPath,
} = require("./report-path.cjs");
const HISTORY_SCHEMA_VERSION = "4";
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
		score: variant.telemetryScore === null ? null : variant.score,
		completion: variant.completion,
		executionHealth: variant.executionHealth,
		coverage: variant.coverage,
		runtimeFailures: variant.runtimeFailures,
		modelBehavior: variant.modelBehavior,
		resolvedFrameworkVersion: variant.resolvedFrameworkVersion,
		resolvedSentryVersion: variant.resolvedSentryVersion,
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
		score: target.telemetryScore === null ? null : target.score,
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

	// Retain prior scoring versions for auditability; charts filter comparable entries.
	const history = {
		schemaVersion: HISTORY_SCHEMA_VERSION,
		scoringVersion: report.scoringVersion,
		entries: [],
	};
	if (fs.existsSync(historyPath)) {
		const existing = readJson(historyPath);
		if (
			(existing.schemaVersion === "3" ||
				existing.schemaVersion === HISTORY_SCHEMA_VERSION) &&
			Array.isArray(existing.entries)
		) {
			history.entries = existing.entries.map((item) =>
				(item.reportPath && item.reportPath !== `reports/${item.date}`) ||
				item.date !== report.generatedAt.slice(0, 10)
					? item
					: {
							...item,
							reportPath: archiveReportPath({
								generatedAt: item.generatedAt || `${item.date}T00:00:00Z`,
								runId: item.runId || "legacy",
								runAttempt: item.runAttempt || "1",
								executionId: item.id || item.generatedAt || item.date,
							}),
							migrateFrom: retainedReportPath(item),
							reportJsonFile: "assessment.json.gz",
						},
			);
		}
	}

	const integrations = report.targets.map(snapshotTarget);
	const variantIds = integrations
		.flatMap((integration) => integration.variants.map((variant) => variant.id))
		.sort();
	const entry = {
		id: report.executionId || report.generatedAt,
		runId: report.runId || process.env.GITHUB_RUN_ID || null,
		runAttempt: report.runAttempt || process.env.GITHUB_RUN_ATTEMPT || null,
		reportPath: archiveReportPath(report),
		reportJsonFile: "assessment.json.gz",
		comparisonEligible:
			report.summary.incomplete === 0 && report.summary.telemetryScore !== null,
		execution: report.summary.execution,
		coverage: report.summary.coverage,
		date: report.generatedAt.slice(0, 10),
		generatedAt: report.generatedAt,
		commitSha: report.commitSha || process.env.GITHUB_SHA || null,
		reportSchemaVersion: report.schemaVersion,
		scoringVersion: report.scoringVersion,
		matrixFingerprint: createHash("sha256")
			.update(variantIds.join("\n"))
			.digest("hex")
			.slice(0, 16),
		durationMs: report.durationMs,
		targets: report.summary.targets,
		variants: report.summary.variants,
		score: report.summary.telemetryScore === null ? null : report.summary.score,
		findings: report.summary.findings,
		integrations,
	};

	const index = history.entries.findIndex(
		(item) => (item.id || item.generatedAt) === entry.id,
	);
	if (index >= 0) history.entries[index] = entry;
	else history.entries.push(entry);
	history.entries.sort((left, right) =>
		(left.generatedAt || left.date).localeCompare(
			right.generatedAt || right.date,
		),
	);

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
