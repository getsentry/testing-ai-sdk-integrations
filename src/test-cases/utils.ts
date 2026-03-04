/**
 * Common test utilities for span validation
 */

import { CapturedSpan, ErrorLocation, FrameworkConfig } from "../types.js";
import { SkipCheckError, CheckError } from "../validator.js";
import { getAttributeWithFallback } from "../deprecation/fallback.js";

/**
 * Skip the current check with a reason
 * @param reason - Why the check is being skipped
 * @throws {SkipCheckError}
 * @example
 * if (!spans.length) {
 *   skip('No spans captured - cannot validate attributes');
 * }
 */
export function skip(reason: string): never {
  throw new SkipCheckError(reason);
}

/**
 * Conditionally skip the current check
 * @param condition - If true, skip the check
 * @param reason - Why the check is being skipped
 * @throws {SkipCheckError}
 * @example
 * skipIf(spans.length === 0, 'No spans captured');
 * skipIf(!config.supportsStreaming, 'Framework does not support streaming');
 */
export function skipIf(condition: boolean, reason: string): void {
  if (condition) {
    throw new SkipCheckError(reason);
  }
}

/**
 * Map a tool name using framework-specific toolNameMapping if available.
 * Some frameworks (e.g., Laravel) use different naming conventions (PascalCase)
 * than the test definitions (lowercase).
 *
 * @param toolName - The expected tool name from the test definition
 * @param config - The framework configuration
 * @returns The mapped tool name, or the original name if no mapping exists
 *
 * @example
 * // Laravel config has: toolNameMapping: { "add": "Add", "multiply": "Multiply" }
 * mapToolName("add", laravelConfig) // Returns "Add"
 * mapToolName("add", openaiConfig)  // Returns "add" (no mapping)
 */
export function mapToolName(
  toolName: string,
  config?: FrameworkConfig
): string {
  return config?.toolNameMapping?.[toolName] ?? toolName;
}

/**
 * Callable that receives a span and returns an expected value for validation.
 * Use this to derive expected values dynamically from span attributes.
 *
 * @example
 * // Check that description equals "<operation.name> <model>"
 * { "description": (span) => `${span.data?.["gen_ai.operation.name"]} ${span.data?.["gen_ai.request.model"]}` }
 */
export type AttributeSchemaFn = (span: CapturedSpan) => boolean | string | number | RegExp;

/**
 * Attribute schema for validation
 * - true: attribute must exist
 * - false: attribute must NOT exist
 * - RegExp: must match the regular expression
 * - string with '*': must match pattern (glob-style)
 * - string/number: must equal exact value
 * - function(span): dynamically compute the expected value from the span
 */
export type AttributeSchema = {
  [key: string]: boolean | string | number | RegExp | AttributeSchemaFn;
};

/**
 * Extract AI spans from captured spans
 * Only supports gen_ai.* prefixed operations
 */
export function extractGenAISpans(spans: CapturedSpan[]): CapturedSpan[] {
  return spans.filter((s) => s.op && s.op.startsWith("gen_ai"));
}

/**
 * Check token usage attributes
 */
export interface TokenUsageChecks {
  /** Check for input tokens */
  hasInputTokens?: boolean;
  /** Check for output tokens */
  hasOutputTokens?: boolean;
  /** Check for total tokens */
  hasTotalTokens?: boolean;
  /** Minimum total tokens */
  minTotalTokens?: number;
  /** Check that total = input + output */
  validateSum?: boolean;
}

export function checkTokenUsage(
  span: CapturedSpan,
  checks: TokenUsageChecks = {},
): void {
  const {
    hasInputTokens = true,
    hasOutputTokens = true,
    hasTotalTokens = true,
    minTotalTokens,
    validateSum = true,
  } = checks;

  if (!span.data) {
    throw new CheckError("Span has no data field", [
      { spanId: span.span_id, message: "Span has no data field" },
    ]);
  }

  // Extract token counts (only gen_ai.* prefix)
  const inputTokens = span.data["gen_ai.usage.input_tokens"];
  const outputTokens = span.data["gen_ai.usage.output_tokens"];
  const totalTokens = span.data["gen_ai.usage.total_tokens"];

  const errors: string[] = [];
  const locations: ErrorLocation[] = [];

  function addError(attr: string, msg: string) {
    errors.push(msg);
    locations.push({ spanId: span.span_id, attribute: attr, message: msg });
  }

  // Check presence
  if (hasInputTokens) {
    if (inputTokens === undefined || inputTokens === null) {
      addError("gen_ai.usage.input_tokens", "input_tokens must exist");
    } else if (typeof inputTokens !== "number") {
      addError("gen_ai.usage.input_tokens", `input_tokens must be a number but is ${typeof inputTokens}`);
    } else if (inputTokens <= 0) {
      addError("gen_ai.usage.input_tokens", `input_tokens must be > 0 but is ${inputTokens}`);
    }
  }

  if (hasOutputTokens) {
    if (outputTokens === undefined || outputTokens === null) {
      addError("gen_ai.usage.output_tokens", "output_tokens must exist");
    } else if (typeof outputTokens !== "number") {
      addError("gen_ai.usage.output_tokens", `output_tokens must be a number but is ${typeof outputTokens}`);
    } else if (outputTokens <= 0) {
      addError("gen_ai.usage.output_tokens", `output_tokens must be > 0 but is ${outputTokens}`);
    }
  }

  if (hasTotalTokens) {
    if (totalTokens === undefined || totalTokens === null) {
      addError("gen_ai.usage.total_tokens", "total_tokens must exist");
    } else if (typeof totalTokens !== "number") {
      addError("gen_ai.usage.total_tokens", `total_tokens must be a number but is ${typeof totalTokens}`);
    } else if (totalTokens <= 0) {
      addError("gen_ai.usage.total_tokens", `total_tokens must be > 0 but is ${totalTokens}`);
    }
  }

  // Check minimum total
  if (minTotalTokens !== undefined && totalTokens && typeof totalTokens === "number") {
    if (totalTokens < minTotalTokens) {
      addError("gen_ai.usage.total_tokens", `total_tokens (${totalTokens}) must be >= ${minTotalTokens}`);
    }
  }

  // Validate sum
  if (validateSum && typeof inputTokens === "number" && typeof outputTokens === "number" && typeof totalTokens === "number") {
    if (totalTokens !== inputTokens + outputTokens) {
      addError("gen_ai.usage.total_tokens", `total_tokens (${totalTokens}) should equal input (${inputTokens}) + output (${outputTokens}) = ${inputTokens + outputTokens}`);
    }
  }

  if (errors.length > 0) {
    throw new CheckError(
      `Token usage validation failed:\n  ${errors.join("\n  ")}`,
      locations,
    );
  }
}

/**
 * Check span hierarchy structure
 */
export interface SpanHierarchyChecks {
  /** Expected parent operation pattern */
  parentOp?: RegExp;
  /** Expected child operation pattern */
  childOp?: RegExp;
  /** Minimum number of children */
  minChildren?: number;
  /** Exact number of children */
  exactChildren?: number;
}

export function checkSpanStructure(
  spans: CapturedSpan[],
  checks: SpanHierarchyChecks,
): void {
  const { parentOp, childOp, minChildren, exactChildren } = checks;

  // Find parent span
  const parentSpan = parentOp
    ? spans.find((s) => s.op && s.op.match(parentOp))
    : undefined;

  if (parentOp && !parentSpan) {
    throw new CheckError(`No parent span found matching pattern: ${parentOp}`);
  }

  // Find child spans
  let childSpans: CapturedSpan[] = [];

  if (parentSpan) {
    // Find spans that reference this parent
    childSpans = spans.filter((s) => s.parent_span_id === parentSpan.span_id);
  } else if (childOp) {
    // Just filter by operation pattern
    childSpans = spans.filter((s) => s.op && s.op.match(childOp));
  }

  // Check child count
  const errors: string[] = [];
  const locations: ErrorLocation[] = [];

  if (minChildren !== undefined && childSpans.length < minChildren) {
    const msg = `Should have at least ${minChildren} child span(s) but found ${childSpans.length}`;
    errors.push(msg);
    if (parentSpan) {
      locations.push({ spanId: parentSpan.span_id, message: msg });
    }
  }

  if (exactChildren !== undefined && childSpans.length !== exactChildren) {
    const msg = `Should have exactly ${exactChildren} child span(s) but found ${childSpans.length}`;
    errors.push(msg);
    if (parentSpan) {
      locations.push({ spanId: parentSpan.span_id, message: msg });
    }
  }

  // Validate child operations
  if (childOp) {
    childSpans.forEach((child, idx) => {
      if (!child.op || !child.op.match(childOp)) {
        const msg = `Child span ${idx} operation "${child.op}" should match pattern ${childOp}`;
        errors.push(msg);
        locations.push({ spanId: child.span_id, attribute: "op", message: msg });
      }
    });
  }

  if (errors.length > 0) {
    throw new CheckError(
      `Span structure validation failed:\n  ${errors.join("\n  ")}`,
      locations,
    );
  }
}

/**
 * Helper to print span summary for debugging
 */
export function printSpanSummary(spans: CapturedSpan[]): void {
  console.log(`\n  Captured ${spans.length} span(s):`);
  spans.forEach((s, i) => {
    const parent = s.parent_span_id
      ? ` (parent: ${s.parent_span_id.substring(0, 8)})`
      : "";
    console.log(`    [${i}] ${s.op}${parent}`);
  });
}

/**
 * Match a value against a pattern (supports * wildcards)
 */
function matchPattern(value: string, pattern: string): boolean {
  // Escape special regex characters except *
  const regexPattern = pattern
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*");

  const regex = new RegExp(`^${regexPattern}$`);
  return regex.test(value);
}

/**
 * Resolve an attribute value from a span.
 * Looks up in span.data first, then falls back to top-level span fields
 * (e.g. "description", "op", "status").
 */
function resolveAttribute(span: CapturedSpan, attrName: string): unknown {
  // Check span.data first
  if (span.data?.[attrName] !== undefined) {
    return span.data[attrName];
  }
  // Fall back to top-level span fields
  if (attrName in span) {
    return (span as Record<string, unknown>)[attrName];
  }
  return undefined;
}

/**
 * Validate a single attribute against an expected value.
 * Returns an error message string if validation fails, or null if it passes.
 */
function validateAttribute(
  actual: unknown,
  expected: boolean | string | number | RegExp,
  attrName: string,
  spanId: string,
): string | null {
  const ref = `Span ${spanId.substring(0, 8)}`;
  if (expected === true) {
    if (actual === undefined || actual === null) {
      return `${ref}: Attribute '${attrName}' must exist but is missing`;
    }
  } else if (expected === false) {
    if (actual !== undefined && actual !== null) {
      return `${ref}: Attribute '${attrName}' must not exist but has value: ${actual}`;
    }
  } else if (expected instanceof RegExp) {
    if (actual === undefined || actual === null) {
      return `${ref}: Attribute '${attrName}' must exist for regex matching but is missing`;
    } else if (typeof actual !== "string") {
      return `${ref}: Attribute '${attrName}' must be a string for regex matching but is: ${typeof actual}`;
    } else if (!expected.test(actual)) {
      return `${ref}: Attribute '${attrName}' value '${actual}' does not match regex ${expected}`;
    }
  } else if (typeof expected === "string" && expected.includes("*")) {
    if (actual === undefined || actual === null) {
      return `${ref}: Attribute '${attrName}' must exist for pattern matching but is missing`;
    } else if (typeof actual !== "string") {
      return `${ref}: Attribute '${attrName}' must be a string for pattern matching but is: ${typeof actual}`;
    } else if (!matchPattern(actual, expected)) {
      return `${ref}: Attribute '${attrName}' value '${actual}' does not match pattern '${expected}'`;
    }
  } else {
    if (actual === undefined || actual === null) {
      return `${ref}: Attribute '${attrName}' must equal '${expected}' but is missing`;
    } else if (actual !== expected) {
      return `${ref}: Attribute '${attrName}' must equal '${expected}' but is '${actual}'`;
    }
  }
  return null;
}

/**
 * Assert attributes on spans based on schema
 *
 * Attributes are resolved from span.data first, then from top-level span
 * fields (e.g. "description", "op", "status").
 *
 * Schema format:
 * - true: attribute must exist (any value)
 * - false: attribute must NOT exist
 * - RegExp: must match the regular expression
 * - string with '*': must match pattern (e.g., "gpt-4*" matches "gpt-4-turbo")
 * - string/number: must equal exact value
 * - function(span): dynamically compute the expected value from the span
 *
 * @param spans - List of spans to check (all spans must match schema)
 * @param schema - Attribute schema to validate against
 */
export function assertAttributes(
  spans: CapturedSpan[],
  schema: AttributeSchema,
): void {
  if (spans.length === 0) {
    throw new CheckError("No spans provided to assertAttributes");
  }

  const errors: string[] = [];
  const locations: ErrorLocation[] = [];

  for (const span of spans) {
    // Check each attribute in the schema
    for (const [attrName, expectedOrFn] of Object.entries(schema)) {
      const actual = resolveAttribute(span, attrName);

      // Resolve callable to get the expected value for this span
      const expected =
        typeof expectedOrFn === "function"
          ? expectedOrFn(span)
          : expectedOrFn;

      const errorMsg = validateAttribute(actual, expected, attrName, span.span_id);
      if (errorMsg) {
        errors.push(errorMsg);
        locations.push({
          spanId: span.span_id,
          attribute: attrName,
          message: errorMsg,
        });
      }
    }
  }

  if (errors.length > 0) {
    throw new CheckError(
      `Attribute validation failed:\n  ${errors.join("\n  ")}`,
      locations,
    );
  }
}

// =============================================================================
// Operation Name Patterns
// =============================================================================
// These patterns are derived from the Sentry backend logic that determines
// gen_ai.operation.type from gen_ai.operation.name.
//
// Reference (Rust code that determines operation type):
// - "agent" type: invoke_agent, create_agent, ai.run.*, ai.pipeline.*, ai.streamText, ai.generateText, ai.generateObject
// - "ai_client" type: *.doStream, *.doGenerate (the actual LLM API calls)
// - "tool" type: execute_tool, ai.toolCall.*
// - "handoff" type: handoff

/**
 * Pattern for agent operation names (gen_ai.operation.name)
 *
 * Matches:
 * - gen_ai.invoke_agent, invoke_agent
 * - gen_ai.create_agent, create_agent
 * - ai.run.generateText, ai.run.generateObject
 * - ai.pipeline.generate_text, ai.pipeline.generate_object, ai.pipeline.stream_text, ai.pipeline.stream_object
 * - ai.streamText (but NOT ai.streamText.doStream)
 * - ai.generateText (but NOT ai.generateText.doGenerate)
 * - ai.generateObject (but NOT ai.generateObject.doGenerate)
 */
export const AGENT_OPERATION_NAME_PATTERN =
  /^(gen_ai\.)?(invoke_agent|create_agent)$|^ai\.run\.(generateText|generateObject)$|^ai\.pipeline\.(generate_text|generate_object|stream_text|stream_object)$|^ai\.(streamText|generateText|generateObject)(?!\.do)/;

/**
 * Pattern for ai_client (chat/completion) operation names (gen_ai.operation.name)
 *
 * Matches:
 * - ai.streamText.doStream.*
 * - ai.generateText.doGenerate.*
 * - ai.generateObject.doGenerate.*
 * - chat, completion, generate (legacy)
 */
export const AI_CLIENT_OPERATION_NAME_PATTERN =
  /^ai\.(streamText\.doStream|generateText\.doGenerate|generateObject\.doGenerate)|^(gen_ai\.)?(chat|completion|generate)/;

/**
 * Pattern for tool operation names (gen_ai.operation.name)
 *
 * Matches:
 * - gen_ai.execute_tool, execute_tool
 * - ai.toolCall.*
 */
export const TOOL_OPERATION_NAME_PATTERN =
  /^(gen_ai\.)?(execute_tool|tool|tool_call)$|^ai\.toolCall/;

/**
 * Pattern for handoff operation names (gen_ai.operation.name)
 *
 * Matches:
 * - gen_ai.handoff, handoff
 */
export const HANDOFF_OPERATION_NAME_PATTERN = /^(gen_ai\.)?handoff$/;

/**
 * Pattern for embedding operation names (gen_ai.operation.name)
 *
 * Matches:
 * - gen_ai.embeddings, embeddings
 */
export const EMBEDDING_OPERATION_NAME_PATTERN = /^(gen_ai\.)?embeddings$/;

// =============================================================================
// Span Type Filtering Helpers
// =============================================================================

/**
 * Find agent spans by matching gen_ai.operation.name against AGENT_OPERATION_NAME_PATTERN
 */
export function findAgentSpans(spans: CapturedSpan[]): CapturedSpan[] {
  return spans.filter((s) => {
    const opName = s.data?.["gen_ai.operation.name"];
    return typeof opName === "string" && AGENT_OPERATION_NAME_PATTERN.test(opName);
  });
}

/**
 * Find ai_client/chat spans by matching gen_ai.operation.name against AI_CLIENT_OPERATION_NAME_PATTERN
 */
export function findChatSpans(spans: CapturedSpan[]): CapturedSpan[] {
  return spans.filter((s) => {
    const opName = s.data?.["gen_ai.operation.name"];
    return typeof opName === "string" && AI_CLIENT_OPERATION_NAME_PATTERN.test(opName);
  });
}

/**
 * Find tool spans by matching gen_ai.operation.name against TOOL_OPERATION_NAME_PATTERN
 */
export function findToolSpans(spans: CapturedSpan[]): CapturedSpan[] {
  return spans.filter((s) => {
    const opName = s.data?.["gen_ai.operation.name"];
    return typeof opName === "string" && TOOL_OPERATION_NAME_PATTERN.test(opName);
  });
}

/**
 * Find handoff spans by matching gen_ai.operation.name against HANDOFF_OPERATION_NAME_PATTERN
 */
export function findHandoffSpans(spans: CapturedSpan[]): CapturedSpan[] {
  return spans.filter((s) => {
    const opName = s.data?.["gen_ai.operation.name"];
    return typeof opName === "string" && HANDOFF_OPERATION_NAME_PATTERN.test(opName);
  });
}

/**
 * Find embedding spans by matching gen_ai.operation.name against EMBEDDING_OPERATION_NAME_PATTERN
 */
export function findEmbeddingSpans(spans: CapturedSpan[]): CapturedSpan[] {
  return spans.filter((s) => {
    const opName = s.data?.["gen_ai.operation.name"];
    return typeof opName === "string" && EMBEDDING_OPERATION_NAME_PATTERN.test(opName);
  });
}

// =============================================================================
// MCP Span Filtering Helpers
// =============================================================================

/**
 * Extract all MCP spans (op starts with "mcp.")
 */
export function extractMCPSpans(spans: CapturedSpan[]): CapturedSpan[] {
  return spans.filter((s) => s.op && s.op.startsWith("mcp."));
}

/**
 * Find MCP tool call spans (mcp.method.name === "tools/call")
 */
export function findMCPToolSpans(spans: CapturedSpan[]): CapturedSpan[] {
  return spans.filter((s) => {
    return s.op?.startsWith("mcp.") && s.data?.["mcp.method.name"] === "tools/call";
  });
}

/**
 * Find MCP resource read spans (mcp.method.name === "resources/read")
 */
export function findMCPResourceSpans(spans: CapturedSpan[]): CapturedSpan[] {
  return spans.filter((s) => {
    return s.op?.startsWith("mcp.") && s.data?.["mcp.method.name"] === "resources/read";
  });
}

/**
 * Find MCP prompt get spans (mcp.method.name === "prompts/get")
 */
export function findMCPPromptSpans(spans: CapturedSpan[]): CapturedSpan[] {
  return spans.filter((s) => {
    return s.op?.startsWith("mcp.") && s.data?.["mcp.method.name"] === "prompts/get";
  });
}

// =============================================================================
// Gen AI Tool Input Helpers
// =============================================================================

/**
 * Schema for tool input validation
 * - true: argument must exist (any value)
 * - false: argument must NOT exist
 * - string/number: argument must equal exact value
 */
export type ToolInputSchema = {
  [key: string]: boolean | string | number;
};

/**
 * Assert that a tool span has the expected input arguments
 *
 * Tool input is stored in gen_ai.tool.call.arguments (OTEL) or
 * gen_ai.tool.input (deprecated) as a JSON string.
 *
 * @param span - The tool span to check
 * @param schema - Expected arguments schema
 */
export function assertToolInput(
  span: CapturedSpan,
  schema: ToolInputSchema,
): void {
  const result = getAttributeWithFallback(
    span,
    "gen_ai.tool.call.arguments",
    "gen_ai.tool.input"
  );
  const toolInput = result.value;
  const attrName = result.usedAttribute ?? "gen_ai.tool.call.arguments";

  if (toolInput === undefined) {
    throw new CheckError(`Tool span is missing gen_ai.tool.call.arguments or gen_ai.tool.input attribute`, [
      { spanId: span.span_id, attribute: "gen_ai.tool.call.arguments", message: "Attribute is missing" },
    ]);
  }

  // Parse the tool input (it's usually a JSON string)
  let parsedInput: Record<string, unknown>;
  if (typeof toolInput === "string") {
    try {
      parsedInput = JSON.parse(toolInput);
    } catch {
      throw new CheckError(`Tool input is not valid JSON: ${toolInput}`, [
        { spanId: span.span_id, attribute: attrName, message: "Invalid JSON" },
      ]);
    }
  } else if (typeof toolInput === "object" && toolInput !== null) {
    parsedInput = toolInput as Record<string, unknown>;
  } else {
    throw new CheckError(`Unexpected tool input type: ${typeof toolInput}`, [
      { spanId: span.span_id, attribute: attrName, message: `Unexpected type: ${typeof toolInput}` },
    ]);
  }

  const errors: string[] = [];
  const locations: ErrorLocation[] = [];

  for (const [argName, expected] of Object.entries(schema)) {
    const actual = parsedInput[argName];

    if (expected === true) {
      if (actual === undefined) {
        const msg = `Tool argument '${argName}' must exist but is missing`;
        errors.push(msg);
        locations.push({ spanId: span.span_id, attribute: attrName, message: msg });
      }
    } else if (expected === false) {
      if (actual !== undefined) {
        const msg = `Tool argument '${argName}' must not exist but has value: ${actual}`;
        errors.push(msg);
        locations.push({ spanId: span.span_id, attribute: attrName, message: msg });
      }
    } else {
      if (actual === undefined) {
        const msg = `Tool argument '${argName}' must equal '${expected}' but is missing`;
        errors.push(msg);
        locations.push({ spanId: span.span_id, attribute: attrName, message: msg });
      } else {
        const actualStr = String(actual);
        const expectedStr = String(expected);
        if (actualStr !== expectedStr) {
          const msg = `Tool argument '${argName}' must equal '${expected}' but is '${actual}'`;
          errors.push(msg);
          locations.push({ spanId: span.span_id, attribute: attrName, message: msg });
        }
      }
    }
  }

  if (errors.length > 0) {
    throw new CheckError(`Tool input validation failed:\n  ${errors.join("\n  ")}`, locations);
  }
}

/**
 * Get tool input arguments from a tool span
 * Returns the parsed arguments object, or undefined if not available.
 * Tries gen_ai.tool.call.arguments (OTEL) first, falls back to gen_ai.tool.input (deprecated).
 */
export function getToolInput(
  span: CapturedSpan,
): Record<string, unknown> | undefined {
  const result = getAttributeWithFallback(
    span,
    "gen_ai.tool.call.arguments",
    "gen_ai.tool.input"
  );
  const toolInput = result.value;

  if (toolInput === undefined) {
    return undefined;
  }

  if (typeof toolInput === "string") {
    try {
      return JSON.parse(toolInput);
    } catch {
      return undefined;
    }
  }

  if (typeof toolInput === "object" && toolInput !== null) {
    return toolInput as Record<string, unknown>;
  }

  return undefined;
}
