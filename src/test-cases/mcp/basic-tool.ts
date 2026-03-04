/**
 * Basic MCP Tool Call Test Case
 *
 * Tests a single MCP tool call via an MCP server.
 * Validates that Sentry captures the mcp.server span with correct tool attributes.
 */

import { TestDefinition } from "../../types.js";
import {
  checkMCPSpanCount,
  checkMCPToolSpanAttributes,
  checkMCPToolResult,
  checkMCPServerAttributes,
} from "../mcp-checks.js";

export const basicMCPToolTest: TestDefinition = {
  name: "Basic MCP Tool Call Test",
  description: "Single MCP tool call with successful result",
  type: "mcp",

  mcpServer: {
    name: "test-server",
    tools: [
      {
        name: "get_weather",
        description: "Get the current weather for a city",
        parameters: {
          city: { type: "string", description: "City name" },
        },
        result: "Sunny, 72°F in Paris",
      },
    ],
  },

  inputs: [
    {
      action: "call_tool",
      tool: "get_weather",
      arguments: { city: "Paris" },
    },
  ],

  criticalChecks: [
    checkMCPSpanCount(1),
    checkMCPToolSpanAttributes,
  ],

  checks: [
    checkMCPToolResult,
    checkMCPServerAttributes,
  ],
};

export default basicMCPToolTest;
