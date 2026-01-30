/**
 * Vision LLM Test Case
 *
 * Tests sending an image (base64 encoded PNG) to the LLM to verify
 * multimodal input handling and Sentry span capture.
 */

import { expect } from "chai";
import { TestDefinition, CapturedSpan, FrameworkConfig } from "../../types.js";
import {
  extractGenAISpans,
  checkTokenUsage,
  assertAttributes,
  skipIf,
} from "../utils.js";

// Small 10x10 red PNG image encoded as base64
const TEST_IMAGE_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mP8z8BQz0AEYBxVSF+FABJADveWkH6oAAAAAElFTkSuQmCC";

export const visionLLMTest: TestDefinition = {
  name: "Vision LLM Test",
  description: "Send an image to the LLM and ask about its contents",
  type: "llm",

  inputs: [
    {
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are a helpful assistant that can analyze images. Be concise.",
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "What color is this image? Reply with just the color name.",
            },
            {
              type: "image",
              base64: TEST_IMAGE_BASE64,
              mediaType: "image/png",
            },
          ],
        },
      ],
    },
  ],

  // Check 1: Verify we got exactly one AI span
  checkStructure(spans: CapturedSpan[], config: FrameworkConfig) {
    const aiSpans = extractGenAISpans(spans);
    expect(aiSpans.length).to.equal(1);
  },

  // Check 2: Validate span attributes
  checkAttributes(spans: CapturedSpan[], config: FrameworkConfig) {
    const aiSpans = extractGenAISpans(spans);
    assertAttributes(aiSpans, {
      "gen_ai.operation.name": true,
      "gen_ai.request.model": config.modelOverrides?.request || "gpt-4o-mini",
      "gen_ai.response.model":
        config.modelOverrides?.response || "gpt-4o-mini*",
      "gen_ai.usage.input_tokens": true,
      "gen_ai.usage.output_tokens": true,
    });
  },

  // Check 3: Validate token usage
  checkTokens(spans: CapturedSpan[], config: FrameworkConfig) {
    const aiSpans = extractGenAISpans(spans);

    for (const span of aiSpans) {
      checkTokenUsage(span, { validateSum: true });
    }
  },

  // Check 4: Verify image tokens are counted (images use more input tokens)
  checkImageTokens(spans: CapturedSpan[], config: FrameworkConfig) {
    const aiSpans = extractGenAISpans(spans);
    skipIf(
      aiSpans.length === 0,
      "No AI spans captured - cannot validate image tokens",
    );

    for (const span of aiSpans) {
      const inputTokens = span.data?.["gen_ai.usage.input_tokens"];
      // Images typically add tokens - different providers count differently
      // Text alone would be ~15-25 tokens, so we expect at least 25 total
      expect(inputTokens).to.be.greaterThan(
        25,
        "Image should contribute additional input tokens",
      );
    }
  },
};

export default visionLLMTest;
