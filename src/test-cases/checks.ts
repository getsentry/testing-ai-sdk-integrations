/**
 * Reusable check functions for test cases
 *
 * Each check function follows the signature:
 *   (spans: CapturedSpan[], config: FrameworkConfig, testDef: TestDefinition) => void
 *
 * Check functions can:
 * - Throw a CheckError with ErrorLocation[] to fail with precise span/attribute info
 * - Throw a regular Error to fail the check
 * - Call skip() or skipIf() to skip the check
 */

import { CapturedSpan, FrameworkConfig, TestDefinition, ErrorLocation } from "../types.js";
import { CheckError } from "../validator.js";
import {
  extractGenAISpans,
  findAgentSpans,
  findChatSpans,
  findToolSpans,
  findHandoffSpans,
  assertAttributes,
  checkTokenUsage,
  skip,
  skipIf,
  AGENT_OPERATION_NAME_PATTERN,
  AI_CLIENT_OPERATION_NAME_PATTERN,
  TOOL_OPERATION_NAME_PATTERN,
  HANDOFF_OPERATION_NAME_PATTERN,
} from "./utils.js";



/**
 * Check function signature
 */
export type CheckFunction = (
  spans: CapturedSpan[],
  config: FrameworkConfig,
  testDef: TestDefinition,
) => void | Promise<void>;

/**
 * Check definition with name and function
 */
export interface Check {
  name: string;
  fn: CheckFunction;
}

// =============================================================================
// Structure Checks
// =============================================================================

/**
 * Factory function to create a check that validates the number of AI spans
 *
 * @param expected - The expected number of AI spans, or an object with min/max bounds
 * @returns A Check object that validates the span count
 *
 * @example
 * // Exactly 1 span
 * checkAISpanCount(1)
 *
 * @example
 * // At least 1 span
 * checkAISpanCount({ min: 1 })
 *
 * @example
 * // Between 2 and 5 spans
 * checkAISpanCount({ min: 2, max: 5 })
 *
 * @example
 * // At most 3 spans
 * checkAISpanCount({ max: 3 })
 */
export function checkAISpanCount(
  expected: number | { min?: number; max?: number },
): Check {
  // Determine name based on expected value
  let name: string;
  if (typeof expected === "number") {
    name = `checkAISpanCount(${expected})`;
  } else if (expected.min !== undefined && expected.max !== undefined) {
    name = `checkAISpanCount(${expected.min}-${expected.max})`;
  } else if (expected.min !== undefined) {
    name = `checkAISpanCount(>=${expected.min})`;
  } else if (expected.max !== undefined) {
    name = `checkAISpanCount(<=${expected.max})`;
  } else {
    name = "checkAISpanCount";
  }

  return {
    name,
    fn: (spans) => {
      const aiSpans = extractGenAISpans(spans);

      if (typeof expected === "number") {
        if (aiSpans.length !== expected) {
          throw new CheckError(
            `Should have exactly ${expected} AI span(s) but found ${aiSpans.length}`,
          );
        }
      } else {
        const errors: string[] = [];
        if (expected.min !== undefined && aiSpans.length < expected.min) {
          errors.push(`Should have at least ${expected.min} AI span(s) but found ${aiSpans.length}`);
        }
        if (expected.max !== undefined && aiSpans.length > expected.max) {
          errors.push(`Should have at most ${expected.max} AI span(s) but found ${aiSpans.length}`);
        }
        if (errors.length > 0) {
          throw new CheckError(errors.join("\n"));
        }
      }
    },
  };
}

// =============================================================================
// Span Type Attribute Checks
// =============================================================================

/**
 * Check attributes on chat/completion spans (LLM API calls)
 *
 * Validates:
 * - description equals "<gen_ai.operation.name> <gen_ai.request.model>"
 * - gen_ai.operation.name matches AI_CLIENT_OPERATION_NAME_PATTERN
 * - gen_ai.request.model matches expected model
 * - gen_ai.request.messages exists
 * - gen_ai.response.model matches expected pattern
 * - gen_ai.response.text exists
 * - gen_ai.usage.input_tokens exists
 * - gen_ai.usage.output_tokens exists
 *
 * Fails if no chat spans are found.
 */
export const checkChatSpanAttributes: Check = {
  name: "checkChatSpanAttributes",
  fn: (spans, config, testDef) => {
    const chatSpans = findChatSpans(extractGenAISpans(spans));
    if (chatSpans.length === 0) {
      throw new CheckError("Should have at least one chat/completion span");
    }

    const requestModel =
      config.modelOverrides?.request || testDef.inputs[0]?.model || "gpt-*";
    const responseModel =
      config.modelOverrides?.response || `${requestModel.replace("*", "")}*`;
      

    assertAttributes(chatSpans, {
      "description": (span) =>
        `${span.data?.["gen_ai.operation.name"]} ${span.data?.["gen_ai.request.model"]}`,
      "gen_ai.operation.name": AI_CLIENT_OPERATION_NAME_PATTERN,
      "gen_ai.request.model": requestModel,
      "gen_ai.request.messages": true,
      "gen_ai.response.model": responseModel,
      "gen_ai.response.text": true,
      "gen_ai.usage.input_tokens": true,
      "gen_ai.usage.output_tokens": true,
    });
  },
};

/**
 * Check attributes on invoke_agent spans (agent invocations)
 *
 * Validates:
 * - description equals "<gen_ai.operation.name> <gen_ai.agent.name>"
 * - gen_ai.operation.name matches AGENT_OPERATION_NAME_PATTERN
 * - gen_ai.agent.name exists
 *
 * Fails if no agent spans are found.
 */
export const checkAgentSpanAttributes: Check = {
  name: "checkAgentSpanAttributes",
  fn: (spans) => {
    const agentSpans = findAgentSpans(extractGenAISpans(spans));
    if (agentSpans.length === 0) {
      throw new CheckError("Should have at least one agent span");
    }

    assertAttributes(agentSpans, {
      "description": (span) =>
        `${span.data?.["gen_ai.operation.name"]} ${span.data?.["gen_ai.request.model"]}`,
      "gen_ai.operation.name": AGENT_OPERATION_NAME_PATTERN,
      "gen_ai.agent.name": true,
    });
  },
};

/**
 * Check attributes on tool execution spans
 *
 * Validates:
 * - description equals "<gen_ai.operation.name> <gen_ai.tool.name>"
 * - gen_ai.operation.name matches TOOL_OPERATION_NAME_PATTERN
 * - gen_ai.tool.type exists
 * - gen_ai.tool.name exists
 * - gen_ai.tool.description exists
 *
 * Fails if no tool spans are found.
 */
export const checkToolSpanAttributes: Check = {
  name: "checkToolSpanAttributes",
  fn: (spans) => {
    const toolSpans = findToolSpans(extractGenAISpans(spans));
    if (toolSpans.length === 0) {
      throw new CheckError("Should have at least one tool span");
    }

    assertAttributes(toolSpans, {
      "description": (span) =>
        `${span.data?.["gen_ai.operation.name"]} ${span.data?.["gen_ai.tool.name"]}`,
      "gen_ai.operation.name": TOOL_OPERATION_NAME_PATTERN,
      "gen_ai.tool.type": true,
      "gen_ai.tool.name": true,
      "gen_ai.tool.description": true,
    });
  },
};

/**
 * Expected tool call definition for validation
 */
export interface ExpectedToolCall {
  /** Tool name to match */
  name: string;
  /** Expected tool type (e.g., "function") */
  type?: string;
  /** Expected tool description */
  description?: string;
  /** Expected input arguments (parsed from gen_ai.tool.input JSON) */
  input?: Record<string, unknown>;
  /** Expected output value */
  output?: unknown;
}

/**
 * Factory function to create a check that validates specific tool calls
 *
 * @param expectedTools - Array of expected tool calls to validate
 * @returns A Check object that validates the tool calls
 *
 * @example
 * // Check a single tool call
 * checkToolCalls([{
 *   name: "add",
 *   type: "function",
 *   description: "Add two numbers together",
 *   input: { a: 4, b: 7 },
 *   output: 11,
 * }])
 *
 * @example
 * // Check multiple tool calls
 * checkToolCalls([
 *   { name: "search", input: { query: "weather" } },
 *   { name: "format", input: { data: "..." } },
 * ])
 */
export function checkToolCalls(expectedTools: ExpectedToolCall[]): Check {
  const toolNames = expectedTools.map((t) => t.name).join(", ");
  return {
    name: `checkToolCalls(${toolNames})`,
    fn: (spans) => {
      const toolSpans = findToolSpans(extractGenAISpans(spans));
      if (toolSpans.length < expectedTools.length) {
        throw new CheckError(
          `Should have at least ${expectedTools.length} tool span(s) but found ${toolSpans.length}`,
        );
      }

      const errors: string[] = [];
      const locations: ErrorLocation[] = [];

      for (const expected of expectedTools) {
        // Find the tool span matching this expected tool
        const toolSpan = toolSpans.find(
          (s) => s.data?.["gen_ai.tool.name"] === expected.name,
        );
        if (!toolSpan) {
          errors.push(`Should have a tool span for "${expected.name}"`);
          continue;
        }


        // Validate type if specified
        if (expected.type !== undefined) {
          const actual = toolSpan.data?.["gen_ai.tool.type"];
          if (actual !== expected.type) {
            const msg = `Tool "${expected.name}" should have type "${expected.type}" but has "${actual}"`;
            errors.push(msg);
            locations.push({ spanId: toolSpan.span_id, attribute: "gen_ai.tool.type", message: msg });
          }
        }

        // Validate description if specified
        if (expected.description !== undefined) {
          const actual = toolSpan.data?.["gen_ai.tool.description"];
          if (actual !== expected.description) {
            const msg = `Tool "${expected.name}" should have description "${expected.description}" but has "${actual}"`;
            errors.push(msg);
            locations.push({ spanId: toolSpan.span_id, attribute: "gen_ai.tool.description", message: msg });
          }
        }

        // Validate input if specified
        if (expected.input !== undefined) {
          const inputRaw = toolSpan.data?.["gen_ai.tool.input"];
          if (inputRaw === undefined || inputRaw === null) {
            const msg = `Tool "${expected.name}" should have gen_ai.tool.input`;
            errors.push(msg);
            locations.push({ spanId: toolSpan.span_id, attribute: "gen_ai.tool.input", message: msg });
          } else {
            // Parse input if it's a JSON string
            let input: Record<string, unknown>;
            if (typeof inputRaw === "string") {
              try {
                input = JSON.parse(inputRaw);
              } catch {
                const msg = `Tool "${expected.name}" has invalid JSON in gen_ai.tool.input: ${inputRaw}`;
                errors.push(msg);
                locations.push({ spanId: toolSpan.span_id, attribute: "gen_ai.tool.input", message: msg });
                continue;
              }
            } else {
              input = inputRaw as Record<string, unknown>;
            }

            // Check each expected input field
            for (const [key, value] of Object.entries(expected.input)) {
              if (input[key] === undefined || input[key] === null) {
                const msg = `Tool "${expected.name}" input should have "${key}"`;
                errors.push(msg);
                locations.push({ spanId: toolSpan.span_id, attribute: "gen_ai.tool.input", message: msg });
              } else if (value !== undefined) {
                const actualValue = input[key];
                let matches = false;
                if (typeof value === "number" && typeof actualValue === "string") {
                  matches = Number(actualValue) === value;
                } else {
                  matches = JSON.stringify(actualValue) === JSON.stringify(value);
                }
                if (!matches) {
                  const msg = `Tool "${expected.name}" input.${key} should equal ${JSON.stringify(value)} but is ${JSON.stringify(actualValue)}`;
                  errors.push(msg);
                  locations.push({ spanId: toolSpan.span_id, attribute: "gen_ai.tool.input", message: msg });
                }
              }
            }
          }
        }

        // Validate output if specified
        if (expected.output !== undefined) {
          const outputRaw = toolSpan.data?.["gen_ai.tool.output"];
          if (outputRaw === undefined || outputRaw === null) {
            const msg = `Tool "${expected.name}" should have gen_ai.tool.output`;
            errors.push(msg);
            locations.push({ spanId: toolSpan.span_id, attribute: "gen_ai.tool.output", message: msg });
          } else {
            let output: unknown;
            if (typeof outputRaw === "string") {
              try { output = JSON.parse(outputRaw); } catch { output = outputRaw; }
            } else {
              output = outputRaw;
            }

            if (JSON.stringify(output) !== JSON.stringify(expected.output)) {
              const msg = `Tool "${expected.name}" output should equal ${JSON.stringify(expected.output)} but is ${JSON.stringify(output)}`;
              errors.push(msg);
              locations.push({ spanId: toolSpan.span_id, attribute: "gen_ai.tool.output", message: msg });
            }
          }
        }
      }

      if (errors.length > 0) {
        throw new CheckError(errors.join("\n"), locations);
      }
    },
  };
}

/**
 * Check that gen_ai.request.available_tools matches the tools defined in the test
 *
 * Validates that chat spans contain available_tools that match the agent's tool definitions.
 * Checks tool name, description, and parameter schema.
 */
export const checkAvailableTools: Check = {
  name: "checkAvailableTools",
  fn: (spans, config, testDef) => {
    const chatSpans = findChatSpans(extractGenAISpans(spans));
    if (chatSpans.length === 0) {
      throw new CheckError("Should have at least one chat span");
    }

    const definedTools = testDef.agent?.tools || [];
    if (definedTools.length === 0) {
      throw new CheckError("Test should define at least one tool");
    }

    // Find a chat span with available_tools
    const spanWithTools = chatSpans.find(
      (s) => s.data?.["gen_ai.request.available_tools"] !== undefined,
    );
    if (!spanWithTools) {
      throw new CheckError("Should have a chat span with gen_ai.request.available_tools", chatSpans.map((s) => ({
        spanId: s.span_id,
        attribute: "gen_ai.request.available_tools",
        message: "Attribute is missing",
      })));
    }

    const availableToolsRaw =
      spanWithTools.data?.["gen_ai.request.available_tools"];

    // Parse if JSON string
    let availableTools: Array<Record<string, unknown>>;
    if (typeof availableToolsRaw === "string") {
      try {
        availableTools = JSON.parse(availableToolsRaw);
      } catch {
        throw new CheckError(
          `Invalid JSON in gen_ai.request.available_tools: ${availableToolsRaw}`,
          [{ spanId: spanWithTools.span_id, attribute: "gen_ai.request.available_tools", message: "Invalid JSON" }],
        );
      }
    } else {
      availableTools = availableToolsRaw as Array<Record<string, unknown>>;
    }

    if (!Array.isArray(availableTools)) {
      throw new CheckError("gen_ai.request.available_tools should be an array", [
        { spanId: spanWithTools.span_id, attribute: "gen_ai.request.available_tools", message: "Not an array" },
      ]);
    }

    const errors: string[] = [];
    const locations: ErrorLocation[] = [];

    // Check each defined tool exists in available_tools
    for (const definedTool of definedTools) {
      const foundTool = availableTools.find((t) => {
        const toolName =
          t.name || (t.function as Record<string, unknown>)?.name;
        return toolName === definedTool.name;
      });

      if (!foundTool) {
        const msg = `Available tools should include "${definedTool.name}"`;
        errors.push(msg);
        locations.push({ spanId: spanWithTools.span_id, attribute: "gen_ai.request.available_tools", message: msg });
        continue;
      }

      // Check description if present
      if (definedTool.description) {
        const toolDesc =
          foundTool.description ||
          (foundTool.function as Record<string, unknown>)?.description;
        if (toolDesc !== definedTool.description) {
          const msg = `Tool "${definedTool.name}" should have description "${definedTool.description}" but has "${toolDesc}"`;
          errors.push(msg);
          locations.push({ spanId: spanWithTools.span_id, attribute: "gen_ai.request.available_tools", message: msg });
        }
      }
    }

    // Check count matches
    if (availableTools.length !== definedTools.length) {
      const msg = `Should have ${definedTools.length} available tool(s) but found ${availableTools.length}`;
      errors.push(msg);
      locations.push({ spanId: spanWithTools.span_id, attribute: "gen_ai.request.available_tools", message: msg });
    }

    if (errors.length > 0) {
      throw new CheckError(errors.join("\n"), locations);
    }
  },
};

/**
 * Expected tool call in gen_ai.response.tool_calls
 */
export interface ExpectedResponseToolCall {
  /** Tool name to match */
  name: string;
  /** Expected arguments (id fields are ignored) */
  arguments: Record<string, unknown>;
}

/**
 * Factory function to check gen_ai.response.tool_calls on chat spans
 *
 * Validates that a chat span contains tool_calls with the expected tool names
 * and arguments. Tool call IDs are ignored since they're generated dynamically.
 *
 * @param expectedToolCalls - Array of expected tool calls
 * @returns A Check object that validates the response tool calls
 *
 * @example
 * checkResponseToolCalls([
 *   { name: "add", arguments: { a: 3, b: 5 } },
 *   { name: "multiply", arguments: { a: 8, b: 4 } },
 * ])
 */
export function checkResponseToolCalls(
  expectedToolCalls: ExpectedResponseToolCall[],
): Check {
  const toolNames = expectedToolCalls.map((t) => t.name).join(", ");
  return {
    name: `checkResponseToolCalls(${toolNames})`,
    fn: (spans) => {
      const chatSpans = findChatSpans(extractGenAISpans(spans));
      if (chatSpans.length === 0) {
        throw new CheckError("Should have at least one chat span");
      }

      const errors: string[] = [];
      const locations: ErrorLocation[] = [];

      // Collect all tool_calls from all chat spans, tracking which span they came from
      const allToolCalls: Array<{ data: Record<string, unknown>; sourceSpan: CapturedSpan }> = [];

      for (const span of chatSpans) {
        const toolCallsRaw = span.data?.["gen_ai.response.tool_calls"];
        if (toolCallsRaw === undefined) continue;

        let toolCalls: Array<Record<string, unknown>>;
        if (typeof toolCallsRaw === "string") {
          try {
            toolCalls = JSON.parse(toolCallsRaw);
          } catch {
            throw new CheckError(
              `Invalid JSON in gen_ai.response.tool_calls: ${toolCallsRaw}`,
              [{ spanId: span.span_id, attribute: "gen_ai.response.tool_calls", message: "Invalid JSON" }],
            );
          }
        } else {
          toolCalls = toolCallsRaw as Array<Record<string, unknown>>;
        }

        if (Array.isArray(toolCalls)) {
          allToolCalls.push(...toolCalls.map((tc) => ({ data: tc, sourceSpan: span })));
        }
      }

      if (allToolCalls.length < expectedToolCalls.length) {
        const msg = `Should have at least ${expectedToolCalls.length} tool call(s) in response but found ${allToolCalls.length}`;
        errors.push(msg);
        // Point to spans that have (or should have) tool_calls
        for (const span of chatSpans) {
          locations.push({
            spanId: span.span_id,
            attribute: "gen_ai.response.tool_calls",
            message: msg,
          });
        }
      }

      // Check each expected tool call
      for (const expected of expectedToolCalls) {
        const foundEntry = allToolCalls.find((entry) => {
          const tcName =
            entry.data.name || (entry.data.function as Record<string, unknown>)?.name;
          return tcName === expected.name;
        });

        if (!foundEntry) {
          const msg = `Response should include tool call for "${expected.name}"`;
          errors.push(msg);
          continue;
        }

        const foundCall = foundEntry.data;

        // Get arguments
        let actualArgs: Record<string, unknown>;
        const argsRaw =
          foundCall.arguments ||
          (foundCall.function as Record<string, unknown>)?.arguments;

        if (typeof argsRaw === "string") {
          try {
            actualArgs = JSON.parse(argsRaw);
          } catch {
            const msg = `Invalid JSON in tool call arguments for "${expected.name}": ${argsRaw}`;
            errors.push(msg);
            locations.push({ spanId: foundEntry.sourceSpan.span_id, attribute: "gen_ai.response.tool_calls", message: msg });
            continue;
          }
        } else {
          actualArgs = (argsRaw as Record<string, unknown>) || {};
        }

        // Check each expected argument
        for (const [key, value] of Object.entries(expected.arguments)) {
          if (actualArgs[key] === undefined || actualArgs[key] === null) {
            const msg = `Tool call "${expected.name}" should have argument "${key}"`;
            errors.push(msg);
            locations.push({ spanId: foundEntry.sourceSpan.span_id, attribute: "gen_ai.response.tool_calls", message: msg });
          } else {
            const actualValue = actualArgs[key];
            let matches = false;
            if (typeof value === "number" && typeof actualValue === "string") {
              matches = Number(actualValue) === value;
            } else {
              matches = JSON.stringify(actualValue) === JSON.stringify(value);
            }
            if (!matches) {
              const msg = `Tool call "${expected.name}" argument "${key}" should equal ${JSON.stringify(value)} but is ${JSON.stringify(actualValue)}`;
              errors.push(msg);
              locations.push({ spanId: foundEntry.sourceSpan.span_id, attribute: "gen_ai.response.tool_calls", message: msg });
            }
          }
        }
      }

      if (errors.length > 0) {
        throw new CheckError(errors.join("\n"), locations);
      }
    },
  };
}

// =============================================================================
// Message Schema Checks
// =============================================================================

/**
 * Valid roles for messages in gen_ai.input.messages
 */
const VALID_MESSAGE_ROLES = ["user", "assistant", "tool", "system"] as const;

/**
 * Valid part types for message parts
 */
const VALID_PART_TYPES = [
  "text",
  "tool_call",
  "tool_call_response",
  "image",
] as const;

/**
 * Check that gen_ai.input.messages on chat spans follows the expected schema
 *
 * Schema (from Sentry conventions):
 * - Must be a stringified array of message objects
 * - Each message must have a "role" field: "user", "assistant", "tool", or "system"
 * - Each message must have a "parts" array (new format) or "content" field (legacy)
 * - Parts can have types: "text", "tool_call", "tool_call_response", "image"
 *
 * This check validates schema structure, not actual content.
 */
export const checkInputMessagesSchema: Check = {
  name: "checkInputMessagesSchema",
  fn: (spans) => {
    const chatSpans = findChatSpans(extractGenAISpans(spans));
    const agentSpans = findAgentSpans(extractGenAISpans(spans));
    const spansToCheck = [...chatSpans, ...agentSpans];

    if (spansToCheck.length === 0) {
      throw new CheckError("Should have at least one chat or agent span");
    }

    const errors: string[] = [];
    const locations: ErrorLocation[] = [];
    let foundMessages = false;

    for (const span of spansToCheck) {
      // Check both new format (gen_ai.input.messages) and legacy (gen_ai.request.messages)
      const messagesAttr = span.data?.["gen_ai.input.messages"] !== undefined
        ? "gen_ai.input.messages"
        : span.data?.["gen_ai.request.messages"] !== undefined
          ? "gen_ai.request.messages"
          : undefined;
      const messagesRaw = messagesAttr ? span.data?.[messagesAttr] : undefined;

      if (messagesRaw === undefined) continue;
      foundMessages = true;

      // Parse if JSON string
      let messages: unknown[];
      if (typeof messagesRaw === "string") {
        try {
          messages = JSON.parse(messagesRaw);
        } catch {
          const msg = `Invalid JSON in ${messagesAttr}: ${String(messagesRaw).substring(0, 100)}...`;
          errors.push(msg);
          locations.push({ spanId: span.span_id, attribute: messagesAttr, message: msg });
          continue;
        }
      } else {
        messages = messagesRaw as unknown[];
      }

      if (!Array.isArray(messages)) {
        const msg = `${messagesAttr} should be an array`;
        errors.push(msg);
        locations.push({ spanId: span.span_id, attribute: messagesAttr, message: msg });
        continue;
      }

      if (messages.length === 0) {
        const msg = `${messagesAttr} should not be empty`;
        errors.push(msg);
        locations.push({ spanId: span.span_id, attribute: messagesAttr, message: msg });
        continue;
      }

      // Validate each message
      for (let i = 0; i < messages.length; i++) {
        const msgObj = messages[i] as Record<string, unknown>;
        const msgPath = `messages[${i}]`;

        if (typeof msgObj !== "object" || msgObj === null) {
          const msg = `${msgPath} should be an object`;
          errors.push(msg);
          locations.push({ spanId: span.span_id, attribute: messagesAttr, message: msg });
          continue;
        }

        // Check role
        if (msgObj.role === undefined || msgObj.role === null) {
          const msg = `${msgPath} should have a role field`;
          errors.push(msg);
          locations.push({ spanId: span.span_id, attribute: messagesAttr, message: msg });
        } else if (
          !VALID_MESSAGE_ROLES.includes(
            msgObj.role as (typeof VALID_MESSAGE_ROLES)[number],
          )
        ) {
          const msg = `${msgPath}.role should be one of: ${VALID_MESSAGE_ROLES.join(", ")} (got: ${msgObj.role})`;
          errors.push(msg);
          locations.push({ spanId: span.span_id, attribute: messagesAttr, message: msg });
        }

        // Check for content (parts array or content string/array)
        const hasParts = msgObj.parts !== undefined;
        const hasContent = msgObj.content !== undefined;

        if (!hasParts && !hasContent) {
          const msg = `${msgPath} should have either "parts" or "content" field`;
          errors.push(msg);
          locations.push({ spanId: span.span_id, attribute: messagesAttr, message: msg });
        }

        // Validate parts array if present
        if (hasParts) {
          if (!Array.isArray(msgObj.parts)) {
            const msg = `${msgPath}.parts should be an array`;
            errors.push(msg);
            locations.push({ spanId: span.span_id, attribute: messagesAttr, message: msg });
          } else {
            const parts = msgObj.parts as Array<Record<string, unknown>>;
            for (let j = 0; j < parts.length; j++) {
              const part = parts[j];
              const partPath = `${msgPath}.parts[${j}]`;

              if (typeof part !== "object" || part === null) {
                const msg = `${partPath} should be an object`;
                errors.push(msg);
                locations.push({ spanId: span.span_id, attribute: messagesAttr, message: msg });
                continue;
              }

              if (part.type !== undefined) {
                if (
                  !VALID_PART_TYPES.includes(
                    part.type as (typeof VALID_PART_TYPES)[number],
                  )
                ) {
                  const msg = `${partPath}.type should be one of: ${VALID_PART_TYPES.join(", ")} (got: ${part.type})`;
                  errors.push(msg);
                  locations.push({ spanId: span.span_id, attribute: messagesAttr, message: msg });
                }

                if (part.type === "text") {
                  if (part.text === undefined && part.content === undefined) {
                    const msg = `${partPath} with type "text" should have "text" or "content" field`;
                    errors.push(msg);
                    locations.push({ spanId: span.span_id, attribute: messagesAttr, message: msg });
                  }
                } else if (part.type === "tool_call") {
                  if (part.name === undefined || part.name === null) {
                    const msg = `${partPath} with type "tool_call" should have "name" field`;
                    errors.push(msg);
                    locations.push({ spanId: span.span_id, attribute: messagesAttr, message: msg });
                  }
                } else if (part.type === "tool_call_response") {
                  if (part.id === undefined && part.tool_call_id === undefined) {
                    const msg = `${partPath} with type "tool_call_response" should have "id" or "tool_call_id" field`;
                    errors.push(msg);
                    locations.push({ spanId: span.span_id, attribute: messagesAttr, message: msg });
                  }
                }
              }
            }
          }
        }

        // Validate content if present (can be string or array)
        if (hasContent && !hasParts) {
          const content = msgObj.content;
          const isValidContent =
            typeof content === "string" ||
            Array.isArray(content) ||
            (typeof content === "object" && content !== null);

          if (!isValidContent) {
            const msg = `${msgPath}.content should be a string, array, or object`;
            errors.push(msg);
            locations.push({ spanId: span.span_id, attribute: messagesAttr, message: msg });
          }
        }
      }
    }

    if (!foundMessages) {
      const msg = "Should have at least one span with gen_ai.input.messages or gen_ai.request.messages";
      errors.push(msg);
      // Point to all checked spans
      for (const span of spansToCheck) {
        locations.push({
          spanId: span.span_id,
          attribute: "gen_ai.input.messages",
          message: msg,
        });
      }
    }

    if (errors.length > 0) {
      throw new CheckError(errors.join("\n"), locations);
    }
  },
};

/**
 * Check that binary content (images) is redacted in gen_ai.request.messages
 *
 * Sentry SDKs should replace binary data (base64 images, etc.) with "[Blob substitute]"
 * to avoid capturing large binary payloads in span data.
 *
 * This check validates that:
 * - Messages attribute exists
 * - Messages contain "[Blob substitute]" marker (indicating redaction occurred)
 * - No raw base64 data is present (would indicate redaction failed)
 */
export const checkBinaryRedaction: Check = {
  name: "checkBinaryRedaction",
  fn: (spans) => {
    const chatSpans = findChatSpans(extractGenAISpans(spans));
    const agentSpans = findAgentSpans(extractGenAISpans(spans));
    const spansToCheck = [...chatSpans, ...agentSpans];

    if (spansToCheck.length === 0) {
      throw new CheckError("Should have at least one chat or agent span");
    }

    const errors: string[] = [];
    const locations: ErrorLocation[] = [];
    let foundMessages = false;
    let foundRedaction = false;

    for (const span of spansToCheck) {
      const messagesAttr = span.data?.["gen_ai.input.messages"] !== undefined
        ? "gen_ai.input.messages"
        : span.data?.["gen_ai.request.messages"] !== undefined
          ? "gen_ai.request.messages"
          : undefined;
      const messagesRaw = messagesAttr ? span.data?.[messagesAttr] : undefined;

      if (messagesRaw === undefined) continue;
      foundMessages = true;

      const messagesStr =
        typeof messagesRaw === "string"
          ? messagesRaw
          : JSON.stringify(messagesRaw);

      if (messagesStr.includes("[Blob substitute]")) {
        foundRedaction = true;
      }

      const base64Pattern = /[A-Za-z0-9+/]{100,}={0,2}/;
      if (base64Pattern.test(messagesStr)) {
        const msg = "Messages should not contain raw base64 data (should be redacted)";
        errors.push(msg);
        locations.push({ spanId: span.span_id, attribute: messagesAttr, message: msg });
      }
    }

    if (!foundMessages) {
      const msg = "Should have at least one span with messages attribute";
      errors.push(msg);
      for (const span of spansToCheck) {
        locations.push({
          spanId: span.span_id,
          attribute: "gen_ai.input.messages",
          message: msg,
        });
      }
    }

    if (!foundRedaction && foundMessages) {
      const msg = "Messages should contain '[Blob substitute]' marker indicating binary content was redacted";
      errors.push(msg);
      for (const span of spansToCheck) {
        const attr = span.data?.["gen_ai.input.messages"] !== undefined
          ? "gen_ai.input.messages"
          : "gen_ai.request.messages";
        if (span.data?.[attr] !== undefined) {
          locations.push({
            spanId: span.span_id,
            attribute: attr,
            message: msg,
          });
        }
      }
    }

    if (errors.length > 0) {
      throw new CheckError(errors.join("\n"), locations);
    }
  },
};

/**
 * Check attributes on handoff spans (agent-to-agent handoffs)
 *
 * Validates:
 * - gen_ai.operation.name matches HANDOFF_OPERATION_NAME_PATTERN
 *
 * Fails if no handoff spans are found.
 */
export const checkHandoffSpanAttributes: Check = {
  name: "checkHandoffSpanAttributes",
  fn: (spans) => {
    const handoffSpans = findHandoffSpans(extractGenAISpans(spans));
    if (handoffSpans.length === 0) {
      throw new CheckError("Should have at least one handoff span");
    }

    assertAttributes(handoffSpans, {
      "gen_ai.operation.name": HANDOFF_OPERATION_NAME_PATTERN,
    });
  },
};

// =============================================================================
// Token Checks
// =============================================================================

/**
 * Check token usage on invoke_agent and ai_client spans
 * Tool spans don't have token usage attributes
 */
export const checkValidTokenUsage: Check = {
  name: "checkValidTokenUsage",
  fn: (spans) => {
    const aiSpans = extractGenAISpans(spans);
    skipIf(aiSpans.length === 0, "No AI spans captured");

    // Only check token usage on spans that should have it (not tool spans)
    const tokenSpans = aiSpans.filter(
      (s) =>
        s.op?.match(/^gen_ai\.(invoke_agent|chat|completion|generate)/) ||
        s.data?.["gen_ai.usage.input_tokens"] !== undefined,
    );
    skipIf(tokenSpans.length === 0, "No spans with token usage");

    for (const span of tokenSpans) {
      checkTokenUsage(span, { validateSum: true });
    }
  },
};

/**
 * Check that input tokens cached is valid when present
 */
export const checkInputTokensCached: Check = {
  name: "checkInputTokensCached",
  fn: (spans) => {
    const aiSpans = extractGenAISpans(spans).filter(
      (span) => span.data?.["gen_ai.usage.input_tokens.cached"] !== undefined,
    );
    skipIf(
      aiSpans.length === 0,
      "No AI spans with input_tokens.cached attribute",
    );

    const locations: ErrorLocation[] = [];
    for (const span of aiSpans) {
      const cached = span.data?.["gen_ai.usage.input_tokens.cached"];
      const input = span.data?.["gen_ai.usage.input_tokens"];
      if (typeof cached === "number" && typeof input === "number" && cached > input) {
        locations.push({
          spanId: span.span_id,
          attribute: "gen_ai.usage.input_tokens.cached",
          message: `cached tokens (${cached}) > input tokens (${input})`,
        });
      }
    }
    if (locations.length > 0) {
      throw new CheckError(
        `Cached tokens exceeds input tokens:\n  ${locations.map((l) => l.message).join("\n  ")}`,
        locations,
      );
    }
  },
};

/**
 * Check that output tokens reasoning is valid when present
 */
export const checkOutputTokensReasoning: Check = {
  name: "checkOutputTokensReasoning",
  fn: (spans) => {
    const aiSpans = extractGenAISpans(spans).filter(
      (span) =>
        span.data?.["gen_ai.usage.output_tokens.reasoning"] !== undefined,
    );
    skipIf(
      aiSpans.length === 0,
      "No AI spans with output_tokens.reasoning attribute",
    );

    const locations: ErrorLocation[] = [];
    for (const span of aiSpans) {
      const reasoning = span.data?.["gen_ai.usage.output_tokens.reasoning"];
      const output = span.data?.["gen_ai.usage.output_tokens"];
      if (typeof reasoning === "number" && typeof output === "number" && reasoning > output) {
        locations.push({
          spanId: span.span_id,
          attribute: "gen_ai.usage.output_tokens.reasoning",
          message: `reasoning tokens (${reasoning}) > output tokens (${output})`,
        });
      }
    }
    if (locations.length > 0) {
      throw new CheckError(
        `Reasoning tokens exceeds output tokens:\n  ${locations.map((l) => l.message).join("\n  ")}`,
        locations,
      );
    }
  },
};

// =============================================================================
// Message Trimming Checks
// =============================================================================

/**
 * Check that long messages are trimmed in span data
 */
export const checkMessageTrimming: Check = {
  name: "checkMessageTrimming",
  fn: (spans) => {
    const aiSpans = extractGenAISpans(spans);
    skipIf(aiSpans.length === 0, "No AI spans captured");

    let foundTrimmedMessage = false;
    const maxExpectedSize = 15000;
    const errors: string[] = [];
    const locations: ErrorLocation[] = [];

    for (const span of aiSpans) {
      const messageValue = span.data?.["gen_ai.request.messages"];
      if (messageValue !== undefined) {
        const messageStr =
          typeof messageValue === "string"
            ? messageValue
            : JSON.stringify(messageValue);

        if (messageStr.length >= maxExpectedSize) {
          const msg = `Message should be trimmed (length ${messageStr.length} >= ${maxExpectedSize})`;
          errors.push(msg);
          locations.push({
            spanId: span.span_id,
            attribute: "gen_ai.request.messages",
            message: msg,
          });
        }

        foundTrimmedMessage = true;
      }
    }

    skipIf(!foundTrimmedMessage, "No gen_ai.request.messages attribute found");

    if (errors.length > 0) {
      throw new CheckError(errors.join("\n"), locations);
    }
  },
};

/**
 * Check that trimming metadata is present and the truncation constraint is satisfied
 *
 * Validates:
 * - gen_ai.input.messages.original_length (or gen_ai.request.messages.original_length) exists
 * - The messages text content length is less than original_length (actual truncation occurred)
 */
export const checkTrimmingMetadata: Check = {
  name: "checkTrimmingMetadata",
  fn: (spans) => {
    const aiSpans = extractGenAISpans(spans);
    skipIf(aiSpans.length === 0, "No AI spans captured");

    let foundMetadata = false;
    const errors: string[] = [];
    const locations: ErrorLocation[] = [];

    for (const span of aiSpans) {
      // Check both new and legacy attribute names
      const originalLengthAttr = span.data?.["gen_ai.input.messages.original_length"] !== undefined
        ? "gen_ai.input.messages.original_length"
        : span.data?.["gen_ai.request.messages.original_length"] !== undefined
          ? "gen_ai.request.messages.original_length"
          : undefined;
      const originalLength = originalLengthAttr ? span.data?.[originalLengthAttr] : undefined;

      if (originalLength === undefined) continue;

      foundMetadata = true;

      if (typeof originalLength !== "number") {
        const msg = `original_length should be a number but is ${typeof originalLength}`;
        errors.push(msg);
        locations.push({ spanId: span.span_id, attribute: originalLengthAttr, message: msg });
        continue;
      }
      if (originalLength <= 0) {
        const msg = `original_length should be > 0 but is ${originalLength}`;
        errors.push(msg);
        locations.push({ spanId: span.span_id, attribute: originalLengthAttr, message: msg });
        continue;
      }

      // Get the messages to validate content length constraint
      const messagesRaw =
        span.data?.["gen_ai.input.messages"] ??
        span.data?.["gen_ai.request.messages"];
      const messagesAttr = span.data?.["gen_ai.input.messages"] !== undefined
        ? "gen_ai.input.messages"
        : "gen_ai.request.messages";

      if (messagesRaw !== undefined) {
        const messagesStr =
          typeof messagesRaw === "string"
            ? messagesRaw
            : JSON.stringify(messagesRaw);

        if (messagesStr.length >= originalLength) {
          const msg = `Truncated messages content length (${messagesStr.length}) should be less than original_length (${originalLength})`;
          errors.push(msg);
          locations.push({ spanId: span.span_id, attribute: messagesAttr, message: msg });
        }
      }
    }

    if (!foundMetadata) {
      const msg = "Should have at least one span with original_length metadata";
      errors.push(msg);
      for (const span of aiSpans) {
        locations.push({
          spanId: span.span_id,
          attribute: "gen_ai.input.messages.original_length",
          message: msg,
        });
      }
    }

    if (errors.length > 0) {
      throw new CheckError(errors.join("\n"), locations);
    }
  },
};

// =============================================================================
// Agent-specific Checks
// =============================================================================

/**
 * Check agent span hierarchy and gen_ai.agent.name propagation
 *
 * This check validates:
 * 1. Agent spans (invoke_agent) exist and have gen_ai.agent.name
 * 2. All child spans (ai_client, tool, handoff) inherit gen_ai.agent.name from their ancestor agent
 * 3. No orphan gen_ai spans exist outside agent hierarchies
 */
export const checkAgentHierarchy: Check = {
  name: "checkAgentHierarchy",
  fn: (spans, config, testDef) => {
    const aiSpans = extractGenAISpans(spans);
    if (aiSpans.length === 0) {
      throw new CheckError("Should have at least one AI span");
    }

    const errors: string[] = [];
    const locations: ErrorLocation[] = [];

    // Build a map of span_id -> span for quick lookup (include all spans, not just gen_ai)
    const spanMap = new Map<string, CapturedSpan>();
    for (const span of spans) {
      spanMap.set(span.span_id, span);
    }

    // Find agent spans (invoke_agent pattern)
    const agentSpans = aiSpans.filter(
      (s) =>
        s.op?.match(/^gen_ai\.(invoke_agent|agent\.run|agent)$/) ||
        s.data?.["gen_ai.agent.name"] !== undefined,
    );

    if (agentSpans.length === 0) {
      throw new CheckError("Should have at least one agent span");
    }

    // For each agent span, verify it has gen_ai.agent.name
    for (const agentSpan of agentSpans) {
      const agentName = agentSpan.data?.["gen_ai.agent.name"];
      if (agentName === undefined || agentName === null) {
        const msg = `Agent span (${agentSpan.op}) should have gen_ai.agent.name attribute`;
        errors.push(msg);
        locations.push({
          spanId: agentSpan.span_id,
          attribute: "gen_ai.agent.name",
          message: msg,
        });
      }
    }

    // Build set of agent span IDs for ancestry checking
    const agentSpanIds = new Set(agentSpans.map((s) => s.span_id));

    function findAncestorAgent(span: CapturedSpan): CapturedSpan | undefined {
      let current: CapturedSpan | undefined = span;
      const visited = new Set<string>();

      while (current) {
        if (visited.has(current.span_id)) break;
        visited.add(current.span_id);

        if (agentSpanIds.has(current.span_id)) return current;

        if (current.parent_span_id) {
          current = spanMap.get(current.parent_span_id);
        } else {
          break;
        }
      }

      return undefined;
    }

    const orphanSpans: CapturedSpan[] = [];

    for (const span of aiSpans) {
      if (agentSpanIds.has(span.span_id)) continue;

      const ancestorAgent = findAncestorAgent(span);
      if (ancestorAgent) {
        const expectedAgentName = ancestorAgent.data?.["gen_ai.agent.name"];
        const actualAgentName = span.data?.["gen_ai.agent.name"];

        if (actualAgentName === undefined || actualAgentName === null) {
          const msg = `Child span (${span.op}, id: ${span.span_id.substring(0, 8)}) should have gen_ai.agent.name attribute`;
          errors.push(msg);
          locations.push({
            spanId: span.span_id,
            attribute: "gen_ai.agent.name",
            message: msg,
          });
        } else if (actualAgentName !== expectedAgentName) {
          const msg = `Child span (${span.op}) gen_ai.agent.name should match ancestor agent "${expectedAgentName}" but is "${actualAgentName}"`;
          errors.push(msg);
          locations.push({
            spanId: span.span_id,
            attribute: "gen_ai.agent.name",
            message: msg,
          });
        }
      } else {
        orphanSpans.push(span);
      }
    }

    if (orphanSpans.length > 0) {
      for (const s of orphanSpans) {
        const msg = `Orphan gen_ai span not descended from any agent span: ${s.op} (id: ${s.span_id.substring(0, 8)})`;
        errors.push(msg);
        locations.push({
          spanId: s.span_id,
          message: msg,
        });
      }
    }

    if (errors.length > 0) {
      throw new CheckError(errors.join("\n"), locations);
    }
  },
};
