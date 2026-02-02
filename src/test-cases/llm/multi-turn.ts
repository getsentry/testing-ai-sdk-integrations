/**
 * Multi-Turn LLM Test Case
 *
 * Tests a conversation with multiple back-and-forth exchanges.
 * Validates that Sentry captures multiple gen_ai spans correctly.
 */

import { expect } from "chai";
import { TestDefinition, Check } from "../../types.js";
import {
  hasLLMAttributes,
  hasValidTokenUsage,
  hasValidInputTokensCached,
  hasValidOutputTokensReasoning,
} from "../checks.js";
import { extractGenAISpans, skipIf } from "../utils.js";

/**
 * Check that exactly 3 AI spans were captured (one per turn)
 */
const hasThreeAISpans: Check = {
  name: "hasThreeAISpans",
  fn: (spans) => {
    const aiSpans = extractGenAISpans(spans);
    expect(aiSpans.length).to.equal(3);
  },
};

/**
 * Check that input tokens increase with each turn (more conversation history)
 */
const hasTokenProgression: Check = {
  name: "hasTokenProgression",
  fn: (spans) => {
    const aiSpans = extractGenAISpans(spans);
    skipIf(
      aiSpans.length < 3,
      `Expected 3 spans for multi-turn test, got ${aiSpans.length}`,
    );

    // Extract input token counts for each turn
    const inputTokens = aiSpans.map(
      (span) => span.data?.["gen_ai.usage.input_tokens"] as number,
    );

    // Input tokens should increase with each turn (more conversation history)
    expect(inputTokens[1]).to.be.greaterThan(inputTokens[0]);
    expect(inputTokens[2]).to.be.greaterThan(inputTokens[1]);
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

  checks: [
    hasThreeAISpans,
    hasLLMAttributes,
    hasValidTokenUsage,
    hasTokenProgression,
    hasValidInputTokensCached,
    hasValidOutputTokensReasoning,
  ],
};

export default multiTurnLLMTest;
