import type { AssessmentExecutionResult } from "../runner/execution.js";
import type { ParsedHarnessEvents } from "./protocol.js";
import type { ProbeResult, RuntimeFailure } from "./types.js";

function processFailure(
	execution: AssessmentExecutionResult,
): RuntimeFailure | undefined {
	if (!execution.exitError) return undefined;
	return {
		kind: execution.timedOut ? "timeout" : "process_exit",
		message: execution.exitError,
		stopsVariant: true,
	};
}

function applyProbeEvent(
	probe: ProbeResult,
	event: ParsedHarnessEvents["events"][number],
): RuntimeFailure | undefined {
	switch (event.type) {
		case "probe_started":
			probe.status = "running";
			probe.startedAt = event.timestamp;
			return undefined;
		case "probe_finished":
			probe.status = event.status ?? "completed";
			probe.finishedAt = event.timestamp;
			return undefined;
		case "probe_failed":
			probe.status = "failed";
			probe.finishedAt = event.timestamp;
			probe.runtimeError = event.failure;
			return event.failure;
		case "probe_blocked":
			probe.status = "blocked";
			return undefined;
		default:
			return undefined;
	}
}

function setProbeDurations(probes: readonly ProbeResult[]): void {
	for (const probe of probes) {
		if (!probe.startedAt || !probe.finishedAt) continue;
		const durationMs =
			Date.parse(probe.finishedAt) - Date.parse(probe.startedAt);
		if (Number.isFinite(durationMs) && durationMs >= 0) {
			probe.durationMs = durationMs;
		}
	}
}

/** Reconcile process and harness outcomes without hiding either source of failure. */
export function reconcileExecution(
	probes: ProbeResult[],
	execution: AssessmentExecutionResult,
	protocol: ParsedHarnessEvents,
): RuntimeFailure[] {
	const failures = [...protocol.failures];
	const exited = processFailure(execution);
	if (exited) failures.push(exited);

	const byProbe = new Map(probes.map((probe) => [probe.probeId, probe]));
	for (const event of protocol.events) {
		if (event.type === "assessment_finished") continue;
		if (event.type === "runtime_failure") {
			failures.push(event.failure);
			continue;
		}
		const probe = byProbe.get(event.probeId);
		if (!probe) continue;
		const failure = applyProbeEvent(probe, event);
		if (failure) failures.push(failure);
	}
	setProbeDurations(probes);
	return failures;
}
