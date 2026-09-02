import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import hljs from "highlight.js";
import { siCloudflare, siNextdotjs, siNodedotjs, siPython } from "simple-icons";
import { classifyScore, scoreVariant } from "../assessment/scoring.js";
import type {
	AssessmentPlatform,
	AssessmentRating,
	Finding,
	AssessmentReport,
	TargetAssessment,
	VariantAssessment,
} from "../assessment/types.js";
import type { CapturedSpan } from "../assessment/types.js";

function escapeHtml(value: unknown): string {
	return String(value)
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#39;");
}

function json(value: unknown): string {
	return escapeHtml(JSON.stringify(value, null, 2));
}

function scriptJson(value: unknown): string {
	return JSON.stringify(value).replaceAll("<", "\\u003c");
}

function scoreSparkline(
	attribute: "framework" | "target" | "variant",
	id: string,
): string {
	return `<svg class="score-sparkline" data-trend-${attribute}="${escapeHtml(id)}" viewBox="0 0 120 28" role="img" aria-label="score trend"></svg>`;
}

function scoreHelp(scoringVersion: AssessmentReport["scoringVersion"]): string {
	const explanation =
		scoringVersion === "3"
			? "Scores run from 0 to 100; higher is better. They measure telemetry quality across weighted domains, not the number of spans captured."
			: "Scores run from 0 to 100; higher is better. They are severity-weighted averages of evaluated telemetry observations.";
	return `<span class="score-help" tabindex="0" role="img" aria-label="How scoring works" data-tooltip="${escapeHtml(explanation)}">?</span>`;
}

function scoreExplanation(
	scoringVersion: AssessmentReport["scoringVersion"],
): string {
	const calculation =
		scoringVersion === "3"
			? `<p>Each variant starts at <strong>100</strong>. We score the worst finding in each applicable telemetry domain, weight domains by their importance, then apply a severity ceiling. Repeated spans add evidence, not points.</p>
			<p><strong>Domain quality:</strong> no finding 100 · info 95 · minor 80 · major 50 · critical 20. <strong>Score ceilings:</strong> info 95 · minor 90 · major 75 · critical 59.</p>
			<p>Incomplete runs are reduced by the share of assessment calls that completed; a run that never started scores 0. A target is the average of its variants, and the overall score is the average of targets, so every integration has equal influence.</p>`
			: `<p>Scores are severity-weighted averages of evaluated telemetry observations. A target is the average of its variants, and the overall score is the average of targets.</p>`;
	return `<details class="score-explanation"><summary>How scoring works <span>Higher is better</span></summary><div class="score-explanation-body"><div class="score-copy">${calculation}</div><div class="score-bands" aria-label="Score color ranges"><span class="score-band score-band-good"><strong>85-100</strong> good</span><span class="score-band score-band-warning"><strong>70-84</strong> improvements needed</span><span class="score-band score-band-bad"><strong>0-69</strong> significant improvements needed</span><span class="score-band score-band-bad"><strong>incomplete</strong> out of spec</span></div></div></details>`;
}

function formatDuration(durationMs: number): string {
	if (durationMs < 1_000) return `${Math.round(durationMs)} ms`;
	if (durationMs < 60_000) return `${(durationMs / 1_000).toFixed(1)} s`;
	return `${Math.floor(durationMs / 60_000)}m ${Math.round((durationMs % 60_000) / 1_000)}s`;
}

const severityRank = { critical: 0, major: 1, minor: 2, info: 3 } as const;

function findingCopy(value: string): string {
	return value
		.replaceAll(
			"Neither modern nor legacy input messages were captured.",
			"Neither the input-message convention defined in sentry-conventions nor the deprecated input attribute was captured.",
		)
		.replaceAll(
			"No modern messages, legacy text, or legacy tool calls were captured.",
			"Neither the output-message convention defined in sentry-conventions nor deprecated output text or tool calls were captured.",
		)
		.replaceAll("Legacy", "Deprecated")
		.replaceAll("legacy", "deprecated")
		.replaceAll("modern", "current convention")
		.replaceAll(
			"Span is not assigned to a probe",
			"Span is not assigned to an assessment call",
		)
		.replaceAll("agent probe", "agent assessment call")
		.replaceAll("tool probe", "tool assessment call")
		.replaceAll("probe input", "assessment input")
		.replaceAll("long-input probe", "long-input assessment call")
		.replaceAll("assessment probe", "assessment call");
}

function findingEvidence(finding: Finding): string {
	return finding.occurrences
		.map((occurrence) => {
			if (occurrence.evidence.length === 0) {
				return `<p class="finding-evidence-empty"><code>${escapeHtml(occurrence.probeId)}</code> has no captured span evidence</p>`;
			}
			return `<div class="finding-evidence"><span>assessment call <code>${escapeHtml(occurrence.probeId)}</code></span><ul>${occurrence.evidence
				.map((evidence) => {
					let label = "captured span";
					if (evidence.spanId) {
						label = `span ${evidence.spanId}`;
					}
					if (evidence.description) {
						label = evidence.description;
					}
					const attribute = evidence.attribute
						? `<code>${escapeHtml(evidence.attribute)}</code>`
						: "span";
					const value =
						evidence.value === undefined
							? ""
							: ` = ${escapeHtml(String(evidence.value).slice(0, 120))}`;
					const detail = `${attribute}${value}`;
					return evidence.spanId
						? `<li><a href="#span-${escapeHtml(evidence.spanId)}" data-span-target="span-${escapeHtml(evidence.spanId)}">${escapeHtml(label)}</a><span>${detail}</span></li>`
						: `<li><span>${escapeHtml(label)}</span><span>${detail}</span></li>`;
				})
				.join("")}</ul></div>`;
		})
		.join("");
}

function findingOccurrenceCount(finding: Finding): number {
	return finding.occurrences.reduce(
		(total, occurrence) => total + Math.max(occurrence.evidence.length, 1),
		0,
	);
}

function findingsHover(findings: readonly Finding[], label?: string): string {
	const ordered = [...findings].sort(
		(left, right) => severityRank[left.severity] - severityRank[right.severity],
	);
	const tooltip = ordered.length
		? ordered
				.map((finding) => `${finding.severity} — ${findingCopy(finding.title)}`)
				.join("\n")
		: "no findings";
	return `<span class="findings-hover${ordered.length === 0 ? " finding-zero" : ""}" tabindex="0" data-tooltip="${escapeHtml(tooltip)}">${escapeHtml(label ?? ordered.length)}</span>`;
}

function effectiveScore(assessment: VariantAssessment): number {
	return Number.isFinite(assessment.score)
		? assessment.score
		: scoreVariant(assessment);
}

const platformIcons = {
	node: siNodedotjs,
	python: siPython,
	nextjs: siNextdotjs,
	cloudflare: siCloudflare,
} as const;

function platformIcon(platform: AssessmentPlatform): string {
	const icon = platformIcons[platform];
	return `<span class="platform-icon" style="--brand:#${icon.hex}" title="${escapeHtml(icon.title)}"><svg viewBox="0 0 24 24" role="img" aria-label="${escapeHtml(icon.title)}"><path d="${icon.path}"/></svg></span>`;
}

function effectiveTargetScore(target: TargetAssessment): number {
	if (Number.isFinite(target.score)) return target.score;
	if (target.variants.length === 0) return 100;
	return Math.round(
		target.variants.reduce(
			(total, variant) => total + effectiveScore(variant),
			0,
		) / target.variants.length,
	);
}

function effectiveTargetRating(target: TargetAssessment): AssessmentRating {
	return classifyScore(effectiveTargetScore(target), target.completion);
}

function compactTargetAssessment(target: TargetAssessment): string {
	const score = effectiveTargetScore(target);
	const rating = effectiveTargetRating(target);
	return `<div class="compact-assessment rating-${rating}"><strong>${score}</strong></div>`;
}

interface TraceNode {
	span: CapturedSpan;
	children: TraceNode[];
}

function spanIssues(
	assessment: VariantAssessment,
	span: CapturedSpan,
): string[] {
	const issues = assessment.observations.flatMap((observation) => {
		if (observation.state === "healthy" || observation.state === "blocked") {
			return [];
		}
		return observation.evidence.some((item) => item.spanId === span.span_id)
			? [`${observation.capability}: ${observation.state}`]
			: [];
	});
	return [...new Set(issues)].sort((left, right) => left.localeCompare(right));
}

function buildTraceTrees(
	spans: readonly CapturedSpan[],
): Map<string, TraceNode[]> {
	const nodes = new Map<string, TraceNode>();
	const rootsByTrace = new Map<string, TraceNode[]>();
	for (const span of spans) {
		nodes.set(`${span.trace_id}:${span.span_id}`, { span, children: [] });
	}
	for (const node of nodes.values()) {
		const parentId = node.span.parent_span_id;
		const parent =
			typeof parentId === "string"
				? nodes.get(`${node.span.trace_id}:${parentId}`)
				: undefined;
		if (parent) {
			parent.children.push(node);
		} else {
			const roots = rootsByTrace.get(node.span.trace_id) ?? [];
			roots.push(node);
			rootsByTrace.set(node.span.trace_id, roots);
		}
	}
	const sortByStart = (traceNodes: TraceNode[]): void => {
		traceNodes.sort(
			(left, right) => left.span.start_timestamp - right.span.start_timestamp,
		);
		for (const traceNode of traceNodes) sortByStart(traceNode.children);
	};
	for (const roots of rootsByTrace.values()) sortByStart(roots);
	return rootsByTrace;
}

function traceIssueCount(
	assessment: VariantAssessment,
	node: TraceNode,
): number {
	return (
		spanIssues(assessment, node.span).length +
		node.children.reduce(
			(total, child) => total + traceIssueCount(assessment, child),
			0,
		)
	);
}

function traceNode(
	assessment: VariantAssessment,
	node: TraceNode,
	expectsError: boolean,
	traceStart: number,
	traceDuration: number,
	depth = 0,
): string {
	const issues = spanIssues(assessment, node.span);
	const expectedError =
		expectsError && node.span.status && node.span.status !== "ok";
	const left = ((node.span.start_timestamp - traceStart) / traceDuration) * 100;
	const width =
		((node.span.timestamp - node.span.start_timestamp) / traceDuration) * 100;
	const durationMs = (node.span.timestamp - node.span.start_timestamp) * 1_000;
	return `<li class="trace-node ${issues.length ? "has-issues" : ""}" style="--depth:${depth}">
		<details id="span-${escapeHtml(node.span.span_id)}"><summary><span class="span-label"><code>${escapeHtml(node.span.op)}</code><span>${escapeHtml(node.span.description ?? "unnamed span")}</span></span><span class="waterfall"><i style="--left:${Math.max(0, left).toFixed(2)}%;--width:${Math.max(1, width).toFixed(2)}%"></i></span><small class="span-duration">${escapeHtml(formatDuration(durationMs))}</small>${issues.length ? `<em class="span-status issue-count">${issues.length} issue${issues.length === 1 ? "" : "s"}</em>` : expectedError ? '<em class="span-status expected-error">expected error</em>' : '<em class="span-status"></em>'}</summary>
			<div class="span-detail">${issues.length ? `<ul class="span-issues">${issues.map((issue) => `<li>${escapeHtml(issue)}</li>`).join("")}</ul>` : ""}<pre>${json(node.span)}</pre></div>
		</details>
		${node.children.length ? `<ul>${node.children.map((child) => traceNode(assessment, child, expectsError, traceStart, traceDuration, depth + 1)).join("")}</ul>` : ""}
	</li>`;
}

function spanDetails(assessment: VariantAssessment): string {
	if (assessment.spans.length === 0) {
		return `<section class="detail-section"><h4>trace tree</h4><p class="empty">no spans captured</p></section>`;
	}
	const trees = buildTraceTrees(assessment.spans);
	return `<section class="detail-section"><div class="section-heading"><h4>trace tree</h4><span>${trees.size} traces · ${assessment.spans.length} spans</span></div>${[
		...trees.entries(),
	]
		.map(([traceId, roots], index) => {
			const probe = assessment.probes.find((candidate) =>
				candidate.traceIds.includes(traceId),
			);
			const expectsError =
				probe?.probeId === "agent.tool_error" ||
				probe?.probeId === "llm.provider_error";
			const issueCount = roots.reduce(
				(total, root) => total + traceIssueCount(assessment, root),
				0,
			);
			const traceSpans = assessment.spans.filter(
				(span) => span.trace_id === traceId,
			);
			const traceStart = Math.min(
				...traceSpans.map((span) => span.start_timestamp),
			);
			const traceEnd = Math.max(...traceSpans.map((span) => span.timestamp));
			const traceDuration = Math.max(traceEnd - traceStart, 0.001);
			return `<details class="trace ${issueCount ? "trace-has-issues" : "trace-healthy"}"${index === 0 ? " open" : ""}><summary><code>trace ${index + 1}</code><span>${roots.length} root span${roots.length === 1 ? "" : "s"}</span>${issueCount ? `<span class="issue-count">${issueCount} issue${issueCount === 1 ? "" : "s"}</span>` : expectsError ? '<span class="expected-error">expected error</span>' : '<span class="trace-ok">ok</span>'}</summary><ul class="trace-tree">${roots.map((root) => traceNode(assessment, root, expectsError, traceStart, traceDuration)).join("")}</ul></details>`;
		})
		.join("")}</section>`;
}

function findingDetails(assessment: VariantAssessment): string {
	if (assessment.findings.length === 0) {
		return `<section class="detail-section"><div class="section-heading"><h4>findings</h4></div><p class="no-findings">no findings</p></section>`;
	}
	const findings = [...assessment.findings].sort(
		(left, right) => severityRank[left.severity] - severityRank[right.severity],
	);
	return `<section class="detail-section"><div class="section-heading"><h4>findings</h4><span>${findings.length} total</span></div><div class="finding-list">${findings
		.map(
			(finding) =>
				`<article class="finding severity-${finding.severity}"><header><span class="severity">${escapeHtml(finding.severity)}</span><code>${escapeHtml(finding.findingId.replaceAll("legacy", "deprecated").replaceAll("modern", "current"))}</code></header><p class="finding-summary"><strong>${escapeHtml(findingCopy(finding.title))}</strong> ${escapeHtml(findingCopy(finding.description))}</p><details class="finding-occurrences"><summary>Occurrences (${findingOccurrenceCount(finding)})</summary><div class="finding-evidence-list">${findingEvidence(finding)}</div></details></article>`,
		)
		.join("")}</div></section>`;
}

function artifactDetails(assessment: VariantAssessment): string {
	return `<details class="secondary-detail artifact-detail"><summary>artifacts and ids</summary><dl><dt>variant id</dt><dd><code>${escapeHtml(assessment.id)}</code></dd><dt>program</dt><dd><code>${escapeHtml(assessment.generatedProgramPath ?? "not rendered")}</code></dd><dt>log</dt><dd><code>${escapeHtml(assessment.logPath ?? "no execution log")}</code></dd></dl></details>`;
}

function withoutProbeDefinitions(source: string): string {
	return source
		.replace(/^const probes = \[[\s\S]*?^\];\s*/m, "")
		.replace(/^PROBES = json\.loads\(r'''\[[\s\S]*?^\]'''\)\s*/m, "");
}

function sourceDetails(
	assessment: VariantAssessment,
	source: string | undefined,
): string {
	if (!source) return "";
	const snippet = withoutProbeDefinitions(source);
	const language = assessment.generatedProgramPath?.endsWith(".py")
		? "python"
		: "javascript";
	const filename = path.basename(
		assessment.generatedProgramPath ??
			`assessment.${language === "python" ? "py" : "js"}`,
	);
	const highlighted = hljs.highlight(snippet, { language }).value;
	return `<details class="secondary-detail source-detail" open><summary>executed code</summary><div class="source-toolbar"><code>${escapeHtml(filename)}</code><button class="copy-source" type="button">copy</button></div><pre><code class="hljs language-${language}">${highlighted}</code></pre></details>`;
}

function variantDetail(
	assessment: VariantAssessment,
	programSource: string | undefined,
): string {
	const runtimeFailures = assessment.runtimeFailures.length
		? `<section class="detail-section runtime-section"><div class="section-heading"><h4>runtime information</h4><span>${assessment.runtimeFailures.length} event${assessment.runtimeFailures.length === 1 ? "" : "s"}</span></div><ul class="failures">${assessment.runtimeFailures
				.map(
					(failure) =>
						`<li class="${failure.stopsVariant ? "stopping" : "non-stopping"}"><code>${escapeHtml(failure.kind)}</code><span>${escapeHtml(failure.message)}</span>${failure.stopsVariant ? "<strong>execution stopped</strong>" : ""}</li>`,
				)
				.join("")}</ul></section>`
		: "";
	return `<div class="detail-content">
		${runtimeFailures}${findingDetails(assessment)}${spanDetails(assessment)}
		<div class="secondary-stack">${artifactDetails(assessment)}${sourceDetails(assessment, programSource)}</div>
	</div>`;
}

function variantLabel(assessment: VariantAssessment): string {
	const configuration = [
		assessment.identity.executionMode,
		...Object.entries(assessment.identity.options).map(
			([key, value]) => `${key}=${value}`,
		),
	].filter(Boolean);
	return configuration.join(" · ") || "default";
}

function labelForKey(key: string): string {
	return key.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
}

function displayFrameworkVersion(assessment: VariantAssessment): string {
	return (
		assessment.resolvedFrameworkVersion ?? assessment.identity.frameworkVersion
	);
}

function displaySentryVersion(assessment: VariantAssessment): string {
	return assessment.resolvedSentryVersion ?? assessment.identity.sentryVersion;
}

function sentryVersionLabel(assessment: VariantAssessment): string {
	const version = displaySentryVersion(assessment);
	const major = /^(\d+)/.exec(version)?.[1];
	return major ? `Sentry v${major}` : `Sentry ${version}`;
}

function variantComparisonKey(assessment: VariantAssessment): string {
	return JSON.stringify([
		assessment.identity.frameworkVersion,
		assessment.identity.executionMode ?? null,
		Object.entries(assessment.identity.options).sort(([left], [right]) =>
			left.localeCompare(right),
		),
	]);
}

function variantComparisonGroups(
	target: TargetAssessment,
): VariantAssessment[][] {
	const groups = new Map<string, VariantAssessment[]>();
	for (const variant of target.variants) {
		const key = variantComparisonKey(variant);
		const group = groups.get(key) ?? [];
		group.push(variant);
		groups.set(key, group);
	}
	return [...groups.values()].map((group) =>
		group.sort((left, right) =>
			displaySentryVersion(left).localeCompare(
				displaySentryVersion(right),
				undefined,
				{ numeric: true },
			),
		),
	);
}

function variantMetadata(assessment: VariantAssessment): string {
	const callModes = [
		...new Set(assessment.probes.flatMap((probe) => probe.callModes ?? [])),
	].join(" + ");
	const pairs = [
		["sentry", displaySentryVersion(assessment)],
		...(assessment.resolvedSentryVersion &&
		assessment.resolvedSentryVersion !== assessment.identity.sentryVersion
			? [["requested sentry", assessment.identity.sentryVersion] as const]
			: []),
		...(assessment.identity.executionMode
			? [["execution", assessment.identity.executionMode] as const]
			: []),
		...Object.entries(assessment.identity.options),
		...(callModes ? [["calls", callModes] as const] : []),
		["framework", displayFrameworkVersion(assessment)],
		...(assessment.resolvedFrameworkVersion &&
		assessment.resolvedFrameworkVersion !== assessment.identity.frameworkVersion
			? [["requested framework", assessment.identity.frameworkVersion] as const]
			: []),
	];
	return `<span class="variant-kvs">${pairs
		.map(
			([key, value]) =>
				`<span class="variant-kv"><small>${escapeHtml(labelForKey(key))}</small><code>${escapeHtml(value)}</code></span>`,
		)
		.join("")}</span>`;
}

function targetDetail(
	target: TargetAssessment,
	programSources: ReadonlyMap<string, string>,
): string {
	let variantIndex = 0;
	const groups = variantComparisonGroups(target)
		.map(
			(group) =>
				`<div class="variant-comparison">${group
					.map((variant) => {
						const index = variantIndex++;
						const fragment = `variant-${encodeURIComponent(variant.id)}`;
						const versionLabel = sentryVersionLabel(variant);
						const linkLabel = `Link to ${versionLabel} variant ${index + 1}`;
						return `<details id="${escapeHtml(fragment)}" class="variant-panel"><summary><strong class="variant-name">${escapeHtml(versionLabel)}<a class="variant-permalink" href="#${escapeHtml(fragment)}" data-variant-link aria-label="${escapeHtml(linkLabel)}" title="${escapeHtml(linkLabel)}"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6.5 9.5l3-3M5 11H4a3 3 0 0 1 0-6h3M9 5h3a3 3 0 0 1 0 6H9" fill="none" stroke="currentColor" stroke-linecap="round"/></svg></a></strong><span class="variant-meta">${variantMetadata(variant)}</span><strong class="variant-findings">${findingsHover(variant.findings)}</strong><strong class="variant-score rating-${classifyScore(effectiveScore(variant), variant.completion)}">${effectiveScore(variant)}</strong><span class="variant-trend">${scoreSparkline("variant", variant.id)}</span></summary>${variantDetail(variant, programSources.get(variant.id))}</details>`;
					})
					.join("")}</div>`,
		)
		.join("");
	return `<div class="target-detail"><div class="variant-header"><span>Sentry SDK</span><span class="variant-meta">configuration / versions</span><span class="variant-findings">findings</span><span class="variant-score">score</span><span class="variant-trend">trend</span></div><div class="variant-stack">${groups}</div></div>`;
}

function targetRow(
	target: TargetAssessment,
	index: number,
	programSources: ReadonlyMap<string, string>,
): string {
	const rowId = `target-${index}`;
	const frameworkVersions = [
		...new Set(target.variants.map(displayFrameworkVersion)),
	];
	const sentryVersions = [
		...new Set(target.variants.map(displaySentryVersion)),
	];
	const incomplete = target.variants.filter(
		(variant) => variant.completion === "incomplete",
	).length;
	const search = [
		target.id,
		target.identity.framework,
		target.identity.platform,
		frameworkVersions.join(" "),
		sentryVersions.join(" "),
		...target.variants.map(
			(variant) => `${variant.id} ${variantLabel(variant)}`,
		),
	].join(" ");
	return `<tr class="target-row" hidden data-detail="${rowId}" data-target-id="${escapeHtml(target.id)}" data-framework="${escapeHtml(target.identity.framework)}" data-platform="${escapeHtml(target.identity.platform)}" data-score="${effectiveTargetScore(target)}" data-variants="${target.variants.length}" data-findings="${target.findings.length}" data-incomplete="${incomplete}" data-search="${escapeHtml(search.toLowerCase())}" tabindex="0" aria-expanded="false">
		<td class="platform-cell">${platformIcon(target.identity.platform)}</td>
		<td><span class="version-inline"><code>${escapeHtml(frameworkVersions.join(", "))}</code><span>· sentry</span><code>${escapeHtml(sentryVersions.join(", "))}</code></span></td>
		<td><strong class="variant-count">${target.variants.length}</strong></td>
		<td><strong class="target-findings">${findingsHover(target.findings)}</strong></td>
		<td class="score-cell">${compactTargetAssessment(target)}</td>
		<td class="trend-cell">${scoreSparkline("target", target.id)}</td>
	</tr><tr id="${rowId}" class="detail-row" hidden><td colspan="6">${targetDetail(target, programSources)}</td></tr>`;
}

export function renderAssessmentHtml(
	report: AssessmentReport,
	programSources: ReadonlyMap<string, string> = new Map(),
): string {
	const targetsByFramework = new Map<string, TargetAssessment[]>();
	for (const target of report.targets) {
		const targets = targetsByFramework.get(target.identity.framework) ?? [];
		targets.push(target);
		targetsByFramework.set(target.identity.framework, targets);
	}
	let rowIndex = 0;
	const rows = [...targetsByFramework.entries()]
		.sort(([left], [right]) => {
			const priority = ["vercel", "openai"];
			const leftRank = priority.indexOf(left.toLowerCase());
			const rightRank = priority.indexOf(right.toLowerCase());
			if (leftRank !== -1 || rightRank !== -1) {
				return (
					(leftRank === -1 ? priority.length : leftRank) -
					(rightRank === -1 ? priority.length : rightRank)
				);
			}
			return left.localeCompare(right);
		})
		.map(([framework, targets]) => {
			const variantCount = targets.reduce(
				(total, target) => total + target.variants.length,
				0,
			);
			const groupScore = Math.round(
				targets.reduce(
					(total, target) => total + effectiveTargetScore(target),
					0,
				) / targets.length,
			);
			const groupFindings = targets.flatMap((target) => target.findings);
			const groupRating = classifyScore(
				groupScore,
				targets.some((target) => target.completion === "incomplete")
					? "incomplete"
					: "complete",
			);
			return `<tbody data-framework-group="${escapeHtml(framework)}" data-expanded="false"><tr class="framework-group" tabindex="0" aria-expanded="false"><th colspan="2"><div class="framework-heading"><strong>${escapeHtml(framework)}</strong><small>${targets.length} platform${targets.length === 1 ? "" : "s"}</small></div></th><th class="group-variants">${variantCount}</th><th class="group-findings">${findingsHover(groupFindings)}</th><th class="group-score rating-${groupRating}">${groupScore}</th><th class="group-trend">${scoreSparkline("framework", framework)}</th></tr>${[
				...targets,
			]
				.sort((left, right) =>
					left.identity.platform.localeCompare(right.identity.platform),
				)
				.map((target) => targetRow(target, rowIndex++, programSources))
				.join("")}</tbody>`;
		});
	const overallScore = report.summary.score;
	const findings = report.targets.reduce(
		(total, target) => total + target.findings.length,
		0,
	);
	const currentTrendEntry = {
		date: report.generatedAt.slice(0, 10),
		score: overallScore,
		integrations: report.targets.map((target) => ({
			id: target.id,
			framework: target.identity.framework,
			score: effectiveTargetScore(target),
			variants: target.variants.map((variant) => ({
				id: variant.id,
				score: effectiveScore(variant),
			})),
		})),
	};

	return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>sentry/testing-ai-sdk integrations</title>
<style>
:root{color-scheme:light;--canvas:#f4f6f3;--surface:#fff;--surface-soft:#f8faf8;--ink:#17211d;--muted:#68736e;--line:#dce3de;--line-strong:#c8d2cb;--green:#147d64;--green-soft:#e5f4ed;--yellow:#a36a0a;--yellow-soft:#fff3cf;--orange:#b4532a;--orange-soft:#ffeadc;--red:#b9363e;--red-soft:#fde8e9;--blue:#256a8a;--blue-soft:#e8f2f6;--shadow:none;--mono:'SFMono-Regular','Cascadia Code','Roboto Mono',Consolas,monospace;--sans:Inter,'SF Pro Text',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}*{box-sizing:border-box;border-radius:0!important}.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}body{margin:0;background:var(--canvas);color:var(--ink);font:14px/1.5 var(--mono)}button,input,select{font:inherit}code,pre{font-family:var(--mono)}.page-header{display:flex;align-items:center;height:48px;padding:0;border-bottom:1px solid var(--line);background:var(--surface)}.page-header h1{width:100%;max-width:1280px;margin:0 auto;padding:0 24px;font-size:14px;letter-spacing:-.02em}.main{width:100%;max-width:1280px;margin:0 auto;padding:16px 24px 40px}.toolbar{display:grid;grid-template-columns:90px minmax(0,1fr) 100px 110px 110px;align-items:stretch;margin-bottom:12px}.toolbar input{grid-column:1/3;width:100%;min-height:42px;border:1px solid var(--line-strong);background:var(--surface);color:var(--ink);padding:7px 9px;outline:none;font-size:13px}.toolbar input:focus{border-color:var(--green);box-shadow:0 0 0 3px #147d6418}.summary-stat{display:flex;flex-direction:column;justify-content:center;padding:0 10px;color:var(--muted);font-size:10px}.summary-stat strong{color:var(--ink);font-size:15px}.summary-variants{grid-column:3}.summary-findings{grid-column:4}.summary-score{grid-column:5;align-items:flex-end;text-align:right}.summary-score strong{color:var(--score-color,var(--ink));font-size:18px}.score-label,.score-column-label{display:inline-flex;align-items:center;gap:5px}.score-help{position:relative;display:inline-grid;place-items:center;width:14px;height:14px;border:1px solid var(--line-strong);border-radius:50%!important;color:var(--muted);cursor:help;font:700 9px/1 var(--sans)}.score-help:after{content:attr(data-tooltip);position:absolute;right:0;top:calc(100% + 6px);z-index:30;display:none;width:360px;max-width:70vw;padding:7px 9px;border:1px solid var(--line-strong);background:#101916;color:#f4f7f5;box-shadow:0 4px 12px #0002;white-space:normal;text-align:left;text-transform:none;letter-spacing:0;font:11px/1.5 var(--mono)}.score-help:hover:after,.score-help:focus:after{display:block}.score-explanation{margin-bottom:12px;border:1px solid var(--line);background:var(--surface)}.score-explanation>summary{display:flex;align-items:center;gap:8px;padding:8px 12px;cursor:pointer;font-weight:700}.score-explanation>summary span{color:var(--muted);font-size:10px;font-weight:500}.score-explanation-body{display:grid;grid-template-columns:minmax(0,1fr) 280px;gap:24px;padding:12px;border-top:1px solid var(--line);background:var(--surface-soft)}.score-copy p{margin:0 0 8px;color:#4d5752;font-size:11px}.score-copy p:last-child{margin-bottom:0}.score-bands{display:grid;align-content:start;gap:5px}.score-band{display:grid;grid-template-columns:75px 1fr;gap:8px;padding:4px 7px;border-left:4px solid var(--score-color);background:var(--surface);color:var(--muted);font-size:10px}.score-band strong{color:var(--score-color)}.score-band-good{--score-color:var(--green)}.score-band-warning{--score-color:var(--yellow)}.score-band-bad{--score-color:var(--red)}.trend-panel{width:100%;margin-bottom:12px;padding:10px 12px 6px;border:1px solid var(--line);background:var(--surface)}.trend-heading{display:flex;align-items:baseline;justify-content:space-between;color:var(--muted);font-size:10px}.trend-heading strong{color:var(--ink);letter-spacing:.04em}.trend-panel>svg{display:block;width:100%;height:auto}.trend-grid{stroke:#edf0ee}.trend-line{fill:none;stroke-width:3;vector-effect:non-scaling-stroke}.trend-dot{stroke:var(--surface);stroke-width:2}.trend-label{fill:var(--muted);font-size:10px}.score-sparkline{display:block;width:120px;height:28px;margin-left:auto}.sparkline-line{fill:none;stroke-width:2;vector-effect:non-scaling-stroke}.sparkline-dot{stroke:var(--surface);stroke-width:1.5}.table-shell{overflow-x:auto;background:var(--surface);border:1px solid var(--line);border-radius:14px;box-shadow:var(--shadow)}.matrix{width:100%;border-collapse:separate;border-spacing:0;min-width:960px}.matrix th{padding:7px 10px;background:var(--surface-soft);border-bottom:1px solid var(--line);color:var(--muted);text-align:left;letter-spacing:.04em;font:700 12px var(--mono)}.matrix th:first-child{width:90px;text-align:left}.matrix th:nth-child(3){width:100px}.matrix th:nth-child(4),.matrix th:nth-child(5){width:110px}.matrix th:nth-child(6){width:140px}.matrix th:last-child,.trend-cell{text-align:right}.score-cell{text-align:left}.matrix td{padding:7px 10px;border-bottom:1px solid var(--line);vertical-align:middle}.target-row{cursor:pointer;transition:background .15s ease}.target-row:hover,.target-row:focus{background:#f1f7f3;outline:none}.target-row[aria-expanded="true"]{background:#edf5f0}.platform-cell{text-align:left}.platform-icon{display:inline-grid;place-items:center;width:30px;height:30px;border:1px solid var(--line);border-radius:7px;background:#fff;color:var(--brand)}.platform-icon svg{width:17px;height:17px;fill:currentColor}.framework-name{display:block;font-size:12px}.category{display:inline-block;margin-top:2px;padding:1px 5px;border-radius:999px;background:#edf1ee;color:var(--muted);font:600 10px var(--mono)}.version-line{display:flex;align-items:center;gap:6px;margin:1px 0}.version-line small{width:42px;color:var(--muted);font-size:8px;text-transform:none}.version-line code{font-size:9px}.version-inline{display:flex;align-items:center;gap:6px;white-space:nowrap}.version-inline span{color:var(--muted);font-size:10px}.version-inline code{font-size:11px}.variant-count{font-size:13px}.framework-group{cursor:pointer}.framework-group:focus{outline:none}.framework-group th,.matrix .framework-group th:first-child{width:auto;padding:8px 10px;background:#eef1ef;color:var(--ink);text-align:left;text-transform:none;letter-spacing:0}.framework-group:hover th,.framework-group:focus th{background:#e5e9e6}.framework-heading{display:flex;align-items:center;gap:12px}.framework-heading>strong{font-size:15px}.framework-heading small{color:var(--muted);font-size:11px;font-weight:500}.matrix .framework-group .group-variants{font-size:13px}.matrix .framework-group .group-findings{text-align:left;font-size:14px}.matrix .framework-group .group-score{color:var(--score-color,var(--ink));text-align:left;font-size:21px}.matrix .framework-group .group-trend{width:140px;text-align:right}.configuration{display:flex;flex-wrap:wrap;gap:5px;max-width:360px}.configuration code{padding:3px 6px;border:1px solid var(--line);border-radius:5px;background:var(--surface-soft);font-size:10px}.coverage{display:block;font-size:11px}.coverage-label{display:block;color:var(--muted);font-size:8px}.compact-assessment{--score-color:var(--orange);display:flex;align-items:baseline;justify-content:flex-start}.compact-assessment strong{color:var(--score-color);font-size:16px}.compact-assessment strong span{font-size:8px;color:var(--muted)}.target-findings{font-size:14px}.findings-hover{position:relative;display:inline-block;cursor:help}.findings-hover:after{content:attr(data-tooltip);position:absolute;right:0;bottom:calc(100% + 6px);z-index:20;display:none;width:max-content;max-width:420px;padding:7px 9px;border:1px solid var(--line-strong);background:#101916;color:#f4f7f5;box-shadow:0 4px 12px #0002;white-space:pre-line;text-align:left;text-transform:none;letter-spacing:0;font:11px/1.5 var(--mono)}.findings-hover:hover:after,.findings-hover:focus:after{display:block}.finding-zero{color:var(--muted);font-weight:500}.target-detail{padding:0}.variant-header,.variant-panel>summary{display:grid;grid-template-columns:90px minmax(0,1fr) 100px 110px 110px 130px;align-items:center;gap:0;padding:7px 0}.variant-header{border-bottom:1px solid var(--line);background:var(--surface-soft);color:var(--muted);letter-spacing:.04em;font-size:10px}.variant-stack{display:grid;gap:0}.variant-comparison{border-bottom:2px solid var(--line-strong)}.variant-comparison:last-child{border-bottom:0}.variant-panel{border:0;border-bottom:1px solid var(--line);background:var(--surface)}.variant-header>*,.variant-panel>summary>*{padding:0 10px}.variant-panel>summary{cursor:pointer;list-style:none}.variant-panel>summary::-webkit-details-marker{display:none}.variant-panel[open]>summary{background:#f3f6f4}.variant-meta{grid-column:2/4;min-width:0}.variant-kvs{display:flex;flex-wrap:wrap;gap:4px 8px}.variant-kv{display:inline-flex;align-items:baseline;gap:4px;min-width:0}.variant-kv small{color:var(--muted);font-size:9px}.variant-kv code{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--ink);font-size:11px}.variant-panel>summary span{color:var(--muted);font-size:11px}.variant-panel>summary strong{font-size:11px;font-weight:600}.variant-name{grid-column:1;display:flex;align-items:center;gap:5px;color:var(--ink)}.variant-permalink{display:inline-grid;place-items:center;width:14px;height:14px;padding:1px;color:var(--muted);opacity:.4}.variant-permalink:hover,.variant-permalink:focus{color:var(--blue);opacity:1;outline:1px solid currentColor}.variant-permalink svg{width:11px;height:11px}.variant-findings{grid-column:4;color:var(--muted)}.variant-score{grid-column:5;color:var(--score-color,var(--ink));text-align:left;font-size:13px!important}.variant-trend{grid-column:6;text-align:right}.variant-header .variant-findings{grid-column:4}.variant-header .variant-score{grid-column:5;color:var(--muted)}.variant-header .variant-trend{grid-column:6}.finding-total{display:inline-block;padding:4px 8px;border-radius:999px;background:var(--yellow-soft);color:var(--yellow);font-weight:700;font-size:11px}.finding-none{background:var(--green-soft);color:var(--green)}.rating-all_good{--score-color:var(--green)}.rating-improvements_needed{--score-color:var(--yellow)}.rating-significant_improvements_needed{--score-color:var(--red)}.rating-out_of_spec{--score-color:var(--red)}.detail-row td{padding:0;border-bottom:1px solid var(--line);background:#f7faf8}.detail-content{padding:16px 18px;border-top:1px solid var(--line);background:#f7faf8}.detail-section{margin-top:14px}.section-heading{display:flex;align-items:baseline;gap:10px;margin-bottom:10px}.section-heading h4{margin:0;font-size:16px}.section-heading span{color:var(--muted);font-size:12px}.finding-list{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:10px}.finding{padding:15px;border:1px solid #eed9a8;border-radius:10px;background:#fffaf0}.finding header{display:flex;align-items:center;gap:7px}.finding header code{color:var(--muted);font-size:11px}.finding h5{margin:10px 0 5px;font-size:15px}.finding p{margin:5px 0;color:#4d5752;font-size:13px}.finding-summary{margin-top:10px!important}.finding-occurrences{margin-top:12px;padding-top:10px;border-top:1px solid var(--line)}.finding-occurrences>summary{cursor:pointer;color:var(--ink);font-size:11px;font-weight:700}.finding-evidence-list{display:grid;gap:6px;margin-top:8px;font-size:11px}.finding-evidence{display:grid;gap:3px;min-width:0}.finding-evidence>span,.finding-evidence-empty{color:var(--muted);font-size:10px}.finding-evidence ul{display:grid;gap:3px;margin:0;padding:0;list-style:none;min-width:0}.finding-evidence li{display:flex;flex-wrap:wrap;gap:5px;min-width:0;color:var(--muted)}.finding-evidence a{min-width:0;max-width:100%;color:var(--blue);overflow-wrap:anywhere;text-decoration:underline;text-underline-offset:2px}.finding-evidence li>span:last-child{min-width:0;max-width:100%;overflow-wrap:anywhere}.finding-evidence code{white-space:normal;overflow-wrap:anywhere}.trace-node>details:target>summary{background:var(--blue-soft);outline:2px solid var(--blue)}.severity{padding:2px 6px;border-radius:5px;background:var(--yellow-soft);color:var(--yellow);font:700 10px var(--mono)}.severity-critical{border-color:#efc19d;background:#fff7ef}.severity-critical .severity,.severity-major .severity{background:var(--orange-soft);color:var(--orange)}.severity-info{border-color:#c9dde6;background:#f4fafc}.severity-info .severity{background:var(--blue-soft);color:var(--blue)}.remediation strong{display:block;color:var(--ink)}.trace summary,.trace-node summary{cursor:pointer}.trace-node pre{overflow:auto;max-height:360px;padding:11px;border-radius:7px;background:#101916;color:#d9e5df;font-size:11px}.failures{display:grid;gap:8px;margin:0;padding:0;list-style:none}.failures li{display:flex;align-items:flex-start;gap:10px;padding:10px;border:1px solid #efc19d;border-radius:8px;background:var(--orange-soft)}.failures li.stopping{border-color:#e7bdc0;background:var(--red-soft);color:var(--red)}.failures code{font-size:10px}.failures span{flex:1}.failures strong{font-size:11px}.trace{margin:7px 0;border:1px solid var(--line);background:var(--surface)}.trace>summary{display:flex;align-items:center;gap:10px;padding:8px 10px;background:var(--surface-soft);cursor:pointer;font-weight:600}.trace[open]>summary{border-bottom:1px solid var(--line)}.trace>summary>span{color:var(--muted);font-size:11px}.trace-has-issues{border-color:#e8d29a}.trace-ok{color:var(--green)!important;font-weight:700}.expected-error{color:var(--blue)!important;font-style:normal;font-weight:700}.trace-tree,.trace-tree ul{margin:0;padding:0;border:0;list-style:none}.trace-node{margin:0}.trace-node>details{padding:0;border-bottom:1px solid #edf0ee}.trace-node>details>summary{display:grid;grid-template-columns:minmax(280px,.8fr) minmax(180px,1fr) 68px 78px;align-items:center;gap:10px;min-height:36px;padding:5px 8px;cursor:pointer;list-style:none}.trace-node>details>summary::-webkit-details-marker{display:none}.trace-node>details[open]>summary{background:#fafbfa}.trace-node.has-issues>details>summary{background:var(--yellow-soft)}.span-label{display:flex;align-items:center;gap:6px;min-width:0;padding-left:calc(var(--depth) * 16px)}.span-label code{flex:0 0 auto;color:var(--blue);font-size:10px}.span-label>span{overflow:hidden;color:var(--ink);font-size:11px;text-overflow:ellipsis;white-space:nowrap}.waterfall{position:relative;height:15px;background:repeating-linear-gradient(to right,transparent 0,transparent calc(20% - 1px),#edf0ee calc(20% - 1px),#edf0ee 20%)}.waterfall i{position:absolute;top:4px;left:var(--left);width:var(--width);height:7px;min-width:2px;background:var(--green)}.trace-node.has-issues .waterfall i{background:var(--yellow)}.span-duration{text-align:right;color:var(--muted);font-size:10px}.span-status{text-align:right;font-size:10px;font-style:normal}.span-detail{padding:0 8px 8px calc(8px + var(--depth) * 16px)}.span-detail pre{margin:4px 0 0}.issue-count{color:var(--yellow)!important;font-weight:700}.span-issues{margin:4px 0;color:var(--yellow);padding-left:20px}.secondary-stack{display:grid;gap:6px;margin-top:14px}.secondary-detail{border-top:1px solid var(--line);padding:7px 0;color:var(--muted)}.secondary-detail>summary{cursor:pointer;font-size:11px}.secondary-detail[open]>summary{margin-bottom:8px}.artifact-detail dl{display:grid;grid-template-columns:80px minmax(0,1fr);gap:4px 10px;margin:8px 0}.artifact-detail dt{font-size:11px}.artifact-detail dd{margin:0;overflow-wrap:anywhere}.artifact-detail code{font-size:11px}.source-toolbar{display:flex;align-items:center;justify-content:space-between;margin-top:8px}.source-toolbar code{font-size:10px}.copy-source{padding:4px 9px;border:1px solid var(--line-strong);background:var(--surface);color:var(--ink);cursor:pointer;font-size:10px}.copy-source:hover,.copy-source:focus{border-color:var(--green);color:var(--green);outline:none}.source-detail pre{max-height:560px;margin:6px 0 0;padding:12px;overflow:auto;background:#101916;color:#d9e5df;font-size:11px;line-height:1.55;tab-size:2}.source-detail .hljs-comment,.source-detail .hljs-quote{color:#81918a}.source-detail .hljs-keyword,.source-detail .hljs-selector-tag,.source-detail .hljs-literal{color:#d8a8ff}.source-detail .hljs-string,.source-detail .hljs-regexp{color:#9dd8b8}.source-detail .hljs-number,.source-detail .hljs-symbol{color:#f1bd78}.source-detail .hljs-title,.source-detail .hljs-function,.source-detail .hljs-built_in{color:#8dcbe8}.source-detail .hljs-attr,.source-detail .hljs-property,.source-detail .hljs-variable{color:#f0d58c}.no-findings{margin:0;color:var(--muted);font-size:12px}.empty{color:var(--muted)}@media(max-width:900px){.page-header h1,.main{padding-left:18px;padding-right:18px}.score-explanation-body{grid-template-columns:1fr}.finding-list{grid-template-columns:1fr}}
</style></head><body>
<header class="page-header"><h1>sentry/testing-ai-sdk integrations</h1></header>
<main class="main"><div class="toolbar"><input id="search" type="search" aria-label="search integrations" placeholder="Search for framework platform option or version."><span class="summary-stat summary-variants"><small>variants</small><strong id="summary-variants">${report.summary.variants}</strong></span><span class="summary-stat summary-findings"><small>findings</small><strong id="summary-findings">${findings}</strong></span><span class="summary-stat summary-score"><small class="score-label">score ${scoreHelp(report.scoringVersion)}</small><strong id="summary-score">${overallScore}</strong></span></div>
${scoreExplanation(report.scoringVersion)}
<section class="trend-panel"><div class="trend-heading"><strong>score trend</strong><small id="trend-runs"></small></div><svg id="overall-trend" viewBox="0 0 1000 190" role="img" aria-label="overall score trend"></svg></section>
<div class="table-shell"><table class="matrix"><thead><tr><th>platform</th><th>versions</th><th>variants</th><th>findings</th><th><span class="score-column-label">score ${scoreHelp(report.scoringVersion)}</span></th><th>trend</th></tr></thead>${rows.join("")}</table></div><p class="empty">generated ${escapeHtml(report.generatedAt)} · assessment wall time ${escapeHtml(formatDuration(report.durationMs))}</p></main>
<script>
const currentTrendEntry=${scriptJson(currentTrendEntry)};
const rows=[...document.querySelectorAll('.target-row')];const groups=[...document.querySelectorAll('[data-framework-group]')];
const search=document.getElementById('search');const summaryScore=document.getElementById('summary-score');const summaryVariants=document.getElementById('summary-variants');const summaryFindings=document.getElementById('summary-findings');let searchActive=false;let trendEntries=[];
function setTargetOpen(row,open){const detail=document.getElementById(row.dataset.detail);detail.hidden=!open;row.setAttribute('aria-expanded',String(open));if(open){const variants=[...detail.querySelectorAll('.variant-panel')];if(variants.length===1)variants[0].open=true;}}
function closeRow(row){setTargetOpen(row,false);}
function rowMatches(row,query){return !query||row.dataset.search.includes(query);}
function rowTotal(rows,name){return rows.reduce((total,row)=>total+Number(row.dataset[name]||0),0);}
function scoreRating(score,incomplete){if(incomplete>0)return'out_of_spec';if(score>=85)return'all_good';if(score>=70)return'improvements_needed';return'significant_improvements_needed';}
function scoreColor(score){if(score>=85)return'#147d64';if(score>=70)return'#a36a0a';return'#b9363e';}
function svgElement(name,attributes){const element=document.createElementNS('http://www.w3.org/2000/svg',name);for(const [key,value] of Object.entries(attributes))element.setAttribute(key,String(value));return element;}
function integrationFramework(integration){return integration.framework||integration.identity?.framework;}
function trendValues(entries,kind,id){return entries.map(entry=>{if(kind==='framework'){const matches=(entry.integrations||[]).filter(integration=>integrationFramework(integration)===id);return matches.length?Math.round(matches.reduce((total,integration)=>total+integration.score,0)/matches.length):undefined;}if(kind==='target')return(entry.integrations||[]).find(integration=>integration.id===id)?.score;return(entry.integrations||[]).flatMap(integration=>integration.variants||[]).find(variant=>variant.id===id)?.score;}).filter(Number.isFinite);}
function renderSparkline(svg,values){svg.replaceChildren();if(!values.length)return;const x=index=>values.length===1?60:3+index*114/(values.length-1);const y=value=>25-Number(value)*22/100;const color=scoreColor(values.at(-1));svg.appendChild(svgElement('polyline',{points:values.map((value,index)=>x(index)+','+y(value)).join(' '),class:'sparkline-line',stroke:color}));svg.appendChild(svgElement('circle',{cx:x(values.length-1),cy:y(values.at(-1)),r:3,class:'sparkline-dot',fill:color}));const title=svgElement('title',{});title.textContent=values.join(' → ');svg.appendChild(title);}
function renderOverallTrend(entries){const svg=document.getElementById('overall-trend');svg.replaceChildren();document.getElementById('trend-runs').textContent=entries.length+' daily run'+(entries.length===1?'':'s');if(!entries.length)return;const left=42,right=975,top=12,bottom=148;const x=index=>entries.length===1?(left+right)/2:left+index*(right-left)/(entries.length-1);const y=score=>bottom-Number(score)*(bottom-top)/100;for(const score of[0,25,50,75,100]){svg.appendChild(svgElement('line',{x1:left,y1:y(score),x2:right,y2:y(score),class:'trend-grid'}));const label=svgElement('text',{x:left-8,y:y(score)+4,'text-anchor':'end',class:'trend-label'});label.textContent=score;svg.appendChild(label);}const values=entries.map(entry=>entry.score);const color=scoreColor(values.at(-1));svg.appendChild(svgElement('polyline',{points:values.map((value,index)=>x(index)+','+y(value)).join(' '),class:'trend-line',stroke:color}));const labelStep=Math.max(1,Math.ceil(entries.length/8));entries.forEach((entry,index)=>{const dot=svgElement('circle',{cx:x(index),cy:y(entry.score),r:4,class:'trend-dot',fill:scoreColor(entry.score)});const title=svgElement('title',{});title.textContent=entry.date+': '+entry.score;dot.appendChild(title);svg.appendChild(dot);if(index%labelStep===0||index===entries.length-1){const label=svgElement('text',{x:x(index),y:bottom+22,'text-anchor':'middle',class:'trend-label'});label.textContent=new Date(entry.date+'T00:00:00Z').toLocaleDateString('en-US',{month:'short',day:'numeric',timeZone:'UTC'});svg.appendChild(label);}});}
function filteredTrendEntries(entries,matches,filtering){if(!filtering)return entries;const targetIds=new Set(matches.map(row=>row.dataset.targetId));return entries.flatMap(entry=>{const scores=(entry.integrations||[]).filter(integration=>targetIds.has(integration.id)).map(integration=>integration.score).filter(Number.isFinite);return scores.length?[{date:entry.date,score:Math.round(scores.reduce((total,score)=>total+score,0)/scores.length)}]:[];});}
function renderDashboardTrend(matches=rows.filter(row=>rowMatches(row,search.value.trim().toLowerCase())),filtering=Boolean(search.value.trim())){renderOverallTrend(filteredTrendEntries(trendEntries,matches,filtering));}
function renderTrends(historyEntries){const byDate=new Map(historyEntries.map(entry=>[entry.date,entry]));byDate.set(currentTrendEntry.date,currentTrendEntry);trendEntries=[...byDate.values()].sort((left,right)=>left.date.localeCompare(right.date));renderDashboardTrend();for(const svg of document.querySelectorAll('.score-sparkline')){const kind=svg.dataset.trendFramework?'framework':svg.dataset.trendTarget?'target':'variant';const id=svg.dataset.trendFramework||svg.dataset.trendTarget||svg.dataset.trendVariant;renderSparkline(svg,trendValues(trendEntries,kind,id));}}
function loadTrends(){renderTrends([currentTrendEntry]);const historyPath=location.pathname.includes('/reports/')?'../../history.json':'history.json';fetch(historyPath,{cache:'no-store'}).then(response=>{if(!response.ok)throw new Error('history unavailable');return response.json();}).then(history=>{if(history.schemaVersion==='3'&&Array.isArray(history.entries))renderTrends(history.entries);}).catch(()=>{});}
function updateSummary(matches){const incomplete=rowTotal(matches,'incomplete');const score=matches.length?Math.round(rowTotal(matches,'score')/matches.length):null;summaryScore.textContent=score===null?'—':String(score);summaryScore.className=score===null?'':'rating-'+scoreRating(score,incomplete);summaryVariants.textContent=String(rowTotal(matches,'variants'));summaryFindings.textContent=String(rowTotal(matches,'findings'));}
function updateGroupSummary(group,matches){if(!matches.length)return;const score=Math.round(rowTotal(matches,'score')/matches.length);const incomplete=rowTotal(matches,'incomplete');group.querySelector('.group-variants').textContent=String(rowTotal(matches,'variants'));const scoreElement=group.querySelector('.group-score');scoreElement.textContent=String(score);scoreElement.className='group-score rating-'+scoreRating(score,incomplete);const findingsElement=group.querySelector('.group-findings .findings-hover');findingsElement.textContent=String(rowTotal(matches,'findings'));const findingText=matches.flatMap(row=>{const text=row.querySelector('.target-findings .findings-hover')?.dataset.tooltip;return text&&text!=='no findings'?text.split('\\n'):[];});findingsElement.dataset.tooltip=findingText.length?findingText.join('\\n'):'no findings';}
function applyFilters(){const query=search.value.trim().toLowerCase();const filtering=Boolean(query);if(filtering&&!searchActive){for(const group of groups)group.dataset.beforeSearchExpanded=group.dataset.expanded;}if(!filtering&&searchActive){for(const group of groups)group.dataset.expanded=group.dataset.beforeSearchExpanded||'false';}const allMatches=[];for(const group of groups){const groupRows=[...group.querySelectorAll('.target-row')];const matches=groupRows.filter(row=>rowMatches(row,query));allMatches.push(...matches);group.hidden=matches.length===0;if(filtering&&matches.length)group.dataset.expanded='true';const expanded=group.dataset.expanded==='true';const heading=group.querySelector('.framework-group');heading.setAttribute('aria-expanded',String(expanded));updateGroupSummary(group,matches);for(const row of groupRows){const show=expanded&&matches.includes(row);row.hidden=!show;if(!show)closeRow(row);}}updateSummary(allMatches);renderDashboardTrend(allMatches,filtering);searchActive=filtering;}
search.addEventListener('input',applyFilters);
for(const group of groups){const heading=group.querySelector('.framework-group');const toggle=()=>{const expanding=group.dataset.expanded!=='true';group.dataset.expanded=String(expanding);applyFilters();if(expanding){const visibleRows=[...group.querySelectorAll('.target-row')].filter(row=>!row.hidden);if(visibleRows.length===1)setTargetOpen(visibleRows[0],true);}};heading.addEventListener('click',toggle);heading.addEventListener('keydown',event=>{if(event.target===heading&&(event.key==='Enter'||event.key===' ')){event.preventDefault();toggle();}});}
for(const row of rows){const toggle=()=>setTargetOpen(row,row.getAttribute('aria-expanded')!=='true');row.addEventListener('click',toggle);row.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();toggle();}});}
function revealSpan(id){const span=document.getElementById(id);if(!span)return;let current=span;while(current){if(current instanceof HTMLDetailsElement)current.open=true;current=current.parentElement?.closest('details')||null;}span.scrollIntoView({block:'center'});}
function revealVariant(id){const variant=document.getElementById(id);if(!(variant instanceof HTMLDetailsElement)||!variant.classList.contains('variant-panel'))return false;const detail=variant.closest('.detail-row');const row=rows.find(candidate=>candidate.dataset.detail===detail?.id);const group=row?.closest('[data-framework-group]');if(row?.hidden&&group){search.value='';searchActive=false;group.dataset.expanded='true';applyFilters();}if(row)setTargetOpen(row,true);variant.open=true;variant.scrollIntoView({block:'center'});return true;}
function revealHash(id){if(!revealVariant(id))revealSpan(id);}
async function copySource(button){const source=button.closest('.source-detail')?.querySelector('pre code')?.textContent;if(!source)return;try{if(!navigator.clipboard)throw new Error('clipboard unavailable');await navigator.clipboard.writeText(source);}catch{const textarea=document.createElement('textarea');textarea.value=source;textarea.style.position='fixed';textarea.style.opacity='0';document.body.appendChild(textarea);textarea.select();document.execCommand('copy');textarea.remove();}button.textContent='copied';setTimeout(()=>{button.textContent='copy';},1200);}
document.addEventListener('click',event=>{const copyButton=event.target.closest('.copy-source');if(copyButton){copySource(copyButton);return;}const variantLink=event.target.closest('[data-variant-link]');if(variantLink)event.stopPropagation();const spanLink=event.target.closest('[data-span-target]');if(spanLink)setTimeout(()=>revealSpan(spanLink.dataset.spanTarget),0);});
window.addEventListener('hashchange',()=>revealHash(location.hash.slice(1)));if(location.hash)setTimeout(()=>revealHash(location.hash.slice(1)),0);
loadTrends();applyFilters();
</script></body></html>`;
}

export async function writeAssessmentHtml(
	report: AssessmentReport,
	reportDirectory = path.join(process.cwd(), "test-results"),
): Promise<string> {
	await mkdir(reportDirectory, { recursive: true });
	const programSources = new Map<string, string>();
	await Promise.all(
		report.targets.flatMap((target) =>
			target.variants.map(async (variant) => {
				if (!variant.generatedProgramPath) return;
				const source = await readFile(
					variant.generatedProgramPath,
					"utf8",
				).catch(() => undefined);
				if (source !== undefined) programSources.set(variant.id, source);
				return undefined;
			}),
		),
	);
	const timestamp = report.generatedAt.replace(/[:.]/g, "-");
	const reportPath = path.join(
		reportDirectory,
		`assessment-report-${timestamp}.html`,
	);
	await writeFile(
		reportPath,
		renderAssessmentHtml(report, programSources),
		"utf8",
	);
	return reportPath;
}
