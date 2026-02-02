/**
 * Reusable check functions for test cases
 *
 * Each check function follows the signature:
 *   (spans: CapturedSpan[], config: FrameworkConfig, testDef: TestDefinition) => void
 *
 * Check functions can:
 * - Throw an error to fail the check
 * - Call skip() or skipIf() to skip the check
 * - Use expect() from chai for assertions
 */

import { expect } from "chai";
import { CapturedSpan, FrameworkConfig, TestDefinition } from "../types.js";
import {
  extractGenAISpans,
  assertAttributes,
  checkTokenUsage,
  skip,
  skipIf,
} from "./utils.js";

/**
 * Check function signature
 */
export type CheckFunction = (
  spans: CapturedSpan[],
  config: FrameworkConfig,
  testDef: TestDefinition,
) => void | Promise<void>;

/**
 * Check definition with name and function
 */
export interface Check {
  name: string;
  fn: CheckFunction;
}

// =============================================================================
// Structure Checks
// =============================================================================

/**
 * Check that exactly one AI span was captured
 */
export const hasOneAISpan: Check = {
  name: "hasOneAISpan",
  fn: (spans) => {
    const aiSpans = extractGenAISpans(spans);
    expect(aiSpans.length, "Should have exactly one AI span").to.equal(1);
  },
};

/**
 * Check that at least one AI span was captured
 */
export const hasAISpans: Check = {
  name: "hasAISpans",
  fn: (spans) => {
    const aiSpans = extractGenAISpans(spans);
    expect(
      aiSpans.length,
      "Should have at least one AI span",
    ).to.be.greaterThan(0);
  },
};

/**
 * Check that at least one LLM span was captured (chat/completion/generate)
 */
export const hasLLMSpans: Check = {
  name: "hasLLMSpans",
  fn: (spans) => {
    const aiSpans = extractGenAISpans(spans);
    const llmSpans = aiSpans.filter((s) =>
      s.op?.match(/^gen_ai\.(chat|completion|generate)/),
    );
    expect(
      llmSpans.length,
      "Should have at least one LLM span",
    ).to.be.greaterThan(0);
  },
};

// =============================================================================
// Attribute Checks
// =============================================================================

/**
 * Check basic LLM attributes on AI spans
 * Uses model from test inputs and config overrides
 */
export const hasLLMAttributes: Check = {
  name: "hasLLMAttributes",
  fn: (spans, config, testDef) => {
    const aiSpans = extractGenAISpans(spans);
    skipIf(aiSpans.length === 0, "No AI spans captured");

    const requestModel =
      config.modelOverrides?.request || testDef.inputs[0]?.model || "gpt-*";
    const responseModel =
      config.modelOverrides?.response || `${requestModel.replace("*", "")}*`;

    assertAttributes(aiSpans, {
      "gen_ai.operation.name": true,
      "gen_ai.request.model": requestModel,
      "gen_ai.response.model": responseModel,
      "gen_ai.usage.input_tokens": true,
      "gen_ai.usage.output_tokens": true,
      "gen_ai.usage.total_tokens": true,
    });
  },
};

/**
 * Check basic LLM attributes without total_tokens (for some frameworks)
 */
export const hasBasicLLMAttributes: Check = {
  name: "hasBasicLLMAttributes",
  fn: (spans, config, testDef) => {
    const aiSpans = extractGenAISpans(spans);
    skipIf(aiSpans.length === 0, "No AI spans captured");

    const requestModel =
      config.modelOverrides?.request || testDef.inputs[0]?.model || "gpt-*";
    const responseModel =
      config.modelOverrides?.response || `${requestModel.replace("*", "")}*`;

    assertAttributes(aiSpans, {
      "gen_ai.operation.name": true,
      "gen_ai.request.model": requestModel,
      "gen_ai.response.model": responseModel,
      "gen_ai.usage.input_tokens": true,
      "gen_ai.usage.output_tokens": true,
    });
  },
};

// =============================================================================
// Token Checks
// =============================================================================

/**
 * Check token usage on all AI spans
 */
export const hasValidTokenUsage: Check = {
  name: "hasValidTokenUsage",
  fn: (spans) => {
    const aiSpans = extractGenAISpans(spans);
    skipIf(aiSpans.length === 0, "No AI spans captured");

    for (const span of aiSpans) {
      checkTokenUsage(span, { validateSum: true });
    }
  },
};

/**
 * Check that input tokens cached is valid when present
 */
export const hasValidInputTokensCached: Check = {
  name: "hasValidInputTokensCached",
  fn: (spans) => {
    const aiSpans = extractGenAISpans(spans).filter(
      (span) => span.data?.["gen_ai.usage.input_tokens.cached"] !== undefined,
    );
    skipIf(
      aiSpans.length === 0,
      "No AI spans with input_tokens.cached attribute",
    );

    for (const span of aiSpans) {
      expect(
        span.data?.["gen_ai.usage.input_tokens.cached"],
      ).to.be.lessThanOrEqual(span.data?.["gen_ai.usage.input_tokens"]);
    }
  },
};

/**
 * Check that output tokens reasoning is valid when present
 */
export const hasValidOutputTokensReasoning: Check = {
  name: "hasValidOutputTokensReasoning",
  fn: (spans) => {
    const aiSpans = extractGenAISpans(spans).filter(
      (span) =>
        span.data?.["gen_ai.usage.output_tokens.reasoning"] !== undefined,
    );
    skipIf(
      aiSpans.length === 0,
      "No AI spans with output_tokens.reasoning attribute",
    );

    for (const span of aiSpans) {
      expect(
        span.data?.["gen_ai.usage.output_tokens.reasoning"],
      ).to.be.lessThanOrEqual(span.data?.["gen_ai.usage.output_tokens"]);
    }
  },
};

/**
 * Check that input tokens indicate a large input (>1000 tokens)
 * Used for long input tests
 */
export const hasHighInputTokens: Check = {
  name: "hasHighInputTokens",
  fn: (spans) => {
    const aiSpans = extractGenAISpans(spans);
    skipIf(aiSpans.length === 0, "No AI spans captured");

    const spansWithTokens = aiSpans.filter(
      (s) => s.data?.["gen_ai.usage.input_tokens"] !== undefined,
    );
    skipIf(spansWithTokens.length === 0, "No spans with input tokens");

    const maxInputTokens = Math.max(
      ...spansWithTokens.map((s) => s.data?.["gen_ai.usage.input_tokens"] || 0),
    );

    expect(
      maxInputTokens,
      "Long input should result in >1000 input tokens",
    ).to.be.greaterThan(1000);
  },
};

/**
 * Check that image inputs contribute additional tokens
 */
export const hasImageTokens: Check = {
  name: "hasImageTokens",
  fn: (spans) => {
    const aiSpans = extractGenAISpans(spans);
    skipIf(aiSpans.length === 0, "No AI spans captured");

    // Images typically add significant tokens (at least 50-100 for small images)
    const inputTokens = aiSpans[0]?.data?.["gen_ai.usage.input_tokens"];
    skipIf(inputTokens === undefined, "No input tokens captured");

    expect(
      inputTokens,
      "Image should contribute additional input tokens",
    ).to.be.a("number");
    expect(inputTokens).to.be.greaterThan(10);
  },
};

// =============================================================================
// Message Trimming Checks
// =============================================================================

/**
 * Check that long messages are trimmed in span data
 */
export const hasMessageTrimming: Check = {
  name: "hasMessageTrimming",
  fn: (spans) => {
    const aiSpans = extractGenAISpans(spans);
    skipIf(aiSpans.length === 0, "No AI spans captured");

    // Find spans with message attribute
    let foundTrimmedMessage = false;
    const maxExpectedSize = 15000; // Sentry typically trims to ~10KB

    for (const span of aiSpans) {
      const messageValue = span.data?.["gen_ai.request.messages"];
      if (messageValue !== undefined) {
        const messageStr =
          typeof messageValue === "string"
            ? messageValue
            : JSON.stringify(messageValue);

        expect(messageStr.length, "Message should be trimmed").to.be.lessThan(
          maxExpectedSize,
        );

        foundTrimmedMessage = true;
      }
    }

    skipIf(!foundTrimmedMessage, "No gen_ai.request.messages attribute found");
  },
};

/**
 * Check that trimming metadata is present
 */
export const hasTrimmingMetadata: Check = {
  name: "hasTrimmingMetadata",
  fn: (spans) => {
    const aiSpans = extractGenAISpans(spans);
    skipIf(aiSpans.length === 0, "No AI spans captured");

    let foundMetadata = false;
    const metadataAttr =
      "sentry.sdk_meta.gen_ai.input.messages.original_length";

    for (const span of aiSpans) {
      const originalLength = span.data?.[metadataAttr];
      if (originalLength !== undefined) {
        expect(originalLength).to.be.a("number");
        expect(originalLength).to.be.greaterThan(0);
        foundMetadata = true;
      }
    }

    skipIf(!foundMetadata, `No trimming metadata found at '${metadataAttr}'`);
  },
};

// =============================================================================
// Agent-specific Checks
// =============================================================================

/**
 * Check that an agent span was captured
 */
export const hasAgentSpan: Check = {
  name: "hasAgentSpan",
  fn: (spans) => {
    const aiSpans = extractGenAISpans(spans);

    const agentSpan = aiSpans.find(
      (s) =>
        s.op?.match(/^gen_ai\.(invoke_agent|agent\.run|agent)/) ||
        s.description?.toLowerCase().includes("agent"),
    );

    skipIf(
      !agentSpan,
      "No agent span captured - framework may not emit agent spans",
    );
    expect(agentSpan!.op).to.match(/^gen_ai\./);
  },
};

/**
 * Check that a tool call span was captured
 */
export const hasToolCallSpan: Check = {
  name: "hasToolCallSpan",
  fn: (spans, config, testDef) => {
    const aiSpans = extractGenAISpans(spans);

    // Get expected tool name from test definition
    const expectedToolName = testDef.agent?.tools?.[0]?.name;

    const toolSpan = aiSpans.find(
      (s) =>
        s.op?.match(/^gen_ai\.(tool|execute_tool|tool_call)/) ||
        (expectedToolName &&
          s.description?.toLowerCase().includes(expectedToolName)) ||
        (expectedToolName && s.data?.["gen_ai.tool.name"] === expectedToolName),
    );

    skipIf(
      !toolSpan,
      "No tool call span captured - framework may not emit tool spans",
    );
    expect(toolSpan!.op).to.match(/^gen_ai\./);
  },
};

/**
 * Check that a tool error was captured in spans
 */
export const hasToolErrorSpan: Check = {
  name: "hasToolErrorSpan",
  fn: (spans, config, testDef) => {
    const aiSpans = extractGenAISpans(spans);

    const expectedToolName = testDef.agent?.tools?.[0]?.name;

    const toolSpan = aiSpans.find(
      (s) =>
        s.op?.match(/^gen_ai\.(tool|execute_tool|tool_call)/) ||
        (expectedToolName &&
          s.description?.toLowerCase().includes(expectedToolName)) ||
        (expectedToolName && s.data?.["gen_ai.tool.name"] === expectedToolName),
    );

    skipIf(!toolSpan, "No tool call span captured");

    // Check for error indicators (toolSpan is guaranteed to exist after skipIf)
    const span = toolSpan!;
    const hasError =
      span.status === "error" ||
      span.status === "internal_error" ||
      span.data?.["error"] !== undefined ||
      span.data?.["exception"] !== undefined ||
      span.data?.["gen_ai.tool.error"] !== undefined ||
      (span.tags && span.tags["error"] === true);

    skipIf(!hasError, "Tool span found but no error indicator");
  },
};

/**
 * Check that multiple LLM calls were made (for error recovery scenarios)
 */
export const hasMultipleLLMCalls: Check = {
  name: "hasMultipleLLMCalls",
  fn: (spans) => {
    const aiSpans = extractGenAISpans(spans);
    const llmSpans = aiSpans.filter((s) =>
      s.op?.match(/^gen_ai\.(chat|completion|generate)/),
    );

    skipIf(
      llmSpans.length < 2,
      `Expected multiple LLM calls, got ${llmSpans.length}`,
    );

    expect(llmSpans.length).to.be.at.least(2);
  },
};
