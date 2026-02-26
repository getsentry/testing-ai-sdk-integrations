/**
 * Multi-Turn LLM Test Case
 *
 * Tests a conversation with multiple back-and-forth exchanges.
 * Validates that Sentry captures multiple gen_ai spans correctly.
 */

import { TestDefinition, Check, ErrorLocation } from "../../types.js";
import {
  checkAISpanCount,
  checkChatSpanAttributes,
  checkValidTokenUsage,
  checkInputTokensCached,
  checkOutputTokensReasoning,
  checkInputMessagesSchema,
  checkResponseModel,
} from "../checks.js";
import { extractGenAISpans, skipIf } from "../utils.js";
import { CheckError } from "../../validator.js";

/**
 * Check that input tokens increase with each turn (more conversation history)
 */
const checkTokenProgression: Check = {
  name: "checkTokenProgression",
  fn: (spans) => {
    const aiSpans = extractGenAISpans(spans)
      .slice()
      // it's not guaranteed that the spans will be sorted by start_timestamp, so we need to sort them
      .sort((a, b) => a.start_timestamp - b.start_timestamp);
    skipIf(
      aiSpans.length < 3,
      `Expected 3 spans for multi-turn test, got ${aiSpans.length}`,
    );

    // Extract input token counts for each turn
    const inputTokens = aiSpans.map(
      (span) => span.data?.["gen_ai.usage.input_tokens"] as number,
    );

    // Input tokens should increase with each turn (more conversation history)
    const errors: ErrorLocation[] = [];
    if (!(inputTokens[1] > inputTokens[0])) {
      errors.push({
        spanId: aiSpans[1].span_id,
        attribute: "gen_ai.usage.input_tokens",
        message: `Turn 2 input tokens (${inputTokens[1]}) should be greater than turn 1 (${inputTokens[0]})`,
      });
    }
    if (!(inputTokens[2] > inputTokens[1])) {
      errors.push({
        spanId: aiSpans[2].span_id,
        attribute: "gen_ai.usage.input_tokens",
        message: `Turn 3 input tokens (${inputTokens[2]}) should be greater than turn 2 (${inputTokens[1]})`,
      });
    }
    if (errors.length > 0) {
      throw new CheckError(
        `Input token progression failed: tokens should increase with each turn`,
        errors,
      );
    }
  },
};

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

  criticalChecks: [
    checkAISpanCount(3),
    checkChatSpanAttributes,
  ],

  checks: [
    checkValidTokenUsage,
    checkTokenProgression,
    checkInputMessagesSchema,
  ],

  warningChecks: [
    checkResponseModel,
    checkInputTokensCached,
    checkOutputTokensReasoning,
  ],
};

export default multiTurnLLMTest;
