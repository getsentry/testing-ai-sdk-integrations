/**
 * MCP Resource Read Test Case
 *
 * Tests reading a resource from an MCP server.
 * Validates that Sentry captures the resource span with correct URI and protocol.
 */

import { TestDefinition } from "../../types.js";
import {
  checkMCPSpanCount,
  checkMCPResourceSpanAttributes,
  checkMCPServerAttributes,
} from "../mcp-checks.js";

export const resourceReadMCPTest: TestDefinition = {
  name: "MCP Resource Read Test",
  description: "Read a resource from an MCP server",
  type: "mcp",

  mcpServer: {
    name: "test-server",
    resources: [
      {
        uri: "config://app",
        name: "app_config",
        description: "Application configuration",
        content: "App configuration data: debug=false, version=1.0.0",
      },
    ],
  },

  inputs: [
    {
      action: "read_resource",
      uri: "config://app",
    },
  ],

  criticalChecks: [
    checkMCPSpanCount(1),
    checkMCPResourceSpanAttributes,
  ],

  checks: [
    checkMCPServerAttributes,
  ],
};

export default resourceReadMCPTest;
