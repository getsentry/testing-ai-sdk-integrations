/**
 * Basic LLM Test Case
 *
 * Tests a simple completion call with system message and user prompt.
 * Validates that Sentry captures the gen_ai span correctly.
 */

import { TestDefinition } from "../../types.js";
import {
  checkAISpanCount,
  checkChatSpanAttributes,
  checkValidTokenUsage,
  checkInputTokensCached,
  checkOutputTokensReasoning,
  checkInputMessagesSchema,
} from "../checks.js";

export const basicLLMTest: TestDefinition = {
  name: "Basic LLM Test",
  description: "Single completion call with system message",
  type: "llm",

  inputs: [
    {
      model: "gpt-5-nano",
      messages: [
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: "What is the capital of France?" },
      ],
    },
  ],

  criticalChecks: [
    checkAISpanCount(1),
    checkChatSpanAttributes,
  ],

  checks: [
    checkValidTokenUsage,
    checkInputMessagesSchema,
  ],

  warningChecks: [
    checkInputTokensCached,
    checkOutputTokensReasoning,
  ],
};

export default basicLLMTest;
