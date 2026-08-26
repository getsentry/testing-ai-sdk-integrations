#!/usr/bin/env node
const fs = require("node:fs");

const [, , baselinePath, candidatePath, outputPath] = process.argv;
if (!baselinePath || !candidatePath || !outputPath) {
	console.error(
		"Usage: compare-assessments.cjs <baseline.json> <candidate.json> <output.md>",
	);
	process.exit(1);
}

function readReport(reportPath) {
	try {
		return JSON.parse(fs.readFileSync(reportPath, "utf8"));
	} catch (error) {
		console.error(
			`Could not read assessment report ${reportPath}: ${error.message}`,
		);
		process.exit(1);
	}
}

const baseline = readReport(baselinePath);
const candidate = readReport(candidatePath);
if (baseline.schemaVersion !== candidate.schemaVersion) {
	console.error(
		`Assessment schema mismatch: ${baseline.schemaVersion} != ${candidate.schemaVersion}`,
	);
	process.exit(1);
}

const severityRank = { info: 1, minor: 2, major: 3, critical: 4 };
const stateRank = { healthy: 0, legacy: 1, malformed: 2, missing: 3 };
const variants = (report) =>
	new Map(
		report.targets.flatMap((target) =>
			target.variants.map((variant) => [variant.id, { target, variant }]),
		),
	);
const findings = (variant) =>
	new Map(variant.findings.map((finding) => [finding.findingId, finding]));

function capabilityStates(variant) {
	const states = new Map();
	for (const observation of variant.observations) {
		const current = states.get(observation.capability);
		const currentRank = stateRank[current] ?? -1;
		const nextRank = stateRank[observation.state] ?? -1;
		if (!current || nextRank > currentRank)
			states.set(observation.capability, observation.state);
	}
	return states;
}

const baselineVariants = variants(baseline);
const candidateVariants = variants(candidate);
const regressions = [];
const improvements = [];

for (const [variantId, candidateEntry] of candidateVariants) {
	const baselineEntry = baselineVariants.get(variantId);
	if (!baselineEntry) continue;
	const before = baselineEntry.variant;
	const after = candidateEntry.variant;

	if (before.completion === "complete" && after.completion === "incomplete") {
		regressions.push({ variantId, detail: "complete → incomplete" });
	} else if (
		before.completion === "incomplete" &&
		after.completion === "complete"
	) {
		improvements.push({ variantId, detail: "incomplete → complete" });
	}

	const beforeFindings = findings(before);
	const afterFindings = findings(after);
	for (const [findingId, finding] of afterFindings) {
		const previous = beforeFindings.get(findingId);
		if (
			!previous &&
			(finding.severity === "critical" || finding.severity === "major")
		) {
			regressions.push({
				variantId,
				findingId,
				detail: `new ${finding.severity} finding`,
			});
		} else if (
			previous &&
			severityRank[finding.severity] > severityRank[previous.severity]
		) {
			regressions.push({
				variantId,
				findingId,
				detail: `severity ${previous.severity} → ${finding.severity}`,
			});
		}
	}
	for (const [findingId, finding] of beforeFindings) {
		const current = afterFindings.get(findingId);
		if (!current) {
			improvements.push({
				variantId,
				findingId,
				detail: `${finding.severity} finding removed`,
			});
		} else if (
			severityRank[current.severity] < severityRank[finding.severity]
		) {
			improvements.push({
				variantId,
				findingId,
				detail: `severity ${finding.severity} → ${current.severity}`,
			});
		}
	}

	const beforeCapabilities = capabilityStates(before);
	const afterCapabilities = capabilityStates(after);
	for (const [capability, state] of afterCapabilities) {
		const previous = beforeCapabilities.get(capability);
		if (
			previous &&
			stateRank[state] !== undefined &&
			stateRank[previous] !== undefined &&
			stateRank[state] > stateRank[previous]
		) {
			regressions.push({
				variantId,
				capability,
				detail: `${capability}: ${previous} → ${state}`,
			});
		} else if (
			previous &&
			stateRank[state] !== undefined &&
			stateRank[previous] !== undefined &&
			stateRank[state] < stateRank[previous]
		) {
			improvements.push({
				variantId,
				capability,
				detail: `${capability}: ${previous} → ${state}`,
			});
		}
	}
}

const summaryRows = [
	["Targets", baseline.summary.targets, candidate.summary.targets],
	["Variants", baseline.summary.variants, candidate.summary.variants],
	["Complete", baseline.summary.complete, candidate.summary.complete],
	["Incomplete", baseline.summary.incomplete, candidate.summary.incomplete],
	[
		"Critical findings",
		baseline.summary.findings.critical,
		candidate.summary.findings.critical,
	],
	[
		"Major findings",
		baseline.summary.findings.major,
		candidate.summary.findings.major,
	],
	[
		"Minor findings",
		baseline.summary.findings.minor,
		candidate.summary.findings.minor,
	],
	[
		"Info findings",
		baseline.summary.findings.info,
		candidate.summary.findings.info,
	],
	["Score", baseline.summary.score, candidate.summary.score],
];
const delta = (before, after) =>
	after === before ? "—" : `${after - before > 0 ? "+" : ""}${after - before}`;
const renderItems = (items) =>
	items.length
		? items
				.map(
					(item) =>
						`- \`${item.variantId}\`${item.findingId ? ` / \`${item.findingId}\`` : ""}: ${item.detail}`,
				)
				.join("\n")
		: "- None";
const status = regressions.length
	? "🔴 Assessment regressions detected"
	: "🟢 No assessment regressions";
const markdown = `## ${status}

Assessment comparison uses stable variant, finding, and capability identifiers. Existing findings do not fail this check unless they worsen.

### Summary

| Metric | main | PR | Change |
| --- | ---: | ---: | ---: |
${summaryRows.map(([label, before, after]) => `| ${label} | ${before} | ${after} | ${delta(before, after)} |`).join("\n")}

### Regressions

${renderItems(regressions)}

### Improvements

${renderItems(improvements)}

---
*Generated by Sentry AI SDK integration assessments.*
`;
fs.writeFileSync(outputPath, markdown, "utf8");
fs.writeFileSync(
	outputPath.replace(/\.md$/, ".env"),
	`HAS_REGRESSIONS=${regressions.length > 0}\n`,
	"utf8",
);
console.log(
	`Comparison written to ${outputPath}: ${regressions.length} regression(s), ${improvements.length} improvement(s)`,
);
