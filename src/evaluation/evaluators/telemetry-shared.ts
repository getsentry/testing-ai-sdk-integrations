import type {
	CapturedSpan,
	Observation,
	ProbeResult,
} from "../../assessment/types.js";
import type { AgentProbeInput, LlmProbeInput } from "../../probes/inputs.js";

export type ProbeInput = LlmProbeInput | AgentProbeInput;

export const errorStatuses = new Set([
	"error",
	"deadline_exceeded",
	"unauthenticated",
	"permission_denied",
	"not_found",
	"resource_exhausted",
	"invalid_argument",
	"unimplemented",
	"unavailable",
	"internal_error",
	"unknown_error",
	"cancelled",
	"already_exists",
	"failed_precondition",
	"aborted",
	"out_of_range",
	"data_loss",
]);

export function isGenAiSpan(span: CapturedSpan): boolean {
	return (
		(typeof span.op === "string" && span.op.startsWith("gen_ai")) ||
		Object.keys(span.data ?? {}).some((attribute) =>
			attribute.startsWith("gen_ai."),
		)
	);
}

export function operation(span: CapturedSpan): string | undefined {
	const value = span.data?.["gen_ai.operation.name"];
	return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function isAgentSpan(span: CapturedSpan): boolean {
	const name = operation(span);
	return (
		span.op === "gen_ai.invoke_agent" ||
		name === "invoke_agent" ||
		name === "gen_ai.invoke_agent" ||
		name === "create_agent" ||
		name === "gen_ai.create_agent" ||
		name?.startsWith("ai.run.") === true ||
		name?.startsWith("ai.pipeline.") === true
	);
}

export function isToolSpan(span: CapturedSpan): boolean {
	const name = operation(span);
	return (
		span.op === "gen_ai.execute_tool" ||
		name === "execute_tool" ||
		name === "gen_ai.execute_tool" ||
		name === "tool" ||
		name === "tool_call" ||
		name?.startsWith("ai.toolCall") === true
	);
}

export function isClientSpan(span: CapturedSpan): boolean {
	return isGenAiSpan(span) && !isAgentSpan(span) && !isToolSpan(span);
}

export function evidence(
	span: CapturedSpan,
	attribute?: string,
	value?: unknown,
) {
	return [
		{
			spanId: span.span_id,
			traceId: span.trace_id,
			attribute,
			value,
			description: span.description,
		},
	];
}

export function observation(
	capability: string,
	state: Observation["state"],
	probe: ProbeResult,
	variantId: string,
	span?: CapturedSpan,
	attribute?: string,
	actual?: unknown,
	expected?: unknown,
): Observation {
	return {
		observationId: span ? `${capability}:${span.span_id}` : capability,
		capability,
		state,
		probeId: probe.probeId,
		variantId,
		actual,
		expected,
		evidence: span ? evidence(span, attribute, actual) : [],
	};
}

export function parseJson(value: unknown): unknown | undefined {
	if (typeof value !== "string") return value;
	try {
		return JSON.parse(value);
	} catch {
		return undefined;
	}
}

export function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function comparable(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(comparable);
	if (isRecord(value)) {
		return Object.fromEntries(
			Object.entries(value)
				.sort(([left], [right]) => left.localeCompare(right))
				.map(([key, entry]) => [key, comparable(entry)]),
		);
	}
	return value;
}

export function equal(left: unknown, right: unknown): boolean {
	return JSON.stringify(comparable(left)) === JSON.stringify(comparable(right));
}
