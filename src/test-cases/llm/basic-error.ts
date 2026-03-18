/**
 * Basic Error LLM Test Case
 *
 * Tests that Sentry correctly captures API errors when the LLM call fails.
 * Uses respx to mock a 500 Internal Server Error response.
 */

import { TestDefinition, Check } from "../../types.js";
import { checkAISpanCount } from "../checks.js";
import { extractGenAISpans } from "../utils.js";
import { CheckError } from "../../validator.js";

/**
 * Check that the span has error information
 */
const checkErrorCaptured: Check = {
  name: "checkErrorCaptured",
  fn: (spans) => {
    const aiSpans = extractGenAISpans(spans);
    if (aiSpans.length === 0) {
      throw new CheckError("Should have at least one AI span but found none");
    }

    // Any non-ok span status from Sentry's SpanStatusType is valid
    // See: sentry-javascript/packages/core/src/types-hoist/spanStatus.ts
    const errorStatuses = new Set([
      "deadline_exceeded",
      "unauthenticated",
      "permission_denied",
      "not_found",
      "resource_exhausted",
      "invalid_argument",
      "unimplemented",
      "unavailable",
      "internal_error",
      "unknown_error",
      "cancelled",
      "already_exists",
      "failed_precondition",
      "aborted",
      "out_of_range",
      "data_loss",
    ]);

    // Find a span with error status or error data
    const errorSpan = aiSpans.find(
      (span) =>
        errorStatuses.has(span.status ?? "") ||
        span.data?.["error.type"] !== undefined ||
        span.data?.["http.status_code"] === 500,
    );

    if (!errorSpan) {
      throw new CheckError(
        "Expected to find a span with an error status or error data",
        aiSpans.map((span) => ({
          spanId: span.span_id,
          message: `Span has status="${span.status}" with no error indicators`,
        })),
      );
    }
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

  criticalChecks: [checkAISpanCount({ min: 1 }), checkErrorCaptured],

  checks: [],
};

export default basicErrorLLMTest;
