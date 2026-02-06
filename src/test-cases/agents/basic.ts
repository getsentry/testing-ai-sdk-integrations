/**
 * Basic Agent Test Case
 *
 * Tests an agentic workflow WITHOUT tools - similar to the basic LLM test.
 * Validates that Sentry captures agent spans correctly for simple completions.
 */

import { TestDefinition } from "../../types.js";
import {
  checkChatSpanAttributes,
  checkAgentSpanAttributes,
  checkValidTokenUsage,
  checkAgentHierarchy,
  checkInputTokensCached,
  checkOutputTokensReasoning,
  checkInputMessagesSchema,
} from "../checks.js";
import {
  checkInputMessages,
  checkOutputMessages,
  checkSystemInstructions,
} from "../otel-checks.js";

export const basicAgentTest: TestDefinition = {
  name: "Basic Agent Test",
  description: "Agent without tools - simple completion",
  type: "agent",

  // Agent without tools - just a simple assistant
  agent: {
    name: "helpful_assistant",
    description: "A helpful assistant that answers questions",
    tools: [],
  },

  inputs: [
    {
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: "What is the capital of France?" },
      ],
    },
  ],

  checks: [
    checkAgentSpanAttributes,
    checkChatSpanAttributes,
    checkValidTokenUsage,
    checkAgentHierarchy,
    checkInputMessagesSchema,
    checkInputTokensCached,
    checkOutputTokensReasoning,
    // OTel-aligned checks (soft failure if not migrated)
    checkInputMessages,
    checkOutputMessages,
    checkSystemInstructions,
  ],
};

export default basicAgentTest;
