import type { AssessmentExecutionResult } from "../runner/execution.js";
import type { ParsedHarnessEvents } from "./protocol.js";
import { classifyFailure } from "./retry.js";
import type { ProbeResult, RuntimeFailure } from "./types.js";

type Event = ParsedHarnessEvents["events"][number];

function processFailure(
	execution: AssessmentExecutionResult,
): RuntimeFailure | undefined {
	if (!execution.exitError) return undefined;
	return classifyFailure({
		kind: execution.timedOut ? "timeout" : "process_exit",
		message: execution.exitError,
		stopsVariant: true,
	});
}

function protocolFailure(probe: ProbeResult, message: string): RuntimeFailure {
	return {
		kind: "protocol",
		category: "harness",
		message,
		probeId: probe.probeId,
		stopsVariant: true,
	};
}

function applyCallEvent(
	probe: ProbeResult,
	event: Extract<Event, { type: "call_started" | "call_finished" }>,
): RuntimeFailure | undefined {
	const call = probe.calls?.find((call) => call.callId === event.callId);
	if (!call || call.mode !== event.mode)
		return protocolFailure(probe, `Unknown assessment call ${event.callId}.`);
	if (event.type === "call_started") {
		if (call.status !== "not_executed")
			return protocolFailure(
				probe,
				`Call ${call.callId} started more than once.`,
			);
		call.status = "running";
		call.startedAt = event.timestamp;
	} else {
		if (call.status !== "running")
			return protocolFailure(
				probe,
				`Call ${call.callId} finished without a matching start.`,
			);
		call.status = event.status!;
		call.finishedAt = event.timestamp;
		call.error = event.failure && classifyFailure(event.failure);
		call.expectedError = event.expectedError;
	}
	return undefined;
}

function applyToolEvent(
	probe: ProbeResult,
	event: Extract<Event, { type: "tool_started" | "tool_finished" }>,
): RuntimeFailure | undefined {
	const call = probe.calls?.find((call) => call.callId === event.callId);
	if (!call || call.status !== "running")
		return protocolFailure(
			probe,
			`Tool event outside active call ${event.callId}.`,
		);
	const tool = call.tools.find((tool) => tool.id === event.id);
	if (event.type === "tool_started") {
		if (tool)
			return protocolFailure(probe, `Duplicate tool execution ${event.id}.`);
		call.tools.push({
			id: event.id,
			name: event.name,
			toolCallId: event.toolCallId,
			arguments: event.arguments,
			status: "running",
			startedAt: event.timestamp,
		});
	} else {
		if (!tool || tool.status !== "running" || tool.name !== event.name)
			return protocolFailure(
				probe,
				`Tool ${event.id} finished without a matching start.`,
			);
		tool.status = event.status!;
		tool.finishedAt = event.timestamp;
		tool.result = event.result;
		tool.error = event.error;
	}
	return undefined;
}

function applyProbeEvent(
	probe: ProbeResult,
	event: Event,
): RuntimeFailure | undefined {
	switch (event.type) {
		case "call_started":
		case "call_finished":
			return applyCallEvent(probe, event);
		case "tool_started":
		case "tool_finished":
			return applyToolEvent(probe, event);
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
			probe.runtimeError = event.failure && classifyFailure(event.failure);
			return probe.runtimeError;
		case "probe_blocked":
			probe.status = "blocked";
			return undefined;
		default:
			return undefined;
	}
}

function duration(item: {
	startedAt?: string;
	finishedAt?: string;
	durationMs?: number;
}): void {
	if (!item.startedAt || !item.finishedAt) return;
	const elapsed = Date.parse(item.finishedAt) - Date.parse(item.startedAt);
	if (Number.isFinite(elapsed) && elapsed >= 0) item.durationMs = elapsed;
}

function finishCalls(
	probe: ProbeResult,
	failures: RuntimeFailure[],
	finished: boolean,
	stoppedAt: string,
): void {
	for (const call of probe.calls ?? []) {
		if (call.status === "running") {
			if (finished)
				failures.push(
					protocolFailure(
						probe,
						`Call ${call.callId} did not emit a terminal event.`,
					),
				);
			call.status = "cancelled";
			call.finishedAt = stoppedAt;
		}
		if (
			call.status === "failed" &&
			!call.expectedError &&
			probe.status === "completed"
		) {
			failures.push(
				protocolFailure(
					probe,
					`Completed probe recorded an unexpected failure for ${call.callId}.`,
				),
			);
		}
		if (call.status === "not_executed" && probe.status === "completed") {
			failures.push(
				protocolFailure(
					probe,
					`Completed probe did not execute call ${call.callId}.`,
				),
			);
		}
		for (const tool of call.tools) {
			if (tool.status !== "running") continue;
			if (call.status === "succeeded")
				failures.push(
					protocolFailure(
						probe,
						`Tool ${tool.id} did not emit a terminal event.`,
					),
				);
			tool.status = "cancelled";
			tool.finishedAt = stoppedAt;
		}
		duration(call);
	}
}

/** Keep secondary protocol symptoms, but do not count them as independent causes. */
export function reconcileExecution(
	probes: ProbeResult[],
	execution: AssessmentExecutionResult,
	protocol: ParsedHarnessEvents,
	stoppedAt = new Date().toISOString(),
): RuntimeFailure[] {
	const exited = processFailure(execution);
	const failures = protocol.failures.map((failure) => ({
		...classifyFailure(failure),
		...(exited &&
		failure.message.includes("did not emit an assessment_finished")
			? { secondary: true }
			: {}),
	}));
	if (exited) failures.push(exited);
	const byProbe = new Map(probes.map((probe) => [probe.probeId, probe]));
	for (const event of protocol.events) {
		if (event.type === "assessment_finished") continue;
		if (event.type === "runtime_failure") {
			failures.push(classifyFailure(event.failure));
			continue;
		}
		const probe = byProbe.get(event.probeId);
		if (!probe) {
			failures.push({
				kind: "protocol",
				category: "harness",
				message: `Unknown probe ${event.probeId}.`,
				stopsVariant: true,
			});
			continue;
		}
		const failure = applyProbeEvent(probe, event);
		if (failure) failures.push(failure);
	}
	for (const probe of probes) {
		if (probe.status === "pending" || probe.status === "running") {
			const failure =
				exited ??
				protocolFailure(
					probe,
					`Assessment finished before probe ${probe.probeId} emitted a terminal event.`,
				);
			if (protocol.finished) failures.push(failure);
			probe.status = "failed";
			probe.runtimeError = failure;
			probe.finishedAt = stoppedAt;
		}
		finishCalls(probe, failures, protocol.finished, stoppedAt);
		duration(probe);
	}
	return failures;
}
