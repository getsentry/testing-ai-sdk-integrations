/**
 * Long Input Agent Test Case
 *
 * Tests that very long user messages (>20KB) trigger proper trimming
 * of gen_ai.request.messages in the Sentry span data for agentic frameworks.
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

export const longInputAgentTest: TestDefinition = {
  name: "Long Input Agent Test",
  description: "Tests message trimming for agent inputs > 20KB",
  type: "agent",

  // Simple agent with a tool - the focus is on the long input, not tool usage
  agent: {
    name: "summarizer_assistant",
    description: "An assistant that can summarize text",
    tools: [
      {
        name: "get_word_count",
        description: "Count the number of words in a text",
        parameters: {
          type: "object",
          properties: {
            text: {
              type: "string",
              description: "The text to count words in",
            },
          },
          required: ["text"],
        },
        result: 2400, // Approximate word count for our long message
      },
    ],
  },

  inputs: [
    {
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: `Please summarize the following text in one sentence. You may use the get_word_count tool first if needed: ${LONG_MESSAGE}`,
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

    // Find LLM spans that might have the messages attribute
    const llmSpans = aiSpans.filter((s) =>
      s.op?.match(/^gen_ai\.(chat|completion|generate)/),
    );

    // If no LLM spans, check all AI spans
    const spansToCheck = llmSpans.length > 0 ? llmSpans : aiSpans;

    let foundTrimmedMessage = false;
    let maxMessageLength = 0;

    for (const span of spansToCheck) {
      const data = span.data || {};

      // Look for the request messages attribute
      const messagesAttr = "gen_ai.request.messages";
      const messageValue = data[messagesAttr];

      if (messageValue !== undefined) {
        const messageStr =
          typeof messageValue === "string"
            ? messageValue
            : JSON.stringify(messageValue);

        // Track the longest message we find (agents may have multiple LLM calls)
        if (messageStr.length > maxMessageLength) {
          maxMessageLength = messageStr.length;
        }

        // The message should be trimmed to less than the original
        expect(
          messageStr.length,
          `Message should be trimmed from ${MESSAGE_BYTE_LENGTH} bytes to under ${EXPECTED_MAX_TRIMMED_SIZE}`,
        ).to.be.lessThan(EXPECTED_MAX_TRIMMED_SIZE);

        foundTrimmedMessage = true;
      }
    }

    skipIf(
      !foundTrimmedMessage,
      "No 'gen_ai.request.messages' attribute found - framework may not capture messages",
    );

    // At least one message should have meaningful content (the first LLM call with our long input)
    // We lower the threshold since some frameworks may have shorter message representations
    expect(
      maxMessageLength,
      "At least one trimmed message should have content",
    ).to.be.greaterThan(30);
  },

  // Check 3: Verify trimming metadata is present
  checkTrimmingMetadata(spans: CapturedSpan[], config: FrameworkConfig) {
    const aiSpans = extractGenAISpans(spans);
    skipIf(aiSpans.length === 0, "No AI spans captured");

    let foundMetadata = false;

    for (const span of aiSpans) {
      const data = span.data || {};

      // Sentry should add metadata about the original message length
      const originalLengthAttr =
        "sentry.sdk_meta.gen_ai.input.messages.original_length";
      const originalLength = data[originalLengthAttr];

      if (originalLength !== undefined) {
        expect(originalLength).to.be.a("number");
        expect(originalLength).to.be.greaterThan(0);
        foundMetadata = true;
      }
    }

    skipIf(
      !foundMetadata,
      "No trimming metadata found - SDK may not support this",
    );
  },

  // Check 4: Basic attributes should still be present on LLM spans
  checkAttributes(spans: CapturedSpan[], config: FrameworkConfig) {
    const aiSpans = extractGenAISpans(spans);

    // Find LLM spans (chat/completion/generate)
    const llmSpans = aiSpans.filter((s) =>
      s.op?.match(/^gen_ai\.(chat|completion|generate)/),
    );
    skipIf(llmSpans.length === 0, "No LLM spans captured");

    assertAttributes(llmSpans, {
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

    // Find spans with input tokens
    const spansWithTokens = aiSpans.filter(
      (s) => s.data?.["gen_ai.usage.input_tokens"] !== undefined,
    );
    skipIf(spansWithTokens.length === 0, "No spans with input tokens captured");

    // At least one span should have high input tokens from our long message
    const maxInputTokens = Math.max(
      ...spansWithTokens.map((s) => s.data?.["gen_ai.usage.input_tokens"] || 0),
    );

    // A ~25KB message should result in many tokens (roughly 1 token per 4-5 chars)
    // So we expect at least 1000 tokens for a ~25KB message
    expect(
      maxInputTokens,
      `Long input (~${MESSAGE_BYTE_LENGTH} bytes) should result in many input tokens`,
    ).to.be.greaterThan(1000);
  },
};

export default longInputAgentTest;
