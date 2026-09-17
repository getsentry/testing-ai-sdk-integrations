import type {
	AssessmentReport,
	CallResult,
	VariantAssessment,
} from "../assessment/types.js";
import { escapeHtml } from "./html.js";

function callDetails(call: CallResult): string {
	const status = call.expectedError
		? "expected error"
		: call.status.replaceAll("_", " ");
	return `<li><code>${escapeHtml(call.callId)}</code> — ${escapeHtml(status)}${call.durationMs === undefined ? "" : ` · ${call.durationMs} ms`}${call.error ? `<details><summary>Call error</summary><pre>${escapeHtml(JSON.stringify(call.error, null, 2))}</pre></details>` : ""}${call.tools.length ? `<details><summary>${call.tools.length} recorded tool execution(s)</summary><pre>${escapeHtml(JSON.stringify(call.tools, null, 2))}</pre></details>` : ""}</li>`;
}

export function executionDetails(assessment: VariantAssessment): string {
	if (!assessment.attempts) return "";
	const coverage = assessment.coverage;
	const headline = coverage
		? `${coverage.succeeded + coverage.expectedErrors}/${coverage.planned} calls completed · ${coverage.failed} failed · ${coverage.cancelled} cancelled · ${coverage.notExecuted} not executed`
		: "Call coverage unavailable";
	const attempts = assessment.attempts
		.map(
			(attempt) =>
				`<details id="attempt-${escapeHtml(encodeURIComponent(attempt.id))}"><summary><code>${escapeHtml(attempt.probe.probeId)}</code> · attempt ${attempt.number} · ${attempt.runtimeFailures.length ? "execution failure" : escapeHtml(attempt.probe.status)} · ${attempt.durationMs} ms${attempt.retryReason ? ` · ${escapeHtml(attempt.retryReason)} retry after ${attempt.retryDelayMs ?? 0} ms` : ""}</summary><p>Deadline: ${attempt.deadlineMs} ms · telemetry delivery ${attempt.probe.telemetryComplete ? "complete" : "uncertain"}</p>${attempt.runtimeFailures.length ? `<pre>${escapeHtml(JSON.stringify(attempt.runtimeFailures, null, 2))}</pre>` : ""}<ul>${(attempt.probe.calls ?? []).map(callDetails).join("")}</ul><p>Log: <code>${escapeHtml(attempt.logPath)}</code></p><p>Program: <code>${escapeHtml(attempt.programPath)}</code></p></details>`,
		)
		.join("");
	const behavior = assessment.modelBehavior?.length
		? `<details><summary>Tool/model behavior: ${assessment.modelBehavior.length} deviation(s), separate from telemetry findings</summary><pre>${escapeHtml(JSON.stringify(assessment.modelBehavior, null, 2))}</pre></details>`
		: "";
	return `<section class="detail-section execution-section"><h4>Execution: ${escapeHtml(assessment.executionHealth ?? assessment.completion)}</h4><p>${escapeHtml(headline)} · endpoint: ${escapeHtml(assessment.endpoint ?? "unknown")}</p><p>Telemetry quality: ${assessment.telemetryScore === null ? "not assessed" : `${assessment.telemetryScore ?? assessment.score}/100`}. Missing coverage is not a passing result.</p>${attempts}${behavior}<p>Dependency snapshot: <code>${escapeHtml(assessment.dependencySnapshotPath ?? "unavailable")}</code></p></section>`;
}

export function executionSummary(report: AssessmentReport): string {
	const execution = report.summary.execution;
	if (!execution) return "";
	const coverage = report.summary.coverage;
	return `<section class="execution-summary"><strong>Execution health</strong>: ${execution.healthy} clean · ${execution.recovered} recovered on retry · ${execution.failed} incomplete${coverage ? ` · calls ${coverage.succeeded + coverage.expectedErrors}/${coverage.planned} completed` : ""}<p>Telemetry findings, execution failures, and tool/model behavior are reported separately. Retries do not erase earlier findings.</p>${report.executionPolicy ? `<details><summary>Execution policy and provenance</summary><pre>${escapeHtml(JSON.stringify({ executionId: report.executionId, runId: report.runId, runAttempt: report.runAttempt, commitSha: report.commitSha, ...report.executionPolicy }, null, 2))}</pre></details>` : ""}</section>`;
}
