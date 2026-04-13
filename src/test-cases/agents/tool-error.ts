/**
 * Tool Error Agent Test Case
 *
 * Tests an agentic workflow where a tool raises an exception.
 * Validates that Sentry captures the error correctly in spans.
 */

import { TestDefinition, CapturedSpan, Check, ErrorLocation } from "../../types.js";
import {
  checkChatSpanAttributes,
  checkAgentSpanAttributes,
  checkToolSpanAttributes,
  checkAgentHierarchy,
  checkInputMessagesSchema,
  checkAvailableTools,
  checkResponseToolCalls,
  checkResponseModel,
} from "../checks.js";
import { extractGenAISpans, findToolSpans } from "../utils.js";
import { CheckError } from "../../validator.js";

/**
 * Check that a tool error was captured in spans
 */
const checkToolErrorSpan: Check = {
  name: "checkToolErrorSpan",
  fn: (spans: CapturedSpan[], config, testDef) => {
    const toolSpans = findToolSpans(extractGenAISpans(spans));
    if (toolSpans.length === 0) {
      throw new CheckError("Should have at least one tool span but found none");
    }

    // Get expected tool name from test definition
    const expectedToolName = testDef.agent?.tools?.[0]?.name;
    if (!expectedToolName) {
      throw new CheckError("Test should define at least one tool with a name");
    }

    // Find the span for the expected tool
    const toolSpan = toolSpans.find(
      (s) =>
        s.data?.["gen_ai.tool.name"] === expectedToolName ||
        s.description?.includes(expectedToolName),
    );
    if (!toolSpan) {
      throw new CheckError(
        `Should have a span for tool "${expectedToolName}"`,
        toolSpans.map((s) => ({
          spanId: s.span_id,
          attribute: "gen_ai.tool.name",
          message: `Tool span has name="${s.data?.["gen_ai.tool.name"]}" / description="${s.description}", expected "${expectedToolName}"`,
        })),
      );
    }

    // The tool raised an error, so the span status must not be "ok" or unset.
    // Valid error statuses: "internal_error", "error", etc.
    const status = toolSpan.status;
    if (!status || status === "ok") {
      throw new CheckError(
        `Tool span status should indicate an error (e.g. "internal_error") but got "${status ?? "undefined"}"`,
        [{
          spanId: toolSpan.span_id,
          attribute: "status",
          message: `Tool span status is "${status ?? "undefined"}", expected a non-ok error status`,
        }],
      );
    }
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
        arguments: { path: "/nonexistent/file.txt" },
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

  criticalChecks: [
    checkAgentSpanAttributes,
    checkChatSpanAttributes,
    checkToolSpanAttributes,
    checkAgentHierarchy,
  ],

  checks: [
    checkAvailableTools,
    checkResponseToolCalls([
      { name: "read_file", arguments: { path: "/nonexistent/file.txt" } },
    ]),
    checkInputMessagesSchema,
    checkToolErrorSpan,
  ],

  warningChecks: [
    checkResponseModel,
  ],
};

export default toolErrorAgentTest;
