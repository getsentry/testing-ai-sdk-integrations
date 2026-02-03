/**
 * Basic Error LLM Test Case
 *
 * Tests that Sentry correctly captures API errors when the LLM call fails.
 * Uses respx to mock a 500 Internal Server Error response.
 */

import { expect } from "chai";
import { TestDefinition, Check } from "../../types.js";
import { checkAISpanCount } from "../checks.js";
import { extractGenAISpans } from "../utils.js";

/**
 * Check that the span has error information
 */
const checkErrorCaptured: Check = {
  name: "checkErrorCaptured",
  fn: (spans) => {
    const aiSpans = extractGenAISpans(spans);
    expect(
      aiSpans.length,
      "Should have at least one AI span",
    ).to.be.greaterThan(0);

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

  checks: [checkAISpanCount({ min: 1 }), checkErrorCaptured],
};

export default basicErrorLLMTest;
