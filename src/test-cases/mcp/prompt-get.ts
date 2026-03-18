/**
 * MCP Prompt Get Test Case
 *
 * Tests retrieving a prompt template from an MCP server.
 * Validates that Sentry captures the prompt span with correct name and attributes.
 */

import { TestDefinition } from "../../types.js";
import {
  checkMCPSpanCount,
  checkMCPPromptSpanAttributes,
  checkMCPServerAttributes,
} from "../mcp-checks.js";

export const promptGetMCPTest: TestDefinition = {
  name: "MCP Prompt Get Test",
  description: "Retrieve a prompt template from an MCP server",
  type: "mcp",

  mcpServer: {
    name: "test-server",
    prompts: [
      {
        name: "summarize",
        description: "Summarize the given text",
        parameters: {
          text: { type: "string", description: "Text to summarize" },
        },
        template: "Please summarize the following text: {text}",
      },
    ],
  },

  inputs: [
    {
      action: "get_prompt",
      prompt: "summarize",
      arguments: { text: "The quick brown fox jumps over the lazy dog." },
    },
  ],

  criticalChecks: [
    checkMCPSpanCount(1),
    checkMCPPromptSpanAttributes,
  ],

  checks: [
    checkMCPServerAttributes,
  ],
};

export default promptGetMCPTest;
