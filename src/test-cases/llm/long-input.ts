/**
 * Long Input LLM Test Case
 *
 * Tests that very long user messages (>20KB) trigger proper trimming
 * of gen_ai.request.messages in the Sentry span data.
 *
 * Sentry SDKs trim long messages to prevent excessive span sizes.
 * This test validates:
 * 1. The message content is trimmed (less than original size)
 * 2. Metadata about trimming is present (original_length)
 * 3. Basic attributes are still captured correctly
 * 4. Token counts reflect the actual (untrimmed) input
 */

import { expect } from "chai";
import { TestDefinition, CapturedSpan, FrameworkConfig } from "../../types.js";
import { extractGenAISpans, assertAttributes, skipIf } from "../utils.js";

// Generate a long message that exceeds 20KB
// We'll repeat a pattern to create predictable content
const LONG_MESSAGE_PATTERN =
  "This is a test message that will be repeated many times to create a very long input. ";
const REPETITIONS = 300; // ~25KB of text (85 chars * 300 = 25,500 bytes)
const LONG_MESSAGE = LONG_MESSAGE_PATTERN.repeat(REPETITIONS);

// Calculate byte length for validation
const MESSAGE_BYTE_LENGTH = Buffer.from(LONG_MESSAGE).length;

// Expected max size after trimming (Sentry typically trims to ~10KB)
const EXPECTED_MAX_TRIMMED_SIZE = 15000;

export const longInputLLMTest: TestDefinition = {
  name: "Long Input LLM Test",
  description: "Tests message trimming for inputs > 20KB",
  type: "llm",

  inputs: [
    {
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are a helpful assistant. Respond briefly.",
        },
        {
          role: "user",
          content: `Summarize this in one sentence: ${LONG_MESSAGE}`,
        },
      ],
    },
  ],

  // Check 1: Verify we got at least one AI span
  checkStructure(spans: CapturedSpan[], config: FrameworkConfig) {
    const aiSpans = extractGenAISpans(spans);
    expect(aiSpans.length).to.be.greaterThan(
      0,
      "Should have at least one AI span",
    );
  },

  // Check 2: Validate that the message content was trimmed
  checkMessageTrimming(spans: CapturedSpan[], config: FrameworkConfig) {
    const aiSpans = extractGenAISpans(spans);
    skipIf(aiSpans.length === 0, "No AI spans captured");

    for (const span of aiSpans) {
      const data = span.data || {};

      // Look for the request messages attribute
      const messagesAttr = "gen_ai.request.messages";
      const messageValue = data[messagesAttr];

      skipIf(
        messageValue === undefined,
        `No '${messagesAttr}' attribute found - framework may not capture messages`,
      );

      const messageStr =
        typeof messageValue === "string"
          ? messageValue
          : JSON.stringify(messageValue);

      // The message should be trimmed to less than the original
      expect(
        messageStr.length,
        `Message should be trimmed from ${MESSAGE_BYTE_LENGTH} bytes to under ${EXPECTED_MAX_TRIMMED_SIZE}`,
      ).to.be.lessThan(EXPECTED_MAX_TRIMMED_SIZE);

      // Should still have meaningful content (not completely empty)
      expect(
        messageStr.length,
        "Trimmed message should still have content",
      ).to.be.greaterThan(100);
    }
  },

  // Check 3: Verify trimming metadata is present
  checkTrimmingMetadata(spans: CapturedSpan[], config: FrameworkConfig) {
    const aiSpans = extractGenAISpans(spans);
    skipIf(aiSpans.length === 0, "No AI spans captured");

    for (const span of aiSpans) {
      const data = span.data || {};

      // Sentry should add metadata about the original message length
      const originalLengthAttr =
        "sentry.sdk_meta.gen_ai.input.messages.original_length";
      const originalLength = data[originalLengthAttr];

      // This attribute indicates trimming occurred
      skipIf(
        originalLength === undefined,
        `No trimming metadata found at '${originalLengthAttr}' - SDK may not support this`,
      );

      expect(originalLength).to.be.a("number");
      expect(originalLength).to.be.greaterThan(0);
    }
  },

  // Check 4: Basic attributes should still be present
  checkAttributes(spans: CapturedSpan[], config: FrameworkConfig) {
    const aiSpans = extractGenAISpans(spans);
    skipIf(aiSpans.length === 0, "No AI spans captured");

    assertAttributes(aiSpans, {
      "gen_ai.operation.name": true,
      "gen_ai.request.model": config.modelOverrides?.request || "gpt-4o-mini",
      "gen_ai.usage.input_tokens": true,
      "gen_ai.usage.output_tokens": true,
    });
  },

  // Check 5: Input tokens should reflect the long input (untrimmed)
  checkHighInputTokens(spans: CapturedSpan[], config: FrameworkConfig) {
    const aiSpans = extractGenAISpans(spans);
    skipIf(aiSpans.length === 0, "No AI spans captured");

    for (const span of aiSpans) {
      const inputTokens = span.data?.["gen_ai.usage.input_tokens"];
      skipIf(
        inputTokens === undefined,
        "No input tokens captured - cannot validate token count",
      );

      // A ~25KB message should result in many tokens (roughly 1 token per 4-5 chars)
      // So we expect at least 1000 tokens for a ~25KB message
      expect(
        inputTokens,
        `Long input (~${MESSAGE_BYTE_LENGTH} bytes) should result in many input tokens`,
      ).to.be.greaterThan(1000);
    }
  },
};

export default longInputLLMTest;
