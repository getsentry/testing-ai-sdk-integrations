import type { AssessmentCategory } from "./types.js";

export interface ProbeDefinition {
	id: string;
	description: string;
	/** A baseline failure prevents meaningful evidence for the remaining probes. */
	stopsVariantOnFailure: boolean;
}

const llmProbes: readonly ProbeDefinition[] = [
	{
		id: "llm.baseline",
		description: "A successful completion with system and user input.",
		stopsVariantOnFailure: true,
	},
	{
		id: "llm.multi_turn",
		description: "Several calls with increasing conversation history.",
		stopsVariantOnFailure: false,
	},
	{
		id: "llm.provider_error",
		description: "An intentionally invalid provider/API operation.",
		stopsVariantOnFailure: false,
	},
	{
		id: "llm.conversation",
		description: "Interleaved calls with two conversation identifiers.",
		stopsVariantOnFailure: false,
	},
	{
		id: "llm.long_input",
		description: "A request exceeding the telemetry trimming threshold.",
		stopsVariantOnFailure: false,
	},
];

const agentProbes: readonly ProbeDefinition[] = [
	{
		id: "agent.baseline",
		description: "An agent invocation without tools.",
		stopsVariantOnFailure: true,
	},
	{
		id: "agent.tools_success",
		description: "A deterministic add and multiply tool execution.",
		stopsVariantOnFailure: false,
	},
	{
		id: "agent.tool_error",
		description: "A deterministic tool error.",
		stopsVariantOnFailure: false,
	},
	{
		id: "agent.conversation",
		description: "Interleaved invocations with two conversation identifiers.",
		stopsVariantOnFailure: false,
	},
	{
		id: "agent.long_input",
		description: "An invocation exceeding the telemetry trimming threshold.",
		stopsVariantOnFailure: false,
	},
];

export function getProbeCatalog(
	category: AssessmentCategory,
): readonly ProbeDefinition[] {
	return category === "llm" ? llmProbes : agentProbes;
}
