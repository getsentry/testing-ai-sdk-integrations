import type {
	CapturedSpan,
	Observation,
	ProbeResult,
} from "../../assessment/types.js";
import type { AgentToolInput } from "../../probes/inputs.js";
import {
	equal,
	errorStatuses,
	isClientSpan,
	isRecord,
	isToolSpan,
	observation,
	parseJson,
	type ProbeInput,
} from "./telemetry-shared.js";

function findToolDefinition(
	span: CapturedSpan,
	toolName: string,
): Record<string, unknown> | undefined {
	const definitions = parseJson(span.data?.["gen_ai.tool.definitions"]);
	if (!Array.isArray(definitions)) return undefined;
	return definitions.find((value): value is Record<string, unknown> => {
		if (!isRecord(value)) return false;
		const fn = isRecord(value.function) ? value.function : undefined;
		return value.name === toolName || fn?.name === toolName;
	});
}

function parseDeprecatedToolResult(value: unknown): unknown | undefined {
	const parsed = parseJson(value);
	if (
		!isRecord(parsed) ||
		parsed.type !== "tool-result" ||
		!("output" in parsed)
	) {
		return parsed;
	}
	return parsed.output;
}

function toolResultObservation(
	probe: ProbeResult,
	variantId: string,
	toolSpan: CapturedSpan,
	expected: unknown,
): Observation {
	const modernResult = toolSpan.data?.["gen_ai.tool.call.result"];
	const deprecatedResult = toolSpan.data?.["gen_ai.tool.output"];
	const usesModernResult = modernResult !== undefined;
	const resultAttribute = usesModernResult
		? "gen_ai.tool.call.result"
		: "gen_ai.tool.output";
	const rawResult = modernResult ?? deprecatedResult;
	const result = usesModernResult
		? parseJson(rawResult)
		: parseDeprecatedToolResult(rawResult);
	let source: Observation["source"];
	if (usesModernResult) source = "modern";
	else if (deprecatedResult !== undefined) source = "legacy";

	let state: Observation["state"] = "malformed";
	if (rawResult === undefined) {
		state = "missing";
	} else if (equal(result, expected)) {
		state = usesModernResult ? "healthy" : "legacy";
	}
	return {
		...observation(
			"tools.result",
			state,
			probe,
			variantId,
			toolSpan,
			resultAttribute,
			result,
			expected,
		),
		source,
	};
}

function definitionObservations(
	probe: ProbeResult,
	variantId: string,
	clientSpans: readonly CapturedSpan[],
	tool: AgentToolInput,
): Observation[] {
	const definitionEntry = clientSpans.flatMap((span) => {
		const definition = findToolDefinition(span, tool.name);
		return definition ? [{ span, definition }] : [];
	})[0];
	const definitionSpan = definitionEntry?.span;
	const nestedFunction = isRecord(definitionEntry?.definition.function)
		? definitionEntry.definition.function
		: undefined;
	const description =
		definitionEntry?.definition.description ?? nestedFunction?.description;
	const parameters =
		definitionEntry?.definition.parameters ?? nestedFunction?.parameters;
	const state = (actual: unknown, expected: unknown): Observation["state"] => {
		if (!definitionEntry) return "blocked";
		if (actual === undefined) return "missing";
		return equal(actual, expected) ? "healthy" : "malformed";
	};
	return [
		observation(
			"tools.definition",
			definitionSpan ? "healthy" : "missing",
			probe,
			variantId,
			definitionSpan ?? clientSpans[0],
			"gen_ai.tool.definitions",
			tool.name,
		),
		observation(
			"tools.description",
			state(description, tool.description),
			probe,
			variantId,
			definitionSpan,
			"gen_ai.tool.definitions",
			description,
			tool.description,
		),
		observation(
			"tools.parameters",
			state(parameters, tool.parameters),
			probe,
			variantId,
			definitionSpan,
			"gen_ai.tool.definitions",
			parameters,
			tool.parameters,
		),
	];
}

function argumentState(
	raw: unknown,
	actual: unknown,
	expected: unknown,
): Observation["state"] {
	if (raw === undefined) return "missing";
	return equal(actual, expected) ? "healthy" : "malformed";
}

function toolExecutionObservations(
	probe: ProbeResult,
	variantId: string,
	tool: AgentToolInput,
	toolSpan?: CapturedSpan,
): Observation[] {
	const execution = observation(
		"tools.execution",
		toolSpan ? "healthy" : "missing",
		probe,
		variantId,
		toolSpan,
		"gen_ai.tool.name",
		toolSpan?.data?.["gen_ai.tool.name"],
		tool.name,
	);
	if (!toolSpan) return [execution];

	const modernArguments = toolSpan.data?.["gen_ai.tool.call.arguments"];
	const rawArguments = modernArguments ?? toolSpan.data?.["gen_ai.tool.input"];
	const argumentsValue = parseJson(rawArguments);
	const observations = [
		execution,
		observation(
			"tools.arguments",
			argumentState(rawArguments, argumentsValue, tool.arguments),
			probe,
			variantId,
			toolSpan,
			modernArguments !== undefined
				? "gen_ai.tool.call.arguments"
				: "gen_ai.tool.input",
			argumentsValue,
			tool.arguments,
		),
	];
	if (tool.error) {
		const status = toolSpan.status;
		const hasError =
			(typeof status === "string" && errorStatuses.has(status)) ||
			toolSpan.data?.["error.type"] !== undefined;
		observations.push(
			observation(
				"tools.error",
				hasError ? "healthy" : "missing",
				probe,
				variantId,
				toolSpan,
				"status",
				status,
			),
		);
	} else if (tool.result !== undefined) {
		observations.push(
			toolResultObservation(probe, variantId, toolSpan, tool.result),
		);
	}
	return observations;
}

export function evaluateTools(
	probe: ProbeResult,
	variantId: string,
	spans: readonly CapturedSpan[],
	input: ProbeInput,
): Observation[] {
	if (!("tools" in input) || !input.tools?.length) return [];
	const toolSpans = spans.filter(isToolSpan);
	const clientSpans = spans.filter(isClientSpan);
	return input.tools.flatMap((tool) => {
		const toolSpan = toolSpans.find(
			(span) => span.data?.["gen_ai.tool.name"] === tool.name,
		);
		return [
			...definitionObservations(probe, variantId, clientSpans, tool),
			...toolExecutionObservations(probe, variantId, tool, toolSpan),
		];
	});
}
