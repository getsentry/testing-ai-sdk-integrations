/**
 * Tool Call Agent Test Case
 *
 * Tests an agentic workflow with successful tool calling.
 * Validates that Sentry captures both agent and tool call spans.
 */

import { TestDefinition } from "../../types.js";
import {
  hasAISpans,
  hasLLMSpans,
  hasBasicLLMAttributes,
  hasValidTokenUsage,
  hasAgentSpan,
  hasToolCallSpan,
  hasValidInputTokensCached,
  hasValidOutputTokensReasoning,
} from "../checks.js";

export const toolCallAgentTest: TestDefinition = {
  name: "Tool Call Agent Test",
  description: "Agent with successful tool call",
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
        result: 11, // Static result: 4 + 7 = 11
      },
    ],
  },

  inputs: [
    {
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: "What is the result of 4 + 7? Use the add tool.",
        },
      ],
    },
  ],

  checks: [
    hasAISpans,
    hasLLMSpans,
    hasBasicLLMAttributes,
    hasValidTokenUsage,
    hasAgentSpan,
    hasToolCallSpan,
    hasValidInputTokensCached,
    hasValidOutputTokensReasoning,
  ],
};

export default toolCallAgentTest;
