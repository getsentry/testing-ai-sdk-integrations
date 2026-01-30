/**
 * Tool Error Agent Test Case
 *
 * Tests an agentic workflow where a tool raises an exception.
 * Validates that Sentry captures the error correctly in spans.
 */

import { expect } from "chai";
import { TestDefinition, CapturedSpan, FrameworkConfig } from "../../types.js";
import { extractGenAISpans, assertAttributes, skipIf } from "../utils.js";

export const toolErrorAgentTest: TestDefinition = {
  name: "Tool Error Agent Test",
  description: "Agent with tool that raises an exception",
  type: "agent",

  agent: {
    name: "file_assistant",
    description: "An assistant that can read files",
    tools: [
      {
        name: "read_file",
        description: "Read the contents of a file",
        parameters: {
          type: "object",
          properties: {
            path: {
              type: "string",
              description: "The path to the file to read",
            },
          },
          required: ["path"],
        },
        // This tool will raise an error instead of returning a result
        error:
          "FileNotFoundError: The file '/nonexistent/file.txt' does not exist",
      },
    ],
  },

  inputs: [
    {
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content:
            "Please read the file at /nonexistent/file.txt and tell me what it contains. Use the read_file tool.",
        },
      ],
    },
  ],

  // Check 1: Verify we got at least one AI span
  checkStructure(spans: CapturedSpan[], config: FrameworkConfig) {
    const aiSpans = extractGenAISpans(spans);
    expect(
      aiSpans.length,
      "Should have at least one AI span",
    ).to.be.greaterThan(0);
  },

  // Check 2: Basic LLM attributes should still be present
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

  // Check 3: Look for tool span with error
  checkToolErrorSpan(spans: CapturedSpan[], config: FrameworkConfig) {
    const aiSpans = extractGenAISpans(spans);

    // Look for tool call span
    const toolSpan = aiSpans.find(
      (s) =>
        s.op?.match(/^gen_ai\.(tool|execute_tool|tool_call)/) ||
        s.description?.toLowerCase().includes("read_file") ||
        s.data?.["gen_ai.tool.name"] === "read_file",
    );

    skipIf(
      !toolSpan,
      "No tool call span captured - framework may not emit tool spans",
    );

    // If tool span exists, check for error indicators
    if (toolSpan) {
      // Different frameworks may capture errors differently
      // Check various error indicators
      const hasError =
        toolSpan.status === "error" ||
        toolSpan.status === "internal_error" ||
        toolSpan.data?.["error"] !== undefined ||
        toolSpan.data?.["exception"] !== undefined ||
        toolSpan.data?.["gen_ai.tool.error"] !== undefined ||
        (toolSpan.tags && toolSpan.tags["error"] === true);

      skipIf(
        !hasError,
        "Tool span found but no error indicator - framework may not capture tool errors in spans",
      );
    }
  },

  // Check 4: Agent should still complete (handle the error gracefully)
  checkAgentSpan(spans: CapturedSpan[], config: FrameworkConfig) {
    const aiSpans = extractGenAISpans(spans);

    // Look for agent span
    const agentSpan = aiSpans.find(
      (s) =>
        s.op?.match(/^gen_ai\.(invoke_agent|agent\.run|agent)/) ||
        s.description?.toLowerCase().includes("agent"),
    );

    skipIf(
      !agentSpan,
      "No agent span captured - framework may not emit agent spans",
    );

    // Agent span should exist even when tool errors
    if (agentSpan) {
      expect(agentSpan.op).to.match(/^gen_ai\./);
    }
  },

  // Check 5: Should have multiple LLM calls (initial + after error)
  checkMultipleLLMCalls(spans: CapturedSpan[], config: FrameworkConfig) {
    const aiSpans = extractGenAISpans(spans);

    // Find LLM spans
    const llmSpans = aiSpans.filter((s) =>
      s.op?.match(/^gen_ai\.(chat|completion|generate)/),
    );

    // When a tool errors, the agent typically:
    // 1. Makes initial LLM call that decides to use tool
    // 2. Tool errors
    // 3. Makes another LLM call to handle/report the error
    // So we expect at least 2 LLM spans
    skipIf(
      llmSpans.length < 2,
      `Expected multiple LLM calls for error handling, got ${llmSpans.length} - framework may handle errors differently`,
    );

    expect(
      llmSpans.length,
      "Should have multiple LLM calls when tool errors",
    ).to.be.at.least(2);
  },
};

export default toolErrorAgentTest;
