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
} from "../checks.js";
import {
  checkInputMessages,
  checkOutputMessages,
  checkToolDefinitions,
  checkToolCallArguments,
  checkOutputMessagesToolCalls,
} from "../otel-checks.js";
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

    // Check for error indicators
    const hasError =
      toolSpan.status === "error" ||
      toolSpan.status === "internal_error" ||
      toolSpan.data?.["error"] !== undefined ||
      toolSpan.data?.["exception"] !== undefined ||
      toolSpan.data?.["gen_ai.tool.error"] !== undefined ||
      (toolSpan.tags && toolSpan.tags["error"] === true);

    if (!hasError) {
      throw new CheckError(
        "Tool span should have an error indicator (status=error, data.error, data.exception, gen_ai.tool.error, or tags.error)",
        [{
          spanId: toolSpan.span_id,
          message: `Tool span has status="${toolSpan.status}" with no error indicators`,
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
    checkInputMessages,
    checkOutputMessages,
    checkToolDefinitions,
    checkToolCallArguments,
    checkOutputMessagesToolCalls([
      { name: "read_file", arguments: { path: "/nonexistent/file.txt" } },
    ]),
  ],
};

export default toolErrorAgentTest;
