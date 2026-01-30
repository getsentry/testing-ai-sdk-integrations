/**
 * Tool Call Agent Test Case
 *
 * Tests an agentic workflow with successful tool calling.
 * Validates that Sentry captures both agent and tool call spans.
 */

import { expect } from "chai";
import { TestDefinition, CapturedSpan, FrameworkConfig } from "../../types.js";
import {
  extractGenAISpans,
  checkTokenUsage,
  assertAttributes,
  skipIf,
} from "../utils.js";

export const toolCallAgentTest: TestDefinition = {
  name: "Tool Call Agent Test",
  description: "Agent with successful tool call",
  type: "agent",

  agent: {
    name: "math_assistant",
    description: "A math assistant that can perform basic arithmetic",
    tools: [
      {
        name: "add",
        description: "Add two numbers together",
        parameters: {
          type: "object",
          properties: {
            a: {
              type: "number",
              description: "First number",
            },
            b: {
              type: "number",
              description: "Second number",
            },
          },
          required: ["a", "b"],
        },
        result: 11, // Static result: 4 + 7 = 11
      },
    ],
  },

  inputs: [
    {
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: "What is the result of 4 + 7? Use the add tool.",
        },
      ],
    },
  ],

  checkStructure(spans: CapturedSpan[], config: FrameworkConfig) {
    const aiSpans = extractGenAISpans(spans);
    expect(
      aiSpans.length,
      "Should have at least one AI span for tool calling",
    ).to.be.greaterThan(0);
  },

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

  checkAgentSpan(spans: CapturedSpan[], config: FrameworkConfig) {
    const aiSpans = extractGenAISpans(spans);

    // Look for agent span (for agentic frameworks)
    const agentSpan = aiSpans.find(
      (s) =>
        s.op?.match(/^gen_ai\.(invoke_agent|agent\.run|agent)/) ||
        s.description?.toLowerCase().includes("agent"),
    );

    skipIf(
      !agentSpan,
      "No agent span captured - framework may not emit agent spans",
    );

    // If agent span exists, verify it has the expected structure
    expect(agentSpan!.op).to.match(/^gen_ai\./);
  },

  checkToolCallSpan(spans: CapturedSpan[], config: FrameworkConfig) {
    const aiSpans = extractGenAISpans(spans);

    // Look for tool call span
    const toolSpan = aiSpans.find(
      (s) =>
        s.op?.match(/^gen_ai\.(tool|execute_tool|tool_call)/) ||
        s.description?.toLowerCase().includes("add") ||
        s.data?.["gen_ai.tool.name"] === "add",
    );

    skipIf(
      !toolSpan,
      "No tool call span captured - framework may not emit tool spans",
    );

    // If tool span exists, verify it has expected attributes
    if (toolSpan) {
      expect(toolSpan.op).to.match(/^gen_ai\./);
    }
  },

  checkInputTokensCached(spans: CapturedSpan[], config: FrameworkConfig) {
    const aiSpansWithInputTokensCached = extractGenAISpans(spans).filter(
      (span) => span.data?.["gen_ai.usage.input_tokens.cached"] !== undefined,
    );
    skipIf(
      aiSpansWithInputTokensCached.length === 0,
      "No AI spans captured with input tokens cached - cannot validate input tokens cached",
    );
    for (const span of aiSpansWithInputTokensCached) {
      expect(
        span.data?.["gen_ai.usage.input_tokens.cached"],
      ).to.be.lessThanOrEqual(span.data?.["gen_ai.usage.input_tokens"]);
    }
  },

  checkOutputTokensReasoning(spans: CapturedSpan[], config: FrameworkConfig) {
    const aiSpansWithOutputTokensReasoning = extractGenAISpans(spans).filter(
      (span) =>
        span.data?.["gen_ai.usage.output_tokens.reasoning"] !== undefined,
    );
    skipIf(
      aiSpansWithOutputTokensReasoning.length === 0,
      "No AI spans captured with output tokens reasoning - cannot validate output tokens reasoning",
    );
    for (const span of aiSpansWithOutputTokensReasoning) {
      expect(
        span.data?.["gen_ai.usage.output_tokens.reasoning"],
      ).to.be.lessThanOrEqual(span.data?.["gen_ai.usage.output_tokens"]);
    }
  },
};

export default toolCallAgentTest;
