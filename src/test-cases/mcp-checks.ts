/**
 * Reusable check functions for MCP (Model Context Protocol) test cases
 *
 * MCP spans use:
 * - op: "mcp.server"
 * - description: "tools/call {name}", "resources/read {uri}", "prompts/get {name}"
 * - attributes: mcp.* prefix (not gen_ai.*)
 */

import { CapturedSpan, Check, FrameworkConfig, TestDefinition } from "../types.js";
import { CheckError } from "../validator.js";
import {
  extractMCPSpans,
  findMCPToolSpans,
  findMCPResourceSpans,
  findMCPPromptSpans,
  assertAttributes,
  skipIf,
} from "./utils.js";

// =============================================================================
// Structure Checks
// =============================================================================

/**
 * Factory: validate the number of MCP spans captured
 */
export function checkMCPSpanCount(
  expected: number | { min?: number; max?: number },
): Check {
  let name: string;
  if (typeof expected === "number") {
    name = `checkMCPSpanCount(${expected})`;
  } else if (expected.min !== undefined && expected.max !== undefined) {
    name = `checkMCPSpanCount(${expected.min}-${expected.max})`;
  } else if (expected.min !== undefined) {
    name = `checkMCPSpanCount(>=${expected.min})`;
  } else if (expected.max !== undefined) {
    name = `checkMCPSpanCount(<=${expected.max})`;
  } else {
    name = "checkMCPSpanCount";
  }

  return {
    name,
    fn: (spans: CapturedSpan[]) => {
      const mcpSpans = extractMCPSpans(spans);

      if (typeof expected === "number") {
        if (mcpSpans.length !== expected) {
          throw new CheckError(
            `Expected ${expected} MCP span(s) but found ${mcpSpans.length}`,
          );
        }
      } else {
        if (expected.min !== undefined && mcpSpans.length < expected.min) {
          throw new CheckError(
            `Expected at least ${expected.min} MCP span(s) but found ${mcpSpans.length}`,
          );
        }
        if (expected.max !== undefined && mcpSpans.length > expected.max) {
          throw new CheckError(
            `Expected at most ${expected.max} MCP span(s) but found ${mcpSpans.length}`,
          );
        }
      }
    },
  };
}

// =============================================================================
// Tool Checks
// =============================================================================

/**
 * Validate MCP tool call span attributes
 * Checks: op, description pattern, mcp.tool.name, mcp.method.name
 */
export const checkMCPToolSpanAttributes: Check = {
  name: "checkMCPToolSpanAttributes",
  fn: (spans: CapturedSpan[]) => {
    const toolSpans = findMCPToolSpans(spans);
    skipIf(toolSpans.length === 0, "No MCP tool spans found");

    assertAttributes(toolSpans, {
      op: "mcp.server",
      "mcp.method.name": "tools/call",
      "mcp.tool.name": true,
    });

    // Validate description matches "tools/call {tool_name}" pattern
    for (const span of toolSpans) {
      const toolName = span.data?.["mcp.tool.name"];
      const expectedDesc = `tools/call ${toolName}`;
      if (span.description !== expectedDesc) {
        throw new CheckError(
          `MCP tool span description should be "${expectedDesc}" but is "${span.description}"`,
          [{ spanId: span.span_id, attribute: "description", message: `Expected "${expectedDesc}"` }],
        );
      }
    }
  },
};

/**
 * Validate MCP tool result attributes (successful tool call)
 * Checks: mcp.tool.result.content exists, mcp.tool.result.is_error is false
 */
export const checkMCPToolResult: Check = {
  name: "checkMCPToolResult",
  fn: (spans: CapturedSpan[]) => {
    const toolSpans = findMCPToolSpans(spans);
    skipIf(toolSpans.length === 0, "No MCP tool spans found");

    for (const span of toolSpans) {
      const isError = span.data?.["mcp.tool.result.is_error"];
      if (isError === true) {
        throw new CheckError(
          `MCP tool span has mcp.tool.result.is_error=true but expected successful result`,
          [{ spanId: span.span_id, attribute: "mcp.tool.result.is_error", message: "Expected false" }],
        );
      }
    }

    assertAttributes(toolSpans, {
      "mcp.tool.result.content": true,
    });
  },
};

/**
 * Validate MCP tool error attributes
 * Checks: mcp.tool.result.is_error is true
 */
export const checkMCPToolError: Check = {
  name: "checkMCPToolError",
  fn: (spans: CapturedSpan[]) => {
    const toolSpans = findMCPToolSpans(spans);
    skipIf(toolSpans.length === 0, "No MCP tool spans found");

    for (const span of toolSpans) {
      const isError = span.data?.["mcp.tool.result.is_error"];
      if (isError !== true) {
        throw new CheckError(
          `MCP tool span should have mcp.tool.result.is_error=true but got ${isError}`,
          [{ spanId: span.span_id, attribute: "mcp.tool.result.is_error", message: "Expected true" }],
        );
      }
    }
  },
};

/**
 * Factory: validate multiple MCP tool spans with expected tool names
 */
export function checkMCPMultipleTools(
  expectedTools: string[],
): Check {
  return {
    name: `checkMCPMultipleTools(${expectedTools.join(", ")})`,
    fn: (spans: CapturedSpan[]) => {
      const toolSpans = findMCPToolSpans(spans);

      if (toolSpans.length < expectedTools.length) {
        throw new CheckError(
          `Expected ${expectedTools.length} MCP tool span(s) but found ${toolSpans.length}`,
        );
      }

      const foundNames = toolSpans.map((s) => s.data?.["mcp.tool.name"]).filter(Boolean);

      for (const expected of expectedTools) {
        if (!foundNames.includes(expected)) {
          throw new CheckError(
            `Expected MCP tool span for "${expected}" but found: [${foundNames.join(", ")}]`,
          );
        }
      }
    },
  };
}

// =============================================================================
// Resource Checks
// =============================================================================

/**
 * Validate MCP resource read span attributes
 * Checks: op, description pattern, mcp.resource.uri, mcp.resource.protocol
 */
export const checkMCPResourceSpanAttributes: Check = {
  name: "checkMCPResourceSpanAttributes",
  fn: (spans: CapturedSpan[]) => {
    const resourceSpans = findMCPResourceSpans(spans);
    skipIf(resourceSpans.length === 0, "No MCP resource spans found");

    assertAttributes(resourceSpans, {
      op: "mcp.server",
      "mcp.method.name": "resources/read",
      "mcp.resource.uri": true,
    });

    // Validate description matches "resources/read {uri}" pattern
    for (const span of resourceSpans) {
      const uri = span.data?.["mcp.resource.uri"];
      const expectedDesc = `resources/read ${uri}`;
      if (span.description !== expectedDesc) {
        throw new CheckError(
          `MCP resource span description should be "${expectedDesc}" but is "${span.description}"`,
          [{ spanId: span.span_id, attribute: "description", message: `Expected "${expectedDesc}"` }],
        );
      }
    }
  },
};

// =============================================================================
// Prompt Checks
// =============================================================================

/**
 * Validate MCP prompt get span attributes
 * Checks: op, description pattern, mcp.prompt.name
 */
export const checkMCPPromptSpanAttributes: Check = {
  name: "checkMCPPromptSpanAttributes",
  fn: (spans: CapturedSpan[]) => {
    const promptSpans = findMCPPromptSpans(spans);
    skipIf(promptSpans.length === 0, "No MCP prompt spans found");

    assertAttributes(promptSpans, {
      op: "mcp.server",
      "mcp.method.name": "prompts/get",
      "mcp.prompt.name": true,
    });

    // Validate description matches "prompts/get {name}" pattern
    for (const span of promptSpans) {
      const promptName = span.data?.["mcp.prompt.name"];
      const expectedDesc = `prompts/get ${promptName}`;
      if (span.description !== expectedDesc) {
        throw new CheckError(
          `MCP prompt span description should be "${expectedDesc}" but is "${span.description}"`,
          [{ spanId: span.span_id, attribute: "description", message: `Expected "${expectedDesc}"` }],
        );
      }
    }
  },
};

// =============================================================================
// Common Checks
// =============================================================================

/**
 * Validate common MCP server attributes on all MCP spans
 * Checks: mcp.transport exists on all spans
 */
export const checkMCPServerAttributes: Check = {
  name: "checkMCPServerAttributes",
  fn: (spans: CapturedSpan[]) => {
    const mcpSpans = extractMCPSpans(spans);
    skipIf(mcpSpans.length === 0, "No MCP spans found");

    assertAttributes(mcpSpans, {
      "mcp.transport": true,
    });
  },
};
