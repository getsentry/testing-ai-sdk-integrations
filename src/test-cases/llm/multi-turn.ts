/**
 * Multi-Turn LLM Test Case
 *
 * Tests a conversation with multiple back-and-forth exchanges.
 * Validates that Sentry captures multiple gen_ai spans correctly.
 */

import { TestDefinition } from "../../types.js";
import {
  checkAISpanCount,
  checkChatSpanAttributes,
  checkValidTokenUsage,
  checkInputTokensCached,
  checkOutputTokensReasoning,
  checkInputMessagesSchema,
  checkResponseModel,
} from "../checks.js";

export const multiTurnLLMTest: TestDefinition = {
  name: "Multi-Turn LLM Test",
  description: "Multi-turn conversation with back-and-forth exchanges",
  type: "llm",

  inputs: [
    // Turn 1: Initial question
    {
      model: "gpt-5-nano",
      messages: [
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: "What is the capital of France?" },
      ],
    },
    // Turn 2: Follow-up question
    {
      model: "gpt-5-nano",
      messages: [
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: "What is the capital of France?" },
        { role: "assistant", content: "The capital of France is Paris." },
        { role: "user", content: "What is the population of that city?" },
      ],
    },
    // Turn 3: Another follow-up
    {
      model: "gpt-5-nano",
      messages: [
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: "What is the capital of France?" },
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

  criticalChecks: [checkAISpanCount(3), checkChatSpanAttributes],

  checks: [checkValidTokenUsage, checkInputMessagesSchema],

  warningChecks: [
    checkResponseModel,
    checkInputTokensCached,
    checkOutputTokensReasoning,
  ],
};

export default multiTurnLLMTest;
