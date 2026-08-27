import type {
	CapturedSpan,
	Observation,
	ProbeResult,
} from "../../assessment/types.js";
import {
	isAgentSpan,
	isGenAiSpan,
	isToolSpan,
	observation,
	operation,
} from "./telemetry-shared.js";

function tokenState(value: unknown): Observation["state"] {
	if (value === undefined) return "missing";
	return typeof value === "number" && value > 0 ? "healthy" : "malformed";
}

export function evaluateTokens(
	probe: ProbeResult,
	variantId: string,
	spans: readonly CapturedSpan[],
): Observation[] {
	return spans.flatMap((span) => {
		const input = span.data?.["gen_ai.usage.input_tokens"];
		const output = span.data?.["gen_ai.usage.output_tokens"];
		const total = span.data?.["gen_ai.usage.total_tokens"];
		const valid = (value: unknown): value is number =>
			typeof value === "number" && value > 0;
		const observations = [
			observation(
				"tokens.input",
				tokenState(input),
				probe,
				variantId,
				span,
				"gen_ai.usage.input_tokens",
				input,
			),
			observation(
				"tokens.output",
				tokenState(output),
				probe,
				variantId,
				span,
				"gen_ai.usage.output_tokens",
				output,
			),
		];
		const expectedTotal =
			valid(input) && valid(output) ? input + output : undefined;
		if (total !== undefined || expectedTotal !== undefined) {
			let totalState = tokenState(total);
			if (
				totalState === "healthy" &&
				expectedTotal !== undefined &&
				total !== expectedTotal
			) {
				totalState = "malformed";
			}
			observations.push(
				observation(
					"tokens.total",
					totalState,
					probe,
					variantId,
					span,
					"gen_ai.usage.total_tokens",
					total,
					expectedTotal,
				),
			);
		}
		return observations;
	});
}

function isSupportedOperation(name: string): boolean {
	return (
		/^(gen_ai\.)?(chat|completion|generate|generate_content|text_completion|embeddings|responses|invoke_agent|create_agent|execute_tool|tool|tool_call|handoff)$/.test(
			name,
		) ||
		/^ai\.(streamText\.doStream|generateText\.doGenerate|generateObject\.doGenerate|run\.|pipeline\.|toolCall)/.test(
			name,
		)
	);
}

function expectedDescription(span: CapturedSpan): string | undefined {
	const name = operation(span);
	if (!name) return undefined;
	let identity: unknown = span.data?.["gen_ai.request.model"];
	if (isToolSpan(span)) {
		identity = span.data?.["gen_ai.tool.name"];
	} else if (isAgentSpan(span)) {
		identity =
			span.data?.["gen_ai.agent.name"] ?? span.data?.["gen_ai.function_id"];
	}
	return typeof identity === "string" && identity.length > 0
		? `${name} ${identity}`
		: name;
}

export function evaluateOperations(
	probe: ProbeResult,
	variantId: string,
	spans: readonly CapturedSpan[],
): Observation[] {
	return spans.flatMap((span) => {
		const name = operation(span);
		const expected = expectedDescription(span);
		let operationState: Observation["state"] = "malformed";
		if (name === undefined) operationState = "missing";
		else if (isSupportedOperation(name)) operationState = "healthy";

		let descriptionState: Observation["state"] = "malformed";
		if (expected === undefined) descriptionState = "missing";
		else if (span.description === expected) descriptionState = "healthy";
		return [
			observation(
				"operations",
				operationState,
				probe,
				variantId,
				span,
				"gen_ai.operation.name",
				name,
			),
			observation(
				"spans.description",
				descriptionState,
				probe,
				variantId,
				span,
				"description",
				span.description,
				expected,
			),
		];
	});
}

function parent(span: CapturedSpan, byId: ReadonlyMap<string, CapturedSpan>) {
	const parentId = span.parent_span_id;
	return typeof parentId === "string" ? byId.get(parentId) : undefined;
}

export function evaluateAgentHierarchy(
	probe: ProbeResult,
	variantId: string,
	spans: readonly CapturedSpan[],
): Observation[] {
	const genAiSpans = spans.filter(isGenAiSpan);
	const agents = genAiSpans.filter(isAgentSpan);
	if (agents.length === 0) {
		return [observation("agent.hierarchy", "missing", probe, variantId)];
	}
	const agentObservations = agents.map((span) =>
		observation(
			"agent.hierarchy",
			"healthy",
			probe,
			variantId,
			span,
			"gen_ai.operation.name",
			operation(span),
		),
	);
	const byId = new Map(spans.map((span) => [span.span_id, span]));
	const agentIds = new Set(agents.map((span) => span.span_id));
	const agentAncestor = (span: CapturedSpan): CapturedSpan | undefined => {
		const visited = new Set<string>();
		let current: CapturedSpan | undefined = span;
		while (current && !visited.has(current.span_id)) {
			visited.add(current.span_id);
			if (agentIds.has(current.span_id)) return current;
			current = parent(current, byId);
		}
		return undefined;
	};
	const childObservations = genAiSpans.flatMap((span) => {
		if (agentIds.has(span.span_id)) return [];
		const ancestor = agentAncestor(span);
		const expected = ancestor?.data?.["gen_ai.agent.name"];
		const actual = span.data?.["gen_ai.agent.name"];
		const valid =
			ancestor !== undefined && (expected === undefined || actual === expected);
		return [
			observation(
				"agent.hierarchy",
				valid ? "healthy" : "malformed",
				probe,
				variantId,
				span,
				"gen_ai.agent.name",
				actual,
				expected,
			),
		];
	});
	return [...agentObservations, ...childObservations];
}
