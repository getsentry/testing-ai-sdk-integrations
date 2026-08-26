import type { ProbeStatus, RuntimeFailure } from "./types.js";

export const ASSESSMENT_EVENT_PREFIX = "@@SENTRY_ASSESSMENT@@ ";

interface ProbeLifecycleEvent {
	type: "probe_started" | "probe_finished" | "probe_failed" | "probe_blocked";
	probeId: string;
	timestamp?: string;
	status?: ProbeStatus;
	failure?: RuntimeFailure;
}

type HarnessEvent =
	| ProbeLifecycleEvent
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
	return parseProbeEvent(value, timestamp);
}

/**
 * Parse only prefixed JSON lines. Framework stdout remains ordinary log output and
 * cannot accidentally be interpreted as assessment control data.
 */
export function parseHarnessEvents(output: string): ParsedHarnessEvents {
	const events: HarnessEvent[] = [];
	const failures: RuntimeFailure[] = [];
	for (const [index, line] of output.split(/\r?\n/).entries()) {
		const prefixIndex = line.indexOf(ASSESSMENT_EVENT_PREFIX);
		if (prefixIndex === -1) {
			continue;
		}
		try {
			const event = parseEvent(
				JSON.parse(line.slice(prefixIndex + ASSESSMENT_EVENT_PREFIX.length)),
			);
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
