/**
 * Tool Call Agent Test Case
 *
 * Tests an agentic workflow with multiple tool calls.
 * Validates that Sentry captures both agent and tool call spans correctly.
 *
 * Expression: (3 + 5) * 4 = 32
 * - First call: add(3, 5) = 8
 * - Second call: multiply(8, 4) = 32
 */

import { TestDefinition } from "../../types.js";
import {
  checkChatSpanAttributes,
  checkAgentSpanAttributes,
  checkToolSpanAttributes,
  checkValidTokenUsage,
  checkAgentHierarchy,
  checkInputTokensCached,
  checkOutputTokensReasoning,
  checkToolCalls,
  checkAvailableTools,
  checkResponseToolCalls,
  checkInputMessagesSchema,
} from "../checks.js";
import {
  checkInputMessages,
  checkOutputMessages,
  checkToolDefinitions,
  checkToolCallArguments,
  checkToolCallResult,
  checkToolCallsNewFormat,
  checkOutputMessagesToolCalls,
} from "../otel-checks.js";

export const toolCallAgentTest: TestDefinition = {
  name: "Tool Call Agent Test",
  description: "Agent with multiple tool calls",
  type: "agent",

  agent: {
    name: "math_assistant",
    description: "A math assistant that can perform basic arithmetic",
    tools: [
      {
        name: "add",
        description: "Add two numbers together",
        parameters: {
          type: "object",
          properties: {
            a: {
              type: "number",
              description: "First number",
            },
            b: {
              type: "number",
              description: "Second number",
            },
          },
          required: ["a", "b"],
        },
        arguments: { a: 3, b: 5 },
        result: 8, // Static result: 3 + 5 = 8
      },
      {
        name: "multiply",
        description: "Multiply two numbers together",
        parameters: {
          type: "object",
          properties: {
            a: {
              type: "number",
              description: "First number",
            },
            b: {
              type: "number",
              description: "Second number",
            },
          },
          required: ["a", "b"],
        },
        arguments: { a: 8, b: 4 },
        result: 32, // Static result: 8 * 4 = 32
      },
    ],
  },

  inputs: [
    {
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content:
            "Calculate (3 + 5) * 4. First use the add tool to add 3 and 5, then use the multiply tool to multiply the result by 4.",
        },
      ],
    },
  ],

  checks: [
    checkAgentSpanAttributes,
    checkChatSpanAttributes,
    checkToolSpanAttributes,
    checkValidTokenUsage,
    checkAgentHierarchy,
    checkAvailableTools,
    checkResponseToolCalls([
      { name: "add", arguments: { a: 3, b: 5 } },
      { name: "multiply", arguments: { a: 8, b: 4 } },
    ]),
    checkToolCalls([
      {
        name: "add",
        type: "function",
        description: "Add two numbers together",
        input: { a: 3, b: 5 },
        output: 8,
      },
      {
        name: "multiply",
        type: "function",
        description: "Multiply two numbers together",
        input: { a: 8, b: 4 },
        output: 32,
      },
    ]),
    checkInputMessagesSchema,
    checkInputTokensCached,
    checkOutputTokensReasoning,
    // OTel-aligned checks (soft failure if not migrated)
    checkInputMessages,
    checkOutputMessages,
    checkToolDefinitions,
    checkToolCallArguments,
    checkToolCallResult,
    checkToolCallsNewFormat([
      { name: "add", input: { a: 3, b: 5 }, output: 8 },
      { name: "multiply", input: { a: 8, b: 4 }, output: 32 },
    ]),
    checkOutputMessagesToolCalls([
      { name: "add", arguments: { a: 3, b: 5 } },
      { name: "multiply", arguments: { a: 8, b: 4 } },
    ]),
  ],
};

export default toolCallAgentTest;
