/**
 * MCP Multiple Tool Calls Test Case
 *
 * Tests multiple MCP tool calls in sequence.
 * Validates that Sentry captures a span for each tool call with correct names.
 */

import { TestDefinition } from "../../types.js";
import {
  checkMCPSpanCount,
  checkMCPToolSpanAttributes,
  checkMCPToolResult,
  checkMCPMultipleTools,
  checkMCPServerAttributes,
} from "../mcp-checks.js";

export const multiToolMCPTest: TestDefinition = {
  name: "MCP Multiple Tool Calls Test",
  description: "Multiple MCP tool calls with different tools",
  type: "mcp",

  mcpServer: {
    name: "test-server",
    tools: [
      {
        name: "add",
        description: "Add two numbers together",
        parameters: {
          a: { type: "number", description: "First number" },
          b: { type: "number", description: "Second number" },
        },
        result: 8,
      },
      {
        name: "multiply",
        description: "Multiply two numbers together",
        parameters: {
          a: { type: "number", description: "First number" },
          b: { type: "number", description: "Second number" },
        },
        result: 32,
      },
    ],
  },

  inputs: [
    {
      action: "call_tool",
      tool: "add",
      arguments: { a: 3, b: 5 },
    },
    {
      action: "call_tool",
      tool: "multiply",
      arguments: { a: 8, b: 4 },
    },
  ],

  criticalChecks: [
    checkMCPSpanCount(2),
    checkMCPToolSpanAttributes,
  ],

  checks: [
    checkMCPToolResult,
    checkMCPMultipleTools(["add", "multiply"]),
    checkMCPServerAttributes,
  ],
};

export default multiToolMCPTest;
