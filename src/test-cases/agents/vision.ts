/**
 * Vision Agent Test Case
 *
 * Tests an agentic workflow with image input.
 * Validates that Sentry captures agent spans when processing images.
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

export const visionAgentTest: TestDefinition = {
  name: "Vision Agent Test",
  description: "Agent that analyzes an image",
  type: "agent",

  // No tools needed for this test - just image analysis
  agent: {
    name: "vision_assistant",
    description:
      "An assistant that can analyze images and describe what it sees",
    tools: [],
  },

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

  // Check 1: Verify we got at least one AI span
  checkStructure(spans: CapturedSpan[], config: FrameworkConfig) {
    const aiSpans = extractGenAISpans(spans);
    expect(aiSpans.length).to.be.greaterThan(0);
  },

  // Check 2: Validate span attributes on LLM spans
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
      "gen_ai.response.model":
        config.modelOverrides?.response || "gpt-4o-mini*",
      "gen_ai.usage.input_tokens": true,
      "gen_ai.usage.output_tokens": true,
    });
  },

  // Check 3: Validate token usage
  checkTokens(spans: CapturedSpan[], config: FrameworkConfig) {
    const aiSpans = extractGenAISpans(spans);
    const llmSpans = aiSpans.filter((s) =>
      s.op?.match(/^gen_ai\.(chat|completion|generate)/),
    );
    skipIf(llmSpans.length === 0, "No LLM spans captured");

    for (const span of llmSpans) {
      checkTokenUsage(span, { validateSum: true });
    }
  },

  // Check 4: Verify image tokens are counted
  checkImageTokens(spans: CapturedSpan[], config: FrameworkConfig) {
    const aiSpans = extractGenAISpans(spans);
    const llmSpans = aiSpans.filter((s) =>
      s.op?.match(/^gen_ai\.(chat|completion|generate)/),
    );
    skipIf(
      llmSpans.length === 0,
      "No LLM spans captured - cannot validate image tokens",
    );

    for (const span of llmSpans) {
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

export default visionAgentTest;
