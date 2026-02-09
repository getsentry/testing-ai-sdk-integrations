/**
 * Reusable check functions for test cases
 *
 * Each check function follows the signature:
 *   (spans: CapturedSpan[], config: FrameworkConfig, testDef: TestDefinition) => void
 *
 * Check functions can:
 * - Throw an error to fail the check
 * - Call skip() or skipIf() to skip the check
 * - Use expect() from chai for assertions
 */

import { expect } from "chai";
import { CapturedSpan, FrameworkConfig, TestDefinition } from "../types.js";
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
        // Exact count
        expect(
          aiSpans.length,
          `Should have exactly ${expected} AI span(s)`,
        ).to.equal(expected);
      } else {
        // Range check
        if (expected.min !== undefined) {
          expect(
            aiSpans.length,
            `Should have at least ${expected.min} AI span(s)`,
          ).to.be.at.least(expected.min);
        }
        if (expected.max !== undefined) {
          expect(
            aiSpans.length,
            `Should have at most ${expected.max} AI span(s)`,
          ).to.be.at.most(expected.max);
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
    expect(
      chatSpans.length,
      "Should have at least one chat/completion span",
    ).to.be.greaterThan(0);

    const requestModel =
      config.modelOverrides?.request || testDef.inputs[0]?.model || "gpt-*";
    const responseModel =
      config.modelOverrides?.response || `${requestModel.replace("*", "")}*`;

    assertAttributes(chatSpans, {
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
 * - gen_ai.operation.name matches AGENT_OPERATION_NAME_PATTERN
 * - gen_ai.agent.name exists
 *
 * Fails if no agent spans are found.
 */
export const checkAgentSpanAttributes: Check = {
  name: "checkAgentSpanAttributes",
  fn: (spans) => {
    const agentSpans = findAgentSpans(extractGenAISpans(spans));
    expect(
      agentSpans.length,
      "Should have at least one agent span",
    ).to.be.greaterThan(0);

    assertAttributes(agentSpans, {
      "gen_ai.operation.name": AGENT_OPERATION_NAME_PATTERN,
      "gen_ai.agent.name": true,
    });
  },
};

/**
 * Check attributes on tool execution spans
 *
 * Validates:
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
    expect(
      toolSpans.length,
      "Should have at least one tool span",
    ).to.be.greaterThan(0);

    assertAttributes(toolSpans, {
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
      expect(
        toolSpans.length,
        `Should have at least ${expectedTools.length} tool span(s)`,
      ).to.be.at.least(expectedTools.length);

      for (const expected of expectedTools) {
        // Find the tool span matching this expected tool
        const toolSpan = toolSpans.find(
          (s) => s.data?.["gen_ai.tool.name"] === expected.name,
        );
        expect(toolSpan, `Should have a tool span for "${expected.name}"`).to
          .exist;

        const span = toolSpan!;

        // Validate type if specified
        if (expected.type !== undefined) {
          expect(
            span.data?.["gen_ai.tool.type"],
            `Tool "${expected.name}" should have type "${expected.type}"`,
          ).to.equal(expected.type);
        }

        // Validate description if specified
        if (expected.description !== undefined) {
          expect(
            span.data?.["gen_ai.tool.description"],
            `Tool "${expected.name}" should have description`,
          ).to.equal(expected.description);
        }

        // Validate input if specified
        if (expected.input !== undefined) {
          const inputRaw = span.data?.["gen_ai.tool.input"];
          expect(
            inputRaw,
            `Tool "${expected.name}" should have gen_ai.tool.input`,
          ).to.exist;

          // Parse input if it's a JSON string
          let input: Record<string, unknown>;
          if (typeof inputRaw === "string") {
            try {
              input = JSON.parse(inputRaw);
            } catch {
              throw new Error(
                `Tool "${expected.name}" has invalid JSON in gen_ai.tool.input: ${inputRaw}`,
              );
            }
          } else {
            input = inputRaw as Record<string, unknown>;
          }

          // Check each expected input field
          for (const [key, value] of Object.entries(expected.input)) {
            expect(
              input[key],
              `Tool "${expected.name}" input should have "${key}"`,
            ).to.exist;
            // If a specific value is expected, check it (convert to same type for comparison)
            if (value !== undefined) {
              const actualValue = input[key];
              // Handle numeric string comparison (some frameworks pass numbers as strings)
              if (
                typeof value === "number" &&
                typeof actualValue === "string"
              ) {
                expect(
                  Number(actualValue),
                  `Tool "${expected.name}" input.${key} should equal ${value}`,
                ).to.equal(value);
              } else {
                expect(
                  actualValue,
                  `Tool "${expected.name}" input.${key} should equal ${JSON.stringify(value)}`,
                ).to.deep.equal(value);
              }
            }
          }
        }

        // Validate output if specified
        if (expected.output !== undefined) {
          const outputRaw = span.data?.["gen_ai.tool.output"];
          expect(
            outputRaw,
            `Tool "${expected.name}" should have gen_ai.tool.output`,
          ).to.exist;

          // Parse output if it's a JSON string
          let output: unknown;
          if (typeof outputRaw === "string") {
            try {
              output = JSON.parse(outputRaw);
            } catch {
              // Not JSON, use raw value
              output = outputRaw;
            }
          } else {
            output = outputRaw;
          }

          expect(
            output,
            `Tool "${expected.name}" output should equal ${JSON.stringify(expected.output)}`,
          ).to.deep.equal(expected.output);
        }
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
    expect(
      chatSpans.length,
      "Should have at least one chat span",
    ).to.be.greaterThan(0);

    const definedTools = testDef.agent?.tools || [];
    expect(
      definedTools.length,
      "Test should define at least one tool",
    ).to.be.greaterThan(0);

    // Find a chat span with available_tools
    const spanWithTools = chatSpans.find(
      (s) => s.data?.["gen_ai.request.available_tools"] !== undefined,
    );
    expect(
      spanWithTools,
      "Should have a chat span with gen_ai.request.available_tools",
    ).to.exist;

    const availableToolsRaw =
      spanWithTools!.data?.["gen_ai.request.available_tools"];

    // Parse if JSON string
    let availableTools: Array<Record<string, unknown>>;
    if (typeof availableToolsRaw === "string") {
      try {
        availableTools = JSON.parse(availableToolsRaw);
      } catch {
        throw new Error(
          `Invalid JSON in gen_ai.request.available_tools: ${availableToolsRaw}`,
        );
      }
    } else {
      availableTools = availableToolsRaw as Array<Record<string, unknown>>;
    }

    expect(
      Array.isArray(availableTools),
      "gen_ai.request.available_tools should be an array",
    ).to.be.true;

    // Check each defined tool exists in available_tools
    for (const definedTool of definedTools) {
      const foundTool = availableTools.find((t) => {
        // Tools can be nested under "function" key or at top level
        const toolName =
          t.name || (t.function as Record<string, unknown>)?.name;
        return toolName === definedTool.name;
      });

      expect(foundTool, `Available tools should include "${definedTool.name}"`)
        .to.exist;

      // Check description if present
      const toolDesc =
        foundTool!.description ||
        (foundTool!.function as Record<string, unknown>)?.description;
      if (definedTool.description) {
        expect(
          toolDesc,
          `Tool "${definedTool.name}" should have description`,
        ).to.equal(definedTool.description);
      }
    }

    // Check count matches
    expect(
      availableTools.length,
      `Should have ${definedTools.length} available tool(s)`,
    ).to.equal(definedTools.length);
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
      expect(
        chatSpans.length,
        "Should have at least one chat span",
      ).to.be.greaterThan(0);

      // Collect all tool_calls from all chat spans
      const allToolCalls: Array<Record<string, unknown>> = [];

      for (const span of chatSpans) {
        const toolCallsRaw = span.data?.["gen_ai.response.tool_calls"];
        if (toolCallsRaw === undefined) continue;

        // Parse if JSON string
        let toolCalls: Array<Record<string, unknown>>;
        if (typeof toolCallsRaw === "string") {
          try {
            toolCalls = JSON.parse(toolCallsRaw);
          } catch {
            throw new Error(
              `Invalid JSON in gen_ai.response.tool_calls: ${toolCallsRaw}`,
            );
          }
        } else {
          toolCalls = toolCallsRaw as Array<Record<string, unknown>>;
        }

        if (Array.isArray(toolCalls)) {
          allToolCalls.push(...toolCalls);
        }
      }

      expect(
        allToolCalls.length,
        `Should have at least ${expectedToolCalls.length} tool call(s) in response`,
      ).to.be.at.least(expectedToolCalls.length);

      // Check each expected tool call
      for (const expected of expectedToolCalls) {
        // Find matching tool call by name
        const foundCall = allToolCalls.find((tc) => {
          // Handle different formats: { name, arguments } or { function: { name, arguments } }
          const tcName =
            tc.name || (tc.function as Record<string, unknown>)?.name;
          return tcName === expected.name;
        });

        expect(
          foundCall,
          `Response should include tool call for "${expected.name}"`,
        ).to.exist;

        // Get arguments
        let actualArgs: Record<string, unknown>;
        const argsRaw =
          foundCall!.arguments ||
          (foundCall!.function as Record<string, unknown>)?.arguments;

        if (typeof argsRaw === "string") {
          try {
            actualArgs = JSON.parse(argsRaw);
          } catch {
            throw new Error(
              `Invalid JSON in tool call arguments for "${expected.name}": ${argsRaw}`,
            );
          }
        } else {
          actualArgs = (argsRaw as Record<string, unknown>) || {};
        }

        // Check each expected argument
        for (const [key, value] of Object.entries(expected.arguments)) {
          expect(
            actualArgs[key],
            `Tool call "${expected.name}" should have argument "${key}"`,
          ).to.exist;

          const actualValue = actualArgs[key];
          // Handle numeric string comparison
          if (typeof value === "number" && typeof actualValue === "string") {
            expect(
              Number(actualValue),
              `Tool call "${expected.name}" argument "${key}" should equal ${value}`,
            ).to.equal(value);
          } else {
            expect(
              actualValue,
              `Tool call "${expected.name}" argument "${key}" should equal ${JSON.stringify(value)}`,
            ).to.deep.equal(value);
          }
        }
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

    expect(
      spansToCheck.length,
      "Should have at least one chat or agent span",
    ).to.be.greaterThan(0);

    let foundMessages = false;

    for (const span of spansToCheck) {
      // Check both new format (gen_ai.input.messages) and legacy (gen_ai.request.messages)
      const messagesRaw =
        span.data?.["gen_ai.input.messages"] ??
        span.data?.["gen_ai.request.messages"];

      if (messagesRaw === undefined) continue;
      foundMessages = true;

      // Parse if JSON string
      let messages: unknown[];
      if (typeof messagesRaw === "string") {
        try {
          messages = JSON.parse(messagesRaw);
        } catch {
          throw new Error(
            `Invalid JSON in gen_ai.input.messages: ${messagesRaw.substring(0, 100)}...`,
          );
        }
      } else {
        messages = messagesRaw as unknown[];
      }

      expect(
        Array.isArray(messages),
        "gen_ai.input.messages should be an array",
      ).to.be.true;

      expect(
        messages.length,
        "gen_ai.input.messages should not be empty",
      ).to.be.greaterThan(0);

      // Validate each message
      for (let i = 0; i < messages.length; i++) {
        const msg = messages[i] as Record<string, unknown>;
        const msgPath = `messages[${i}]`;

        expect(
          typeof msg === "object" && msg !== null,
          `${msgPath} should be an object`,
        ).to.be.true;

        // Check role
        expect(msg.role, `${msgPath} should have a role field`).to.exist;
        expect(
          VALID_MESSAGE_ROLES.includes(
            msg.role as (typeof VALID_MESSAGE_ROLES)[number],
          ),
          `${msgPath}.role should be one of: ${VALID_MESSAGE_ROLES.join(", ")} (got: ${msg.role})`,
        ).to.be.true;

        // Check for content (parts array or content string/array)
        const hasParts = msg.parts !== undefined;
        const hasContent = msg.content !== undefined;

        expect(
          hasParts || hasContent,
          `${msgPath} should have either "parts" or "content" field`,
        ).to.be.true;

        // Validate parts array if present
        if (hasParts) {
          expect(
            Array.isArray(msg.parts),
            `${msgPath}.parts should be an array`,
          ).to.be.true;

          const parts = msg.parts as Array<Record<string, unknown>>;
          for (let j = 0; j < parts.length; j++) {
            const part = parts[j];
            const partPath = `${msgPath}.parts[${j}]`;

            expect(
              typeof part === "object" && part !== null,
              `${partPath} should be an object`,
            ).to.be.true;

            // Parts should have a type
            if (part.type !== undefined) {
              expect(
                VALID_PART_TYPES.includes(
                  part.type as (typeof VALID_PART_TYPES)[number],
                ),
                `${partPath}.type should be one of: ${VALID_PART_TYPES.join(", ")} (got: ${part.type})`,
              ).to.be.true;

              // Validate type-specific fields
              if (part.type === "text") {
                expect(
                  part.text !== undefined || part.content !== undefined,
                  `${partPath} with type "text" should have "text" or "content" field`,
                ).to.be.true;
              } else if (part.type === "tool_call") {
                expect(
                  part.name,
                  `${partPath} with type "tool_call" should have "name" field`,
                ).to.exist;
              } else if (part.type === "tool_call_response") {
                expect(
                  part.id !== undefined || part.tool_call_id !== undefined,
                  `${partPath} with type "tool_call_response" should have "id" or "tool_call_id" field`,
                ).to.be.true;
              }
            }
          }
        }

        // Validate content if present (can be string or array)
        if (hasContent && !hasParts) {
          const content = msg.content;
          const isValidContent =
            typeof content === "string" ||
            Array.isArray(content) ||
            (typeof content === "object" && content !== null);

          expect(
            isValidContent,
            `${msgPath}.content should be a string, array, or object`,
          ).to.be.true;
        }
      }
    }

    expect(
      foundMessages,
      "Should have at least one span with gen_ai.input.messages or gen_ai.request.messages",
    ).to.be.true;
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

    expect(
      spansToCheck.length,
      "Should have at least one chat or agent span",
    ).to.be.greaterThan(0);

    let foundMessages = false;
    let foundRedaction = false;

    for (const span of spansToCheck) {
      const messagesRaw =
        span.data?.["gen_ai.input.messages"] ??
        span.data?.["gen_ai.request.messages"];

      if (messagesRaw === undefined) continue;
      foundMessages = true;

      // Convert to string for searching
      const messagesStr =
        typeof messagesRaw === "string"
          ? messagesRaw
          : JSON.stringify(messagesRaw);

      // Check for redaction marker
      if (messagesStr.includes("[Blob substitute]")) {
        foundRedaction = true;
      }

      // Check that no raw base64 data is present (would be very long strings)
      // Base64 image data is typically 100+ characters of alphanumeric
      const base64Pattern = /[A-Za-z0-9+/]{100,}={0,2}/;
      expect(
        base64Pattern.test(messagesStr),
        "Messages should not contain raw base64 data (should be redacted)",
      ).to.be.false;
    }

    expect(
      foundMessages,
      "Should have at least one span with messages attribute",
    ).to.be.true;

    expect(
      foundRedaction,
      "Messages should contain '[Blob substitute]' marker indicating binary content was redacted",
    ).to.be.true;
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
    expect(
      handoffSpans.length,
      "Should have at least one handoff span",
    ).to.be.greaterThan(0);

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

    for (const span of aiSpans) {
      expect(
        span.data?.["gen_ai.usage.input_tokens.cached"],
      ).to.be.lessThanOrEqual(span.data?.["gen_ai.usage.input_tokens"]);
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

    for (const span of aiSpans) {
      expect(
        span.data?.["gen_ai.usage.output_tokens.reasoning"],
      ).to.be.lessThanOrEqual(span.data?.["gen_ai.usage.output_tokens"]);
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

    // Find spans with message attribute
    let foundTrimmedMessage = false;
    const maxExpectedSize = 15000; // Sentry typically trims to ~10KB

    for (const span of aiSpans) {
      const messageValue = span.data?.["gen_ai.request.messages"];
      if (messageValue !== undefined) {
        const messageStr =
          typeof messageValue === "string"
            ? messageValue
            : JSON.stringify(messageValue);

        expect(messageStr.length, "Message should be trimmed").to.be.lessThan(
          maxExpectedSize,
        );

        foundTrimmedMessage = true;
      }
    }

    skipIf(!foundTrimmedMessage, "No gen_ai.request.messages attribute found");
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

    for (const span of aiSpans) {
      // Check both new and legacy attribute names
      const originalLength =
        span.data?.["gen_ai.input.messages.original_length"] ??
        span.data?.["gen_ai.request.messages.original_length"];

      if (originalLength === undefined) continue;

      foundMetadata = true;

      expect(originalLength, "original_length should be a number").to.be.a(
        "number",
      );
      expect(
        originalLength,
        "original_length should be greater than 0",
      ).to.be.greaterThan(0);

      // Get the messages to validate content length constraint
      const messagesRaw =
        span.data?.["gen_ai.input.messages"] ??
        span.data?.["gen_ai.request.messages"];

      if (messagesRaw !== undefined) {
        // Get the string representation to measure actual content length
        const messagesStr =
          typeof messagesRaw === "string"
            ? messagesRaw
            : JSON.stringify(messagesRaw);

        expect(
          messagesStr.length,
          `Truncated messages content length (${messagesStr.length}) should be less than original_length (${originalLength})`,
        ).to.be.lessThan(originalLength as number);
      }
    }

    expect(
      foundMetadata,
      "Should have at least one span with original_length metadata",
    ).to.be.true;
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
    expect(
      aiSpans.length,
      "Should have at least one AI span",
    ).to.be.greaterThan(0);

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

    expect(
      agentSpans.length,
      "Should have at least one agent span",
    ).to.be.greaterThan(0);

    // For each agent span, verify it has gen_ai.agent.name
    for (const agentSpan of agentSpans) {
      const agentName = agentSpan.data?.["gen_ai.agent.name"];
      expect(
        agentName,
        `Agent span (${agentSpan.op}) should have gen_ai.agent.name attribute`,
      ).to.exist;
    }

    // Build set of agent span IDs for ancestry checking
    const agentSpanIds = new Set(agentSpans.map((s) => s.span_id));

    /**
     * Find the ancestor agent span for a given span by walking up the parent chain
     * Returns the agent span if found, undefined otherwise
     */
    function findAncestorAgent(span: CapturedSpan): CapturedSpan | undefined {
      let current: CapturedSpan | undefined = span;
      const visited = new Set<string>();

      while (current) {
        // Prevent infinite loops
        if (visited.has(current.span_id)) {
          break;
        }
        visited.add(current.span_id);

        // Check if current span is an agent span
        if (agentSpanIds.has(current.span_id)) {
          return current;
        }

        // Move to parent
        if (current.parent_span_id) {
          current = spanMap.get(current.parent_span_id);
        } else {
          break;
        }
      }

      return undefined;
    }

    // Categorize gen_ai spans by their relationship to agent spans
    const childSpans: CapturedSpan[] = []; // Non-agent gen_ai spans that are descendants of agents
    const orphanSpans: CapturedSpan[] = []; // gen_ai spans with no agent ancestor

    for (const span of aiSpans) {
      // Skip agent spans themselves
      if (agentSpanIds.has(span.span_id)) {
        continue;
      }

      const ancestorAgent = findAncestorAgent(span);
      if (ancestorAgent) {
        childSpans.push(span);

        // Verify gen_ai.agent.name matches the ancestor agent's name
        const expectedAgentName = ancestorAgent.data?.["gen_ai.agent.name"];
        const actualAgentName = span.data?.["gen_ai.agent.name"];

        expect(
          actualAgentName,
          `Child span (${span.op}, id: ${span.span_id.substring(0, 8)}) should have gen_ai.agent.name attribute`,
        ).to.exist;

        expect(
          actualAgentName,
          `Child span (${span.op}) gen_ai.agent.name should match ancestor agent "${expectedAgentName}"`,
        ).to.equal(expectedAgentName);
      } else {
        orphanSpans.push(span);
      }
    }

    // Fail if there are orphan gen_ai spans (not descended from any agent)
    if (orphanSpans.length > 0) {
      const orphanDetails = orphanSpans
        .map((s) => `${s.op} (id: ${s.span_id.substring(0, 8)})`)
        .join(", ");
      throw new Error(
        `Found ${orphanSpans.length} orphan gen_ai span(s) not descended from any agent span: ${orphanDetails}`,
      );
    }
  },
};
