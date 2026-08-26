import type { AssessmentCategory } from "../assessment/types.js";

interface ProbeMessage {
	role: "system" | "user" | "assistant";
	content: string;
}

interface CompletionInput {
	model: string;
	messages: ProbeMessage[];
	conversationId?: string;
	streaming?: boolean;
}

export interface LlmProbeInput {
	calls: CompletionInput[];
	expectError?: boolean;
	originalInputBytes?: number;
}

export interface AgentToolInput {
	name: string;
	description: string;
	parameters: Record<string, unknown>;
	arguments: Record<string, unknown>;
	result?: unknown;
	error?: string;
}

export interface AgentProbeInput extends LlmProbeInput {
	tools?: AgentToolInput[];
}

const assistant = "You are a helpful assistant. Respond briefly.";
const capitalQuestion = "What is the capital of France?";
const longPattern =
	"This is a test message that will be repeated many times to create a very long input. ";
const longMessage = longPattern.repeat(300);

const llmProbeInputs: Record<string, LlmProbeInput> = {
	"llm.baseline": {
		calls: [
			{
				model: "gpt-5-nano",
				messages: [
					{ role: "system", content: assistant },
					{ role: "user", content: capitalQuestion },
				],
			},
		],
	},
	"llm.multi_turn": {
		calls: [
			{
				model: "gpt-5-nano",
				messages: [
					{ role: "system", content: assistant },
					{ role: "user", content: capitalQuestion },
				],
			},
			{
				model: "gpt-5-nano",
				messages: [
					{ role: "system", content: assistant },
					{ role: "user", content: capitalQuestion },
					{ role: "assistant", content: "The capital of France is Paris." },
					{ role: "user", content: "What is the population of that city?" },
				],
			},
			{
				model: "gpt-5-nano",
				messages: [
					{ role: "system", content: assistant },
					{ role: "user", content: capitalQuestion },
					{ role: "assistant", content: "The capital of France is Paris." },
					{ role: "user", content: "What is the population of that city?" },
					{
						role: "assistant",
						content:
							"Paris has a population of approximately 2.2 million people in the city proper.",
					},
					{ role: "user", content: "What about the metropolitan area?" },
				],
			},
		],
	},
	"llm.provider_error": {
		expectError: true,
		calls: [
			{
				model: "sentry-assessment-invalid-model",
				messages: [
					{ role: "system", content: assistant },
					{ role: "user", content: capitalQuestion },
				],
			},
		],
	},
	"llm.conversation": {
		calls: [
			{
				model: "gpt-5-nano",
				conversationId: "assessment-conversation-a",
				messages: [
					{ role: "system", content: assistant },
					{ role: "user", content: capitalQuestion },
				],
			},
			{
				model: "gpt-5-nano",
				conversationId: "assessment-conversation-b",
				messages: [
					{ role: "system", content: "You are a math tutor." },
					{ role: "user", content: "What is 2 + 2?" },
				],
			},
			{
				model: "gpt-5-nano",
				conversationId: "assessment-conversation-a",
				messages: [
					{ role: "system", content: assistant },
					{ role: "user", content: capitalQuestion },
					{ role: "assistant", content: "The capital of France is Paris." },
					{ role: "user", content: "What about Germany?" },
				],
			},
			{
				model: "gpt-5-nano",
				conversationId: "assessment-conversation-b",
				messages: [
					{ role: "system", content: "You are a math tutor." },
					{ role: "user", content: "What is 2 + 2?" },
					{ role: "assistant", content: "2 + 2 equals 4." },
					{ role: "user", content: "What about 3 + 3?" },
				],
			},
		],
	},
	"llm.long_input": {
		calls: [
			{
				model: "gpt-4o-mini",
				messages: [
					{ role: "system", content: assistant },
					{
						role: "user",
						content: `Summarize this in one sentence: ${longMessage}`,
					},
				],
			},
		],
		originalInputBytes: Buffer.byteLength(longMessage),
	},
};

const agentLongMessage = longPattern.repeat(300);

const agentProbeInputs: Record<string, AgentProbeInput> = {
	"agent.baseline": {
		calls: [
			{
				model: "gpt-4o-mini",
				messages: [
					{ role: "system", content: assistant },
					{ role: "user", content: capitalQuestion },
				],
			},
		],
	},
	"agent.tools_success": {
		calls: [
			{
				model: "gpt-4o-mini",
				messages: [
					{
						role: "user",
						content: "Calculate (3 + 5) * 4. Use add, then multiply.",
					},
				],
			},
		],
		tools: [
			{
				name: "add",
				description: "Add two numbers together",
				parameters: {
					type: "object",
					properties: { a: { type: "number" }, b: { type: "number" } },
					required: ["a", "b"],
				},
				arguments: { a: 3, b: 5 },
				result: 8,
			},
			{
				name: "multiply",
				description: "Multiply two numbers together",
				parameters: {
					type: "object",
					properties: { a: { type: "number" }, b: { type: "number" } },
					required: ["a", "b"],
				},
				arguments: { a: 8, b: 4 },
				result: 32,
			},
		],
	},
	"agent.tool_error": {
		calls: [
			{
				model: "gpt-4o-mini",
				messages: [
					{
						role: "user",
						content: "Read /nonexistent/file.txt with the read_file tool.",
					},
				],
			},
		],
		tools: [
			{
				name: "read_file",
				description: "Read a file",
				parameters: {
					type: "object",
					properties: { path: { type: "string" } },
					required: ["path"],
				},
				arguments: { path: "/nonexistent/file.txt" },
				error: "FileNotFoundError: /nonexistent/file.txt does not exist",
			},
		],
	},
	"agent.conversation": {
		calls: [
			{
				model: "gpt-4o-mini",
				conversationId: "assessment-agent-a",
				messages: [{ role: "user", content: capitalQuestion }],
			},
			{
				model: "gpt-4o-mini",
				conversationId: "assessment-agent-b",
				messages: [{ role: "user", content: "What is 2 + 2?" }],
			},
			{
				model: "gpt-4o-mini",
				conversationId: "assessment-agent-a",
				messages: [{ role: "user", content: "What about Germany?" }],
			},
			{
				model: "gpt-4o-mini",
				conversationId: "assessment-agent-b",
				messages: [{ role: "user", content: "What about 3 + 3?" }],
			},
		],
	},
	"agent.long_input": {
		calls: [
			{
				model: "gpt-4o-mini",
				messages: [
					{
						role: "user",
						content: `Summarize this in one sentence: ${agentLongMessage}`,
					},
				],
			},
		],
		originalInputBytes: Buffer.byteLength(agentLongMessage),
		tools: [
			{
				name: "get_word_count",
				description: "Count words in text",
				parameters: {
					type: "object",
					properties: { text: { type: "string" } },
					required: ["text"],
				},
				arguments: { text: agentLongMessage },
				result: 2400,
			},
		],
	},
};

/** Probe inputs are category-owned data, not a matrix axis. */
export function getProbeInputs(
	category: AssessmentCategory,
): Record<string, LlmProbeInput | AgentProbeInput> {
	return category === "llm" ? llmProbeInputs : agentProbeInputs;
}
