/**
 * OpenTelemetry-aligned Gen AI Attribute Checks
 *
 * These checks validate the new attribute format from sentry-conventions PR #221.
 * They use soft failures (skip) when the new attributes are not found,
 * allowing gradual SDK migration.
 *
 * Reference: https://github.com/getsentry/sentry-conventions/pull/221
 *
 * =============================================================================
 * ATTRIBUTE MIGRATION REFERENCE
 * =============================================================================
 *
 * | New Attribute                    | Replaces                                    | In OTel |
 * |----------------------------------|---------------------------------------------|---------|
 * | gen_ai.input.messages            | gen_ai.request.messages                     | Yes     |
 * | gen_ai.output.messages           | gen_ai.response.text + gen_ai.response.tool_calls | Yes |
 * | gen_ai.system_instructions       | gen_ai.system.message                       | Yes     |
 * | gen_ai.tool.definitions          | gen_ai.request.available_tools              | Yes     |
 * | gen_ai.tool.call.arguments       | gen_ai.tool.input                           | Yes     |
 * | gen_ai.tool.call.result          | gen_ai.tool.output                          | Yes     |
 *
 * =============================================================================
 * CHECK CROSS-REFERENCE
 * =============================================================================
 *
 * | New Check                        | Replaces / Complements                      |
 * |----------------------------------|---------------------------------------------|
 * | checkInputMessages               | checkInputMessagesSchema (for new format)   |
 * | checkOutputMessages              | checkChatSpanAttributes (gen_ai.response.text) |
 * | checkSystemInstructions          | (no direct equivalent)                      |
 * | checkToolDefinitions             | checkAvailableTools                         |
 * | checkToolCallArguments           | checkToolCalls (gen_ai.tool.input)          |
 * | checkToolCallResult              | checkToolCalls (gen_ai.tool.output)         |
 * | checkToolCallsNewFormat()        | checkToolCalls()                            |
 * | checkOutputMessagesToolCalls()   | checkResponseToolCalls()                    |
 *
 */

import { expect } from "chai";
import { CapturedSpan, FrameworkConfig, TestDefinition } from "../types.js";
import {
  extractGenAISpans,
  findAgentSpans,
  findChatSpans,
  findToolSpans,
  skipIf,
} from "./utils.js";
import { Check, ExpectedToolCall, ExpectedResponseToolCall } from "./checks.js";

// =============================================================================
// Input/Output Message Checks
// =============================================================================

/**
 * Check that gen_ai.input.messages exists on chat spans (new format)
 *
 * @replaces checkInputMessagesSchema (for new attribute name)
 * @replaces Validates gen_ai.request.messages -> gen_ai.input.messages
 *
 * This is the new attribute replacing gen_ai.request.messages.
 * Validates the new message schema with "parts" array format.
 *
 * Soft failure: skips if attribute not found (SDKs may not have migrated yet)
 */
export const checkInputMessages: Check = {
  name: "checkInputMessages",
  fn: (spans) => {
    const chatSpans = findChatSpans(extractGenAISpans(spans));
    const agentSpans = findAgentSpans(extractGenAISpans(spans));
    const spansToCheck = [...chatSpans, ...agentSpans];

    skipIf(spansToCheck.length === 0, "No chat or agent spans found");

    // Look for the new attribute
    const spansWithNewAttr = spansToCheck.filter(
      (s) => s.data?.["gen_ai.input.messages"] !== undefined,
    );

    // Soft failure if not found
    skipIf(
      spansWithNewAttr.length === 0,
      "gen_ai.input.messages not found (SDK may not have migrated to new format yet)",
    );

    // Validate the schema of the new attribute
    for (const span of spansWithNewAttr) {
      const messagesRaw = span.data?.["gen_ai.input.messages"];

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

      expect(Array.isArray(messages), "gen_ai.input.messages should be an array")
        .to.be.true;
      expect(messages.length, "gen_ai.input.messages should not be empty").to.be
        .greaterThan(0);

      // Validate each message has required fields
      for (let i = 0; i < messages.length; i++) {
        const msg = messages[i] as Record<string, unknown>;
        expect(msg.role, `messages[${i}] should have a role field`).to.exist;

        // New format uses "parts" array
        const hasParts = msg.parts !== undefined;
        const hasContent = msg.content !== undefined;
        expect(
          hasParts || hasContent,
          `messages[${i}] should have "parts" (new format) or "content" (legacy)`,
        ).to.be.true;
      }
    }
  },
};

/**
 * Check that gen_ai.output.messages exists on chat spans (new format)
 *
 * @replaces checkChatSpanAttributes (for gen_ai.response.text)
 * @replaces checkResponseToolCalls (for gen_ai.response.tool_calls)
 * @replaces Validates gen_ai.response.text + gen_ai.response.tool_calls -> gen_ai.output.messages
 *
 * This is the new attribute replacing gen_ai.response.text and gen_ai.response.tool_calls.
 * The output messages combine text responses and tool calls into a unified format.
 *
 * Soft failure: skips if attribute not found (SDKs may not have migrated yet)
 */
export const checkOutputMessages: Check = {
  name: "checkOutputMessages",
  fn: (spans) => {
    const chatSpans = findChatSpans(extractGenAISpans(spans));
    skipIf(chatSpans.length === 0, "No chat spans found");

    // Look for the new attribute
    const spansWithNewAttr = chatSpans.filter(
      (s) => s.data?.["gen_ai.output.messages"] !== undefined,
    );

    // Soft failure if not found
    skipIf(
      spansWithNewAttr.length === 0,
      "gen_ai.output.messages not found (SDK may not have migrated to new format yet)",
    );

    // Validate the schema
    for (const span of spansWithNewAttr) {
      const messagesRaw = span.data?.["gen_ai.output.messages"];

      // Parse if JSON string
      let messages: unknown[];
      if (typeof messagesRaw === "string") {
        try {
          messages = JSON.parse(messagesRaw);
        } catch {
          throw new Error(
            `Invalid JSON in gen_ai.output.messages: ${messagesRaw.substring(0, 100)}...`,
          );
        }
      } else {
        messages = messagesRaw as unknown[];
      }

      expect(
        Array.isArray(messages),
        "gen_ai.output.messages should be an array",
      ).to.be.true;
      expect(messages.length, "gen_ai.output.messages should not be empty").to.be
        .greaterThan(0);

      // Validate each output message
      for (let i = 0; i < messages.length; i++) {
        const msg = messages[i] as Record<string, unknown>;
        expect(msg.role, `output.messages[${i}] should have a role field`).to
          .exist;
        expect(msg.role, `output.messages[${i}].role should be "assistant"`).to
          .equal("assistant");

        // Should have parts array
        expect(
          msg.parts !== undefined,
          `output.messages[${i}] should have "parts" array`,
        ).to.be.true;
      }
    }
  },
};

// =============================================================================
// System Instructions Check
// =============================================================================

/**
 * Check that gen_ai.system_instructions exists (new format)
 *
 * @replaces (no direct equivalent in old checks)
 * @replaces Validates gen_ai.system.message -> gen_ai.system_instructions
 *
 * This is the new attribute replacing gen_ai.system.message.
 *
 * Soft failure: skips if attribute not found (SDKs may not have migrated yet)
 */
export const checkSystemInstructions: Check = {
  name: "checkSystemInstructions",
  fn: (spans) => {
    const chatSpans = findChatSpans(extractGenAISpans(spans));
    const agentSpans = findAgentSpans(extractGenAISpans(spans));
    const spansToCheck = [...chatSpans, ...agentSpans];

    skipIf(spansToCheck.length === 0, "No chat or agent spans found");

    // Look for the new attribute
    const spansWithNewAttr = spansToCheck.filter(
      (s) => s.data?.["gen_ai.system_instructions"] !== undefined,
    );

    // Soft failure if not found
    skipIf(
      spansWithNewAttr.length === 0,
      "gen_ai.system_instructions not found (SDK may not have migrated to new format yet)",
    );

    // Validate the attribute
    for (const span of spansWithNewAttr) {
      const instructions = span.data?.["gen_ai.system_instructions"];
      expect(
        typeof instructions === "string",
        "gen_ai.system_instructions should be a string",
      ).to.be.true;
    }
  },
};

// =============================================================================
// Tool Definition Checks
// =============================================================================

/**
 * Check that gen_ai.tool.definitions exists on chat spans (new format)
 *
 * @replaces checkAvailableTools
 * @replaces Validates gen_ai.request.available_tools -> gen_ai.tool.definitions
 *
 * This is the new attribute replacing gen_ai.request.available_tools.
 *
 * Soft failure: skips if attribute not found (SDKs may not have migrated yet)
 */
export const checkToolDefinitions: Check = {
  name: "checkToolDefinitions",
  fn: (spans, config, testDef) => {
    const chatSpans = findChatSpans(extractGenAISpans(spans));
    skipIf(chatSpans.length === 0, "No chat spans found");

    const definedTools = testDef.agent?.tools || [];
    skipIf(definedTools.length === 0, "Test does not define any tools");

    // Look for the new attribute
    const spanWithNewAttr = chatSpans.find(
      (s) => s.data?.["gen_ai.tool.definitions"] !== undefined,
    );

    // Soft failure if not found
    skipIf(
      !spanWithNewAttr,
      "gen_ai.tool.definitions not found (SDK may not have migrated to new format yet)",
    );

    const toolDefsRaw = spanWithNewAttr!.data?.["gen_ai.tool.definitions"];

    // Parse if JSON string
    let toolDefs: Array<Record<string, unknown>>;
    if (typeof toolDefsRaw === "string") {
      try {
        toolDefs = JSON.parse(toolDefsRaw);
      } catch {
        throw new Error(
          `Invalid JSON in gen_ai.tool.definitions: ${toolDefsRaw}`,
        );
      }
    } else {
      toolDefs = toolDefsRaw as Array<Record<string, unknown>>;
    }

    expect(Array.isArray(toolDefs), "gen_ai.tool.definitions should be an array")
      .to.be.true;

    // Check each defined tool exists
    for (const definedTool of definedTools) {
      const foundTool = toolDefs.find((t) => {
        // Tools can have name at top level or nested under "function"
        const toolName =
          t.name || (t.function as Record<string, unknown>)?.name;
        return toolName === definedTool.name;
      });

      expect(foundTool, `Tool definitions should include "${definedTool.name}"`)
        .to.exist;
    }
  },
};

// =============================================================================
// Tool Call Attribute Checks
// =============================================================================

/**
 * Check that gen_ai.tool.call.arguments exists on tool spans (new format)
 *
 * @replaces checkToolCalls (for gen_ai.tool.input validation)
 * @replaces Validates gen_ai.tool.input -> gen_ai.tool.call.arguments
 *
 * This is a new attribute for tool call arguments.
 *
 * Soft failure: skips if attribute not found (SDKs may not have migrated yet)
 */
export const checkToolCallArguments: Check = {
  name: "checkToolCallArguments",
  fn: (spans) => {
    const toolSpans = findToolSpans(extractGenAISpans(spans));
    skipIf(toolSpans.length === 0, "No tool spans found");

    // Look for the new attribute
    const spansWithNewAttr = toolSpans.filter(
      (s) => s.data?.["gen_ai.tool.call.arguments"] !== undefined,
    );

    // Soft failure if not found
    skipIf(
      spansWithNewAttr.length === 0,
      "gen_ai.tool.call.arguments not found (SDK may not have migrated to new format yet)",
    );

    // Validate the attribute
    for (const span of spansWithNewAttr) {
      const argsRaw = span.data?.["gen_ai.tool.call.arguments"];
      expect(argsRaw, "gen_ai.tool.call.arguments should exist").to.exist;

      // Should be a string (stringified JSON)
      expect(
        typeof argsRaw === "string",
        "gen_ai.tool.call.arguments should be a string (stringified JSON)",
      ).to.be.true;

      // Should be valid JSON
      try {
        JSON.parse(argsRaw as string);
      } catch {
        throw new Error(
          `gen_ai.tool.call.arguments is not valid JSON: ${argsRaw}`,
        );
      }
    }
  },
};

/**
 * Check that gen_ai.tool.call.result exists on tool spans (new format)
 *
 * @replaces checkToolCalls (for gen_ai.tool.output validation)
 * @replaces Validates gen_ai.tool.output -> gen_ai.tool.call.result
 *
 * This is a new attribute for tool call results.
 *
 * Soft failure: skips if attribute not found (SDKs may not have migrated yet)
 */
export const checkToolCallResult: Check = {
  name: "checkToolCallResult",
  fn: (spans) => {
    const toolSpans = findToolSpans(extractGenAISpans(spans));
    skipIf(toolSpans.length === 0, "No tool spans found");

    // Look for the new attribute
    const spansWithNewAttr = toolSpans.filter(
      (s) => s.data?.["gen_ai.tool.call.result"] !== undefined,
    );

    // Soft failure if not found
    skipIf(
      spansWithNewAttr.length === 0,
      "gen_ai.tool.call.result not found (SDK may not have migrated to new format yet)",
    );

    // Validate the attribute
    for (const span of spansWithNewAttr) {
      const resultRaw = span.data?.["gen_ai.tool.call.result"];
      expect(resultRaw, "gen_ai.tool.call.result should exist").to.exist;

      // Should be a string (stringified result)
      expect(
        typeof resultRaw === "string",
        "gen_ai.tool.call.result should be a string",
      ).to.be.true;
    }
  },
};

// =============================================================================
// Factory Functions for Specific Tool Call Validation
// =============================================================================

/**
 * Factory function to check specific tool calls with new attribute format
 *
 * @replaces checkToolCalls()
 * @replaces Uses gen_ai.tool.call.arguments instead of gen_ai.tool.input
 * @replaces Uses gen_ai.tool.call.result instead of gen_ai.tool.output
 *
 * Uses gen_ai.tool.call.arguments and gen_ai.tool.call.result (new format)
 *
 * @param expectedTools - Array of expected tool calls to validate
 * @returns A Check object that validates the tool calls
 */
export function checkToolCallsNewFormat(
  expectedTools: ExpectedToolCall[],
): Check {
  const toolNames = expectedTools.map((t) => t.name).join(", ");
  return {
    name: `checkToolCallsNewFormat(${toolNames})`,
    fn: (spans) => {
      const toolSpans = findToolSpans(extractGenAISpans(spans));
      expect(
        toolSpans.length,
        `Should have at least ${expectedTools.length} tool span(s)`,
      ).to.be.at.least(expectedTools.length);

      // Check if any spans use new format
      const hasNewFormat = toolSpans.some(
        (s) =>
          s.data?.["gen_ai.tool.call.arguments"] !== undefined ||
          s.data?.["gen_ai.tool.call.result"] !== undefined,
      );

      skipIf(
        !hasNewFormat,
        "Tool spans do not use new format (gen_ai.tool.call.arguments/result)",
      );

      for (const expected of expectedTools) {
        const toolSpan = toolSpans.find(
          (s) => s.data?.["gen_ai.tool.name"] === expected.name,
        );
        expect(toolSpan, `Should have a tool span for "${expected.name}"`).to
          .exist;

        const span = toolSpan!;

        // Validate arguments using new format
        if (expected.input !== undefined) {
          const argsRaw = span.data?.["gen_ai.tool.call.arguments"];
          expect(
            argsRaw,
            `Tool "${expected.name}" should have gen_ai.tool.call.arguments`,
          ).to.exist;

          let args: Record<string, unknown>;
          if (typeof argsRaw === "string") {
            try {
              args = JSON.parse(argsRaw);
            } catch {
              throw new Error(
                `Tool "${expected.name}" has invalid JSON in gen_ai.tool.call.arguments`,
              );
            }
          } else {
            args = argsRaw as Record<string, unknown>;
          }

          for (const [key, value] of Object.entries(expected.input)) {
            expect(
              args[key],
              `Tool "${expected.name}" args should have "${key}"`,
            ).to.exist;
            if (value !== undefined) {
              const actualValue = args[key];
              if (typeof value === "number" && typeof actualValue === "string") {
                expect(Number(actualValue)).to.equal(value);
              } else {
                expect(actualValue).to.deep.equal(value);
              }
            }
          }
        }

        // Validate result using new format
        if (expected.output !== undefined) {
          const resultRaw = span.data?.["gen_ai.tool.call.result"];
          expect(
            resultRaw,
            `Tool "${expected.name}" should have gen_ai.tool.call.result`,
          ).to.exist;

          let result: unknown;
          if (typeof resultRaw === "string") {
            try {
              result = JSON.parse(resultRaw);
            } catch {
              result = resultRaw;
            }
          } else {
            result = resultRaw;
          }

          expect(result).to.deep.equal(expected.output);
        }
      }
    },
  };
}

/**
 * Check gen_ai.output.messages for tool calls (new format)
 *
 * @replaces checkResponseToolCalls()
 * @replaces Validates gen_ai.response.tool_calls -> gen_ai.output.messages (with type: "tool_call" parts)
 *
 * Replaces checkResponseToolCalls for the new attribute format.
 * Tool calls are now embedded in gen_ai.output.messages as parts with type "tool_call".
 *
 * @param expectedToolCalls - Array of expected tool calls
 * @returns A Check object that validates the tool calls in output messages
 */
export function checkOutputMessagesToolCalls(
  expectedToolCalls: ExpectedResponseToolCall[],
): Check {
  const toolNames = expectedToolCalls.map((t) => t.name).join(", ");
  return {
    name: `checkOutputMessagesToolCalls(${toolNames})`,
    fn: (spans) => {
      const chatSpans = findChatSpans(extractGenAISpans(spans));
      skipIf(chatSpans.length === 0, "No chat spans found");

      // Look for gen_ai.output.messages
      const spanWithOutput = chatSpans.find(
        (s) => s.data?.["gen_ai.output.messages"] !== undefined,
      );

      skipIf(
        !spanWithOutput,
        "gen_ai.output.messages not found (SDK may not have migrated to new format yet)",
      );

      const outputRaw = spanWithOutput!.data?.["gen_ai.output.messages"];

      // Parse if JSON string
      let outputMessages: Array<Record<string, unknown>>;
      if (typeof outputRaw === "string") {
        try {
          outputMessages = JSON.parse(outputRaw);
        } catch {
          throw new Error(
            `Invalid JSON in gen_ai.output.messages: ${outputRaw}`,
          );
        }
      } else {
        outputMessages = outputRaw as Array<Record<string, unknown>>;
      }

      // Extract all tool_call parts from output messages
      const allToolCalls: Array<Record<string, unknown>> = [];
      for (const msg of outputMessages) {
        const parts = msg.parts as Array<Record<string, unknown>> | undefined;
        if (parts) {
          for (const part of parts) {
            if (part.type === "tool_call") {
              allToolCalls.push(part);
            }
          }
        }
      }

      expect(
        allToolCalls.length,
        `Should have at least ${expectedToolCalls.length} tool call(s) in output messages`,
      ).to.be.at.least(expectedToolCalls.length);

      // Check each expected tool call
      for (const expected of expectedToolCalls) {
        const foundCall = allToolCalls.find((tc) => tc.name === expected.name);
        expect(
          foundCall,
          `Output messages should include tool call for "${expected.name}"`,
        ).to.exist;

        // Check arguments
        let actualArgs: Record<string, unknown>;
        const argsRaw = foundCall!.arguments;

        if (typeof argsRaw === "string") {
          try {
            actualArgs = JSON.parse(argsRaw);
          } catch {
            throw new Error(
              `Invalid JSON in tool call arguments for "${expected.name}"`,
            );
          }
        } else {
          actualArgs = (argsRaw as Record<string, unknown>) || {};
        }

        for (const [key, value] of Object.entries(expected.arguments)) {
          expect(
            actualArgs[key],
            `Tool call "${expected.name}" should have argument "${key}"`,
          ).to.exist;
          const actualValue = actualArgs[key];
          if (typeof value === "number" && typeof actualValue === "string") {
            expect(Number(actualValue)).to.equal(value);
          } else {
            expect(actualValue).to.deep.equal(value);
          }
        }
      }
    },
  };
}
