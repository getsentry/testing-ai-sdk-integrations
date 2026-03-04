/**
 * MCP Tool Error Test Case
 *
 * Tests an MCP tool that raises an exception.
 * Validates that Sentry captures the error status correctly.
 */

import { TestDefinition } from "../../types.js";
import {
  checkMCPSpanCount,
  checkMCPToolSpanAttributes,
  checkMCPToolError,
  checkMCPServerAttributes,
} from "../mcp-checks.js";

export const toolErrorMCPTest: TestDefinition = {
  name: "MCP Tool Error Test",
  description: "MCP tool call that raises an exception",
  type: "mcp",

  mcpServer: {
    name: "test-server",
    tools: [
      {
        name: "failing_tool",
        description: "A tool that always fails",
        parameters: {
          input: { type: "string", description: "Input value" },
        },
        error: "Something went wrong in the tool",
      },
    ],
  },

  inputs: [
    {
      action: "call_tool",
      tool: "failing_tool",
      arguments: { input: "test" },
    },
  ],

  criticalChecks: [
    checkMCPSpanCount(1),
    checkMCPToolSpanAttributes,
  ],

  checks: [
    checkMCPToolError,
    checkMCPServerAttributes,
  ],
};

export default toolErrorMCPTest;
