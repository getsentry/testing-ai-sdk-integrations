/**
 * Tool Error Agent Test Case
 *
 * Tests an agentic workflow where a tool raises an exception.
 * Validates that Sentry captures the error correctly in spans.
 */

import { expect } from "chai";
import { TestDefinition, CapturedSpan, Check } from "../../types.js";
import {
  checkChatSpanAttributes,
  checkAgentSpanAttributes,
  checkToolSpanAttributes,
  checkAgentHierarchy,
  checkInputMessagesSchema,
  checkAvailableTools,
  checkResponseToolCalls,
} from "../checks.js";
import { extractGenAISpans, findToolSpans } from "../utils.js";

/**
 * Check that a tool error was captured in spans
 */
const checkToolErrorSpan: Check = {
  name: "checkToolErrorSpan",
  fn: (spans: CapturedSpan[], config, testDef) => {
    const toolSpans = findToolSpans(extractGenAISpans(spans));
    expect(
      toolSpans.length,
      "Should have at least one tool span",
    ).to.be.greaterThan(0);

    // Get expected tool name from test definition
    const expectedToolName = testDef.agent?.tools?.[0]?.name;
    expect(expectedToolName, "Test should define at least one tool").to.exist;

    // Find the span for the expected tool
    const toolSpan = toolSpans.find(
      (s) =>
        s.data?.["gen_ai.tool.name"] === expectedToolName ||
        s.description?.includes(expectedToolName!),
    );
    expect(toolSpan, `Should have a span for tool "${expectedToolName}"`).to
      .exist;

    // Check for error indicators
    const span = toolSpan!;
    const hasError =
      span.status === "error" ||
      span.status === "internal_error" ||
      span.data?.["error"] !== undefined ||
      span.data?.["exception"] !== undefined ||
      span.data?.["gen_ai.tool.error"] !== undefined ||
      (span.tags && span.tags["error"] === true);

    expect(hasError, "Tool span should have an error indicator").to.be.true;
  },
};

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

  checks: [
    checkAgentSpanAttributes,
    checkChatSpanAttributes,
    checkToolSpanAttributes,
    checkAgentHierarchy,
    checkAvailableTools,
    checkResponseToolCalls([
      { name: "read_file", arguments: { path: "/nonexistent/file.txt" } },
    ]),
    checkInputMessagesSchema,
    checkToolErrorSpan,
  ],
};

export default toolErrorAgentTest;
