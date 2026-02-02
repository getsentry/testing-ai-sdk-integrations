/**
 * Tool Error Agent Test Case
 *
 * Tests an agentic workflow where a tool raises an exception.
 * Validates that Sentry captures the error correctly in spans.
 */

import { TestDefinition } from "../../types.js";
import {
  hasAISpans,
  hasLLMSpans,
  hasBasicLLMAttributes,
  hasAgentSpan,
  hasToolErrorSpan,
  hasMultipleLLMCalls,
} from "../checks.js";

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
    hasAISpans,
    hasLLMSpans,
    hasBasicLLMAttributes,
    hasToolErrorSpan,
    hasAgentSpan,
    hasMultipleLLMCalls,
  ],
};

export default toolErrorAgentTest;
