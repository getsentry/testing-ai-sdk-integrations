import type { ProbeStatus, RuntimeFailure } from "./types.js";

export const ASSESSMENT_EVENT_PREFIX = "@@SENTRY_ASSESSMENT@@ ";

interface CallEvent {
	type: "call_started" | "call_finished";
	probeId: string;
	callId: string;
	mode: "blocking" | "streaming";
	timestamp: string;
	status?: "succeeded" | "failed";
	expectedError?: boolean;
	failure?: RuntimeFailure;
}

interface ToolEvent {
	type: "tool_started" | "tool_finished";
	probeId: string;
	callId: string;
	id: string;
	name: string;
	toolCallId?: string;
	arguments?: unknown;
	result?: unknown;
	error?: string;
	status?: "succeeded" | "failed";
	timestamp: string;
}

interface ProbeLifecycleEvent {
	type: "probe_started" | "probe_finished" | "probe_failed" | "probe_blocked";
	probeId: string;
	timestamp?: string;
	status?: ProbeStatus;
	failure?: RuntimeFailure;
}

type HarnessEvent =
	| ProbeLifecycleEvent
	| CallEvent
	| ToolEvent
	| { type: "assessment_finished"; timestamp?: string }
	| { type: "runtime_failure"; failure: RuntimeFailure; timestamp?: string };

export interface ParsedHarnessEvents {
	events: HarnessEvent[];
	failures: RuntimeFailure[];
	finished: boolean;
}

const runtimeFailureKinds = new Set<RuntimeFailure["kind"]>([
	"setup",
	"render",
	"process_start",
	"process_exit",
	"timeout",
	"provider",
	"collector",
	"flush",
	"protocol",
	"harness",
]);

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function protocolFailure(message: string): RuntimeFailure {
	return { kind: "protocol", message, stopsVariant: true };
}

function isProbeStatus(value: unknown): value is ProbeStatus {
	return (
		value === "pending" ||
		value === "running" ||
		value === "completed" ||
		value === "failed" ||
		value === "blocked"
	);
}

function isRuntimeFailureKind(value: unknown): value is RuntimeFailure["kind"] {
	return (
		typeof value === "string" &&
		runtimeFailureKinds.has(value as RuntimeFailure["kind"])
	);
}

function parseFailure(value: unknown): RuntimeFailure | undefined {
	if (
		!isObject(value) ||
		!isRuntimeFailureKind(value.kind) ||
		typeof value.message !== "string" ||
		typeof value.stopsVariant !== "boolean"
	) {
		return undefined;
	}
	return {
		kind: value.kind,
		message: value.message,
		probeId: typeof value.probeId === "string" ? value.probeId : undefined,
		...(typeof value.callId === "string" ? { callId: value.callId } : {}),
		...(typeof value.statusCode === "number" &&
		Number.isInteger(value.statusCode)
			? { statusCode: value.statusCode }
			: {}),
		...(typeof value.code === "string" ? { code: value.code } : {}),
		...(typeof value.retryAfterMs === "number" &&
		Number.isFinite(value.retryAfterMs) &&
		value.retryAfterMs >= 0
			? { retryAfterMs: value.retryAfterMs }
			: {}),
		stopsVariant: value.stopsVariant,
	};
}

function isProbeEventType(value: string): value is ProbeLifecycleEvent["type"] {
	return (
		value === "probe_started" ||
		value === "probe_finished" ||
		value === "probe_failed" ||
		value === "probe_blocked"
	);
}

function parseProbeEvent(
	value: Record<string, unknown>,
	timestamp?: string,
): ProbeLifecycleEvent | undefined {
	if (typeof value.type !== "string" || !isProbeEventType(value.type)) {
		return undefined;
	}
	if (typeof value.probeId !== "string") return undefined;
	const failure =
		value.failure === undefined ? undefined : parseFailure(value.failure);
	if (value.failure !== undefined && !failure) return undefined;
	if (value.status !== undefined && !isProbeStatus(value.status)) {
		return undefined;
	}
	return {
		type: value.type,
		probeId: value.probeId,
		status: value.status,
		timestamp,
		failure,
	};
}

function parseCallEvent(value: Record<string, unknown>): CallEvent | undefined {
	if (
		typeof value.probeId !== "string" ||
		typeof value.callId !== "string" ||
		typeof value.timestamp !== "string" ||
		!Number.isFinite(Date.parse(value.timestamp))
	)
		return undefined;
	if (value.mode !== "blocking" && value.mode !== "streaming") return undefined;
	if (value.type !== "call_started" && value.type !== "call_finished")
		return undefined;
	if (
		value.type === "call_finished" &&
		value.status !== "succeeded" &&
		value.status !== "failed"
	)
		return undefined;
	const failure =
		value.failure === undefined ? undefined : parseFailure(value.failure);
	if (value.failure !== undefined && !failure) return undefined;
	if (value.status === "failed" && !failure) return undefined;
	if (value.status === "succeeded" && (failure || value.expectedError === true))
		return undefined;
	return {
		type: value.type,
		probeId: value.probeId,
		callId: value.callId,
		mode: value.mode,
		timestamp: value.timestamp,
		status: value.status as CallEvent["status"],
		expectedError: value.expectedError === true,
		failure,
	};
}

function parseToolEvent(value: Record<string, unknown>): ToolEvent | undefined {
	if (value.type !== "tool_started" && value.type !== "tool_finished")
		return undefined;
	if (
		typeof value.probeId !== "string" ||
		typeof value.callId !== "string" ||
		typeof value.id !== "string" ||
		typeof value.name !== "string" ||
		typeof value.timestamp !== "string" ||
		!Number.isFinite(Date.parse(value.timestamp))
	)
		return undefined;
	if (value.type === "tool_started" && !("arguments" in value))
		return undefined;
	if (
		value.type === "tool_finished" &&
		value.status !== "succeeded" &&
		value.status !== "failed"
	)
		return undefined;
	return {
		type: value.type,
		probeId: value.probeId,
		callId: value.callId,
		id: value.id,
		name: value.name,
		toolCallId:
			typeof value.toolCallId === "string" ? value.toolCallId : undefined,
		arguments: value.arguments,
		result: value.result,
		error: typeof value.error === "string" ? value.error : undefined,
		status: value.status as ToolEvent["status"],
		timestamp: value.timestamp,
	};
}

function parseEvent(value: unknown): HarnessEvent | undefined {
	if (!isObject(value) || typeof value.type !== "string") return undefined;
	const timestamp =
		typeof value.timestamp === "string" ? value.timestamp : undefined;
	if (value.type === "assessment_finished") {
		return { type: value.type, timestamp };
	}
	if (value.type === "runtime_failure") {
		const failure = parseFailure(value.failure);
		return failure ? { type: value.type, failure, timestamp } : undefined;
	}
	if (value.type === "call_started" || value.type === "call_finished")
		return parseCallEvent(value);
	if (value.type === "tool_started" || value.type === "tool_finished")
		return parseToolEvent(value);
	return parseProbeEvent(value, timestamp);
}

/**
 * Parse only prefixed JSON lines. Framework stdout remains ordinary log output and
 * cannot accidentally be interpreted as assessment control data.
 */
export function parseHarnessEvents(output: string): ParsedHarnessEvents {
	const events: HarnessEvent[] = [];
	const failures: RuntimeFailure[] = [];
	const seen = new Map<string, string>();
	for (const [index, line] of output.split(/\r?\n/).entries()) {
		const prefixIndex = line.indexOf(ASSESSMENT_EVENT_PREFIX);
		if (prefixIndex === -1) {
			continue;
		}
		try {
			const json = line.slice(prefixIndex + ASSESSMENT_EVENT_PREFIX.length);
			const value: unknown = JSON.parse(json);
			if (isObject(value) && typeof value.eventId === "string") {
				const previous = seen.get(value.eventId);
				if (previous === json) continue;
				if (previous !== undefined) {
					failures.push(
						protocolFailure(`Conflicting assessment event ${value.eventId}.`),
					);
					continue;
				}
				seen.set(value.eventId, json);
			}
			const event = parseEvent(value);
			if (!event) {
				failures.push(
					protocolFailure(
						`Malformed assessment event on output line ${index + 1}.`,
					),
				);
				continue;
			}
			events.push(event);
		} catch {
			failures.push(
				protocolFailure(`Invalid assessment JSON on output line ${index + 1}.`),
			);
		}
	}

	const finished = events.some((event) => event.type === "assessment_finished");
	if (!finished) {
		failures.push(
			protocolFailure(
				"Assessment program did not emit an assessment_finished event.",
			),
		);
	}
	return { events, failures, finished };
}
