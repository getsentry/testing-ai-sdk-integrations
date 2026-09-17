#!/usr/bin/env node
const fs = require("node:fs");
const {
	primaryFailures,
	confirmedFailures,
} = require("./execution-health.cjs");

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

if (baseline.scoringVersion !== candidate.scoringVersion) {
	const candidates = candidate.targets.flatMap((target) => target.variants);
	const failures = candidates.some(
		(variant) => primaryFailures(variant).length > 0,
	);
	const reproduced = candidates.some(
		(variant) => confirmedFailures(variant).length > 0,
	);
	fs.writeFileSync(
		outputPath,
		"## Assessments are not comparable\n\nThe scoring contract changed. Establish a new baseline; do not interpret this as a regression or improvement.\n",
	);
	fs.writeFileSync(
		outputPath.replace(/\.md$/, ".env"),
		`HAS_REGRESSIONS=false\nCOMPARABLE=false\nHAS_EXECUTION_FAILURES=${failures}\nHAS_CONFIRMED_EXECUTION_FAILURES=${reproduced}\n`,
	);
	process.exit(0);
}

const severityRank = { info: 1, minor: 2, major: 3, critical: 4 };
const stateRank = { healthy: 0, legacy: 1, malformed: 2, missing: 3 };
const variants = (report) =>
	new Map(
		report.targets.flatMap((target) =>
			target.variants.map((variant) => [variant.id, { target, variant }]),
		),
	);
function latestEvidence(variant, item, probes) {
	if (!item.attemptId || !variant.attempts?.length) return true;
	const source = variant.attempts.find(
		(attempt) => attempt.id === item.attemptId,
	);
	if (!source || !probes.has(source.probe.probeId)) return false;
	const latest = variant.attempts
		.filter((attempt) => attempt.probe.probeId === source.probe.probeId)
		.at(-1);
	return source === latest;
}

const findings = (variant, probes) =>
	new Map(
		variant.findings
			.filter((finding) =>
				finding.occurrences.some(
					(item) =>
						probes.has(item.probeId) && latestEvidence(variant, item, probes),
				),
			)
			.map((finding) => [finding.findingId, finding]),
	);

function comparableProbes(before, after) {
	const eligible = (probe) =>
		probe.status === "completed" && probe.telemetryComplete !== false;
	const signature = (probe) =>
		(probe.calls || [])
			.map(
				(call) =>
					`${call.callId}:${call.status}:${Boolean(call.expectedError)}:${(
						call.tools || []
					)
						.map((tool) => `${tool.name}:${tool.status}`)
						.sort()
						.join(",")}`,
			)
			.sort()
			.join("|");
	const probes = new Set(
		(after.probes || [])
			.filter(
				(probe) =>
					eligible(probe) &&
					(before.probes || []).some(
						(previous) =>
							previous.probeId === probe.probeId &&
							eligible(previous) &&
							signature(previous) === signature(probe),
					),
			)
			.map((probe) => probe.probeId),
	);
	if (probes.size) probes.add("variant");
	return probes;
}

function capabilityStates(variant, probes) {
	const states = new Map();
	for (const observation of variant.observations) {
		if (
			!probes.has(observation.probeId) ||
			!latestEvidence(variant, observation, probes)
		)
			continue;
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
const executionChanges = [];
let confirmedExecutionFailures = 0;
let hasExecutionFailures = false;
let comparableProbeCount = 0;

for (const [variantId, candidateEntry] of candidateVariants) {
	const baselineEntry = baselineVariants.get(variantId);
	const after = candidateEntry.variant;
	hasExecutionFailures ||= primaryFailures(after).length > 0;
	const confirmed = confirmedFailures(after, baselineEntry?.variant);
	confirmedExecutionFailures += confirmed.length;
	for (const failure of confirmed)
		executionChanges.push({
			variantId,
			detail: `reproduced ${failure.kind} failure in ${failure.probeId || "setup"}`,
		});
	if (!baselineEntry) continue;
	const before = baselineEntry.variant;

	if (before.completion === "complete" && after.completion === "incomplete") {
		executionChanges.push({
			variantId,
			detail:
				"complete → incomplete (execution health, not a telemetry regression)",
		});
	} else if (
		before.completion === "incomplete" &&
		after.completion === "complete"
	) {
		executionChanges.push({ variantId, detail: "incomplete → complete" });
	}

	const probes = comparableProbes(before, after);
	comparableProbeCount += Math.max(0, probes.size - 1);
	const beforeFindings = findings(before, probes);
	const afterFindings = findings(after, probes);
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

	const beforeCapabilities = capabilityStates(before, probes);
	const afterCapabilities = capabilityStates(after, probes);
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
	[
		"Observed telemetry score",
		baseline.summary.telemetryScore === null ? null : baseline.summary.score,
		candidate.summary.telemetryScore === null ? null : candidate.summary.score,
	],
];
const delta = (before, after) =>
	typeof before !== "number" || typeof after !== "number" || after === before
		? "—"
		: `${after - before > 0 ? "+" : ""}${after - before}`;
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
	: hasExecutionFailures
		? "🟡 Execution incomplete; no confirmed telemetry regressions"
		: comparableProbeCount === 0
			? "⚪ No comparable assessment evidence"
			: "🟢 No assessment regressions";
const markdown = `## ${status}

Assessment comparison uses stable variant, finding, and capability identifiers on comparable completed probes. Missing execution coverage is not an improvement. Execution failures are reported separately and only confirmed after reproduction; product findings remain in the reports.

### Summary

| Metric | main | PR | Change |
| --- | ---: | ---: | ---: |
${summaryRows.map(([label, before, after]) => `| ${label} | ${before ?? "—"} | ${after ?? "—"} | ${delta(before, after)} |`).join("\n")}

### Execution health

${renderItems(executionChanges)}

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
	`HAS_REGRESSIONS=${regressions.length > 0}\nCOMPARABLE=${comparableProbeCount > 0}\nHAS_EXECUTION_FAILURES=${hasExecutionFailures}\nHAS_CONFIRMED_EXECUTION_FAILURES=${confirmedExecutionFailures > 0}\n`,
	"utf8",
);
console.log(
	`Comparison written to ${outputPath}: ${regressions.length} regression(s), ${improvements.length} improvement(s)`,
);
