import { writeFile } from "node:fs/promises";
import path from "node:path";
import type {
	AssessmentExecutionResult,
	AssessmentRunner,
} from "../runner/execution.js";
import { executionFailure } from "../runner/execution.js";
import type { SpanCollector } from "../span-collector/server.js";
import { plannedCalls } from "./call-evidence.js";
import type { AssessmentTargetConfig, ResolvedVariant } from "./matrix.js";
import { writeAssessmentProgram } from "./program-files.js";
import { parseHarnessEvents } from "./protocol.js";
import { reconcileExecution } from "./reconciliation.js";
import { classifyFailure } from "./retry.js";
import type { CapturedSpan, ProbeAttempt, ProbeResult } from "./types.js";

export interface ProbeExecutionContext {
	target: AssessmentTargetConfig;
	variant: ResolvedVariant;
	initial: ProbeResult;
	runner: AssessmentRunner;
	collector: Pick<
		SpanCollector,
		"registerRun" | "getDsn" | "getSpans" | "getFailures"
	>;
	executionId: string;
	number: number;
	deadlineMs: number;
	retryReason?: ProbeAttempt["retryReason"];
	retryDelayMs?: number;
	runsDirectory?: string;
}

export async function executeProbe(
	context: ProbeExecutionContext,
): Promise<{ attempt: ProbeAttempt; spans: CapturedSpan[] }> {
	const {
		target,
		variant,
		initial,
		runner,
		collector,
		executionId,
		number,
		deadlineMs,
	} = context;
	const id = `${executionId}/${variant.id}/${initial.probeId}/${number}`;
	const generated = await writeAssessmentProgram(target, variant, {
		probeIds: new Set([initial.probeId]),
		runsDirectory: context.runsDirectory,
		attemptPath: [
			"executions",
			encodeURIComponent(executionId),
			initial.probeId,
			`attempt-${number}`,
		],
	});
	const probe: ProbeResult = {
		...initial,
		status: "pending",
		spanIds: [],
		traceIds: [],
		calls: plannedCalls(target.category, initial),
	};
	collector.registerRun(id);
	const startedAt = new Date().toISOString();
	let execution: AssessmentExecutionResult;
	try {
		execution = await runner.executeAssessmentProgram({
			workDir: generated.environmentDirectory,
			sentryDsn: collector.getDsn(id),
			programPath: generated.programPath,
			logPath: generated.logPath,
			timeoutMs: deadlineMs,
		});
	} catch (error) {
		execution = executionFailure(error);
	}
	const finishedAt = new Date().toISOString();
	const protocol = parseHarnessEvents(
		`${execution.stdout}\n${execution.stderr}`,
	);
	const failures = reconcileExecution([probe], execution, protocol, finishedAt);
	// Successful flushes have completed their HTTP requests before the process exits.
	const spans = collector.getSpans(id);
	failures.push(...collector.getFailures(id).map(classifyFailure));
	probe.spanIds = spans.map((span) => span.span_id);
	probe.traceIds = [...new Set(spans.map((span) => span.trace_id))];
	probe.telemetryComplete =
		protocol.finished &&
		!failures.some((failure) => failure.kind !== "provider");
	const attempt: ProbeAttempt = {
		id,
		number,
		probe,
		startedAt,
		finishedAt,
		durationMs: Date.parse(finishedAt) - Date.parse(startedAt),
		deadlineMs,
		retryReason: context.retryReason,
		retryDelayMs: context.retryDelayMs,
		runtimeFailures: failures.map((failure) => ({
			...failure,
			attemptId: id,
			probeId: failure.probeId ?? probe.probeId,
		})),
		programPath: generated.programPath,
		logPath: generated.logPath,
	};
	try {
		await writeFile(
			path.join(path.dirname(generated.programPath), "attempt.json"),
			`${JSON.stringify({ schemaVersion: "1", attempt, spans }, null, 2)}\n`,
		);
	} catch (error) {
		attempt.runtimeFailures.push(
			classifyFailure({
				kind: "harness",
				message: `Could not persist attempt evidence: ${error instanceof Error ? error.message : String(error)}`,
				probeId: probe.probeId,
				attemptId: id,
				stopsVariant: true,
			}),
		);
	}
	return { attempt, spans };
}
