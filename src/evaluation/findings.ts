import type {
	Finding,
	FindingSeverity,
	Observation,
} from "../assessment/types.js";

interface FindingDefinition {
	id: string;
	severity: FindingSeverity;
	title: string;
	description: string;
	remediation?: string;
}

const definitions: Record<string, FindingDefinition> = {
	"spans.gen_ai.missing": {
		id: "spans.gen_ai.missing",
		severity: "critical",
		title: "No GenAI spans were captured",
		description:
			"A successful baseline operation did not produce any GenAI telemetry.",
	},
	"spans.client.missing": {
		id: "spans.client.missing",
		severity: "critical",
		title: "Client span is missing",
		description: "An assessment call did not produce its required client span.",
	},
	"spans.client.malformed": {
		id: "spans.client.malformed",
		severity: "major",
		title: "Client span cardinality is invalid",
		description:
			"Client spans were duplicated or could not be matched to an assessment call.",
	},
	"model.request.missing": {
		id: "model.request.missing",
		severity: "critical",
		title: "Request model is missing",
		description: "The client span does not identify the requested model.",
	},
	"model.response.missing": {
		id: "model.response.missing",
		severity: "critical",
		title: "Response model is missing",
		description: "The response telemetry does not identify the served model.",
	},
	"model.response.mismatch": {
		id: "model.response.mismatch",
		severity: "major",
		title: "Response model does not match the expected model",
		description:
			"The response telemetry identifies a model other than the configured expectation.",
		remediation:
			"Emit the configured response model, or set modelOverrides.response for a provider-qualified model name.",
	},
	"tokens.input.missing": {
		id: "tokens.input.missing",
		severity: "major",
		title: "Input token count is missing",
		description: "The operation has no usable input token count.",
	},
	"tokens.output.missing": {
		id: "tokens.output.missing",
		severity: "major",
		title: "Output token count is missing",
		description: "The operation has no usable output token count.",
	},
	"tokens.input.malformed": {
		id: "tokens.input.malformed",
		severity: "major",
		title: "Input token count is invalid",
		description: "The input token count must be a positive number.",
	},
	"tokens.output.malformed": {
		id: "tokens.output.malformed",
		severity: "major",
		title: "Output token count is invalid",
		description: "The output token count must be a positive number.",
	},
	"tokens.total.missing": {
		id: "tokens.total.missing",
		severity: "minor",
		title: "Total token count is missing",
		description: "The operation does not report a total token count.",
	},
	"tokens.total.malformed": {
		id: "tokens.total.malformed",
		severity: "major",
		title: "Total token count is invalid",
		description: "The total token count must equal input plus output tokens.",
	},
	"operations.missing": {
		id: "operations.missing",
		severity: "critical",
		title: "GenAI operation name is missing",
		description: "Each GenAI span must identify its operation.",
	},
	"operations.malformed": {
		id: "operations.malformed",
		severity: "critical",
		title: "GenAI operation name is invalid",
		description: "The operation name is not a supported GenAI operation.",
	},
	"spans.description.missing": {
		id: "spans.description.missing",
		severity: "minor",
		title: "Span description is missing",
		description: "The span description must be derived from its operation.",
	},
	"spans.description.malformed": {
		id: "spans.description.malformed",
		severity: "minor",
		title: "Span description does not match its telemetry",
		description:
			"The span description must match the operation and its identifying attribute.",
	},
	"agent.hierarchy.missing": {
		id: "agent.hierarchy.missing",
		severity: "critical",
		title: "Agent span is missing",
		description:
			"The agent assessment call did not produce an agent invocation span.",
	},
	"agent.hierarchy.malformed": {
		id: "agent.hierarchy.malformed",
		severity: "major",
		title: "Agent span hierarchy is invalid",
		description: "GenAI child spans must descend from the agent invocation.",
	},
	"tools.definition.missing": {
		id: "tools.definition.missing",
		severity: "minor",
		title: "Tool definition is missing",
		description:
			"The client span does not describe an expected available tool.",
		remediation: "Add gen_ai.tool.definitions to the linked client span.",
	},
	"tools.description.missing": {
		id: "tools.description.missing",
		severity: "minor",
		title: "Tool description is missing",
		description: "The tool definition does not include its description.",
	},
	"tools.description.malformed": {
		id: "tools.description.malformed",
		severity: "minor",
		title: "Tool description does not match",
		description:
			"The captured tool description differs from the assessment input.",
	},
	"tools.parameters.missing": {
		id: "tools.parameters.missing",
		severity: "major",
		title: "Tool parameter schema is missing",
		description: "The tool definition does not include its parameter schema.",
	},
	"tools.parameters.malformed": {
		id: "tools.parameters.malformed",
		severity: "major",
		title: "Tool parameter schema does not match",
		description:
			"The captured tool parameter schema differs from the assessment input.",
	},
	"tools.arguments.missing": {
		id: "tools.arguments.missing",
		severity: "major",
		title: "Tool call arguments are missing",
		description: "The tool execution span does not capture its arguments.",
		remediation: "Add gen_ai.tool.call.arguments to the tool execution span.",
	},
	"tools.arguments.malformed": {
		id: "tools.arguments.malformed",
		severity: "major",
		title: "Tool call arguments do not match",
		description:
			"The captured tool call arguments differ from the assessment input.",
	},
	"tools.execution.missing": {
		id: "tools.execution.missing",
		severity: "critical",
		title: "Tool execution span is missing",
		description:
			"The tool assessment call did not produce a span for an expected tool.",
	},
	"tools.result.missing": {
		id: "tools.result.missing",
		severity: "major",
		title: "Tool result is missing",
		description: "A successful tool execution did not capture its result.",
		remediation: "Add gen_ai.tool.call.result to the linked tool span.",
	},
	"tools.result.malformed": {
		id: "tools.result.malformed",
		severity: "major",
		title: "Tool result does not match the execution",
		description: "The captured tool result differs from the expected result.",
	},
	"tools.error.missing": {
		id: "tools.error.missing",
		severity: "major",
		title: "Tool error is not captured",
		description:
			"A failing tool execution must have error status or error data.",
	},
	"provider.error.missing": {
		id: "provider.error.missing",
		severity: "critical",
		title: "Provider error is not captured",
		description:
			"The intentional provider failure did not produce error telemetry.",
	},
	"conversation.id.missing": {
		id: "conversation.id.missing",
		severity: "major",
		title: "Conversation ID is missing",
		description: "The span is missing the expected conversation identifier.",
	},
	"conversation.id.malformed": {
		id: "conversation.id.malformed",
		severity: "major",
		title: "Conversation ID is incorrect",
		description:
			"The captured conversation identifier differs from the assessment input.",
	},
	"input.trimming.missing": {
		id: "input.trimming.missing",
		severity: "major",
		title: "Long input telemetry is missing",
		description:
			"The long-input assessment call did not produce captured input messages.",
	},
	"input.trimming.malformed": {
		id: "input.trimming.malformed",
		severity: "minor",
		title: "Long input was not trimmed",
		description:
			"The captured input exceeds the expected telemetry trimming limit.",
		remediation: "Trim gen_ai.input.messages before sending the span.",
	},
	"conventions.deprecated": {
		id: "conventions.deprecated",
		severity: "minor",
		title: "Deprecated GenAI convention is in use",
		description: "The integration emits a deprecated GenAI attribute.",
		remediation:
			"Replace each deprecated attribute with the replacement shown in evidence.",
	},
	"conventions.unknown.malformed": {
		id: "conventions.unknown.malformed",
		severity: "info",
		title: "Unknown GenAI convention is in use",
		description:
			"The integration emits a GenAI attribute not defined by sentry-conventions.",
		remediation:
			"Use a registered sentry-conventions attribute, or add the attribute to sentry-conventions.",
	},
	"spans.assignment.missing": {
		id: "spans.assignment.missing",
		severity: "major",
		title: "Span is not assigned to an assessment call",
		description:
			"The linked span is not a child of an assessment call and has no test.probe.id attribute.",
		remediation:
			"Make the span descend from the assessment call root, or set test.probe.id on the root span.",
	},
	"messages.input.missing": {
		id: "messages.input.missing",
		severity: "major",
		title: "Input messages are missing",
		description:
			"Neither the input-message convention defined in sentry-conventions nor the deprecated input attribute was captured.",
	},
	"messages.output.missing": {
		id: "messages.output.missing",
		severity: "major",
		title: "Output messages are missing",
		description:
			"Neither the output-message convention defined in sentry-conventions nor deprecated output text or tool calls were captured.",
	},
	"messages.schema.invalid": {
		id: "messages.schema.invalid",
		severity: "major",
		title: "Message telemetry is malformed",
		description:
			"A captured message attribute could not be parsed using its declared schema.",
	},
	"messages.deprecated": {
		id: "messages.deprecated",
		severity: "minor",
		title: "Deprecated message telemetry is in use",
		description:
			"The integration emits a usable deprecated message representation.",
		remediation: "Migrate to gen_ai.input.messages and gen_ai.output.messages.",
	},
};

function definitionFor(
	observation: Observation,
): FindingDefinition | undefined {
	if (observation.state === "blocked" || observation.state === "healthy") {
		return undefined;
	}
	if (
		observation.capability === "model.response" &&
		observation.state === "malformed" &&
		observation.expected !== undefined
	) {
		return definitions["model.response.mismatch"];
	}
	if (observation.capability === "conventions.deprecated") {
		return definitions["conventions.deprecated"];
	}
	if (
		observation.capability === "messages.input" ||
		observation.capability === "messages.output"
	) {
		if (observation.state === "legacy")
			return definitions["messages.deprecated"];
		if (observation.state === "malformed")
			return definitions["messages.schema.invalid"];
		if (observation.state === "missing")
			return definitions[`${observation.capability}.missing`];
	}
	return definitions[`${observation.capability}.${observation.state}`];
}

/** Product defects are data. Blocked observations intentionally create no finding. */
export function findingFromObservation(
	observation: Observation,
): Finding | undefined {
	const definition = definitionFor(observation);
	return definition
		? {
				findingId: definition.id,
				capability: observation.capability,
				severity: definition.severity,
				title: definition.title,
				description: definition.description,
				remediation: definition.remediation,
				occurrences: [
					{
						variantId: observation.variantId,
						probeId: observation.probeId,
						observationIds: [observation.observationId],
						evidence: observation.evidence,
					},
				],
			}
		: undefined;
}
