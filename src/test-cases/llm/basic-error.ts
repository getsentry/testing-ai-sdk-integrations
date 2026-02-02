/**
 * Basic Error LLM Test Case
 *
 * Tests that Sentry correctly captures API errors when the LLM call fails.
 * Uses respx to mock a 500 Internal Server Error response.
 */

import { expect } from "chai";
import { TestDefinition, Check } from "../../types.js";
import { extractGenAISpans, skipIf } from "../utils.js";

/**
 * Check that at least one AI span was captured for the errored request
 */
const hasAtLeastOneAISpan: Check = {
  name: "hasAtLeastOneAISpan",
  fn: (spans) => {
    const aiSpans = extractGenAISpans(spans);
    expect(
      aiSpans.length,
      "Expected at least one AI span for the errored request",
    ).to.be.greaterThanOrEqual(1);
  },
};

/**
 * Check that the span has error information
 */
const hasErrorCaptured: Check = {
  name: "hasErrorCaptured",
  fn: (spans) => {
    const aiSpans = extractGenAISpans(spans);
    skipIf(aiSpans.length === 0, "No AI spans captured");

    // Find a span with error status or error data
    const errorSpan = aiSpans.find(
      (span) =>
        span.status === "internal_error" ||
        span.status === "unknown_error" ||
        span.data?.["error.type"] !== undefined ||
        span.data?.["http.status_code"] === 500,
    );

    expect(errorSpan, "Expected to find a span with error information").to
      .exist;
  },
};

/**
 * Check that the span has a gen_ai or http operation
 */
const hasValidOperation: Check = {
  name: "hasValidOperation",
  fn: (spans) => {
    const aiSpans = extractGenAISpans(spans);
    skipIf(aiSpans.length === 0, "No AI spans captured");

    // The span should still have the gen_ai operation
    const chatSpan = aiSpans.find(
      (span) =>
        span.op?.startsWith("gen_ai.") ||
        span.op === "ai.chat" ||
        span.op === "http.client",
    );

    expect(chatSpan, "Expected to find a gen_ai or http span").to.exist;
  },
};

/**
 * Skip token checks since the request failed
 */
const skipTokensForError: Check = {
  name: "skipTokensForError",
  fn: () => {
    skipIf(true, "Skipped - API request failed, no tokens to check");
  },
};

export const basicErrorLLMTest: TestDefinition = {
  name: "Basic Error LLM Test",
  description: "Tests error capture when API returns 500 Internal Server Error",
  type: "llm",

  // This flag tells templates to mock an API error
  causeAPIError: true,

  inputs: [
    {
      model: "gpt-5-nano",
      messages: [
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: "What is the capital of France?" },
      ],
    },
  ],

  checks: [
    hasAtLeastOneAISpan,
    hasErrorCaptured,
    hasValidOperation,
    skipTokensForError,
  ],
};

export default basicErrorLLMTest;
