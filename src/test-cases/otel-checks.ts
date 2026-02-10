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

import { CapturedSpan, FrameworkConfig, TestDefinition, ErrorLocation } from "../types.js";
import { CheckError } from "../validator.js";
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

    const errors: string[] = [];
    const locations: ErrorLocation[] = [];

    for (const span of spansWithNewAttr) {
      const messagesRaw = span.data?.["gen_ai.input.messages"];

      let messages: unknown[];
      if (typeof messagesRaw === "string") {
        try {
          messages = JSON.parse(messagesRaw);
        } catch {
          const msg = `Invalid JSON in gen_ai.input.messages: ${messagesRaw.substring(0, 100)}...`;
          errors.push(msg);
          locations.push({ spanId: span.span_id, attribute: "gen_ai.input.messages", message: msg });
          continue;
        }
      } else {
        messages = messagesRaw as unknown[];
      }

      if (!Array.isArray(messages)) {
        const msg = "gen_ai.input.messages should be an array";
        errors.push(msg);
        locations.push({ spanId: span.span_id, attribute: "gen_ai.input.messages", message: msg });
        continue;
      }
      if (messages.length === 0) {
        const msg = "gen_ai.input.messages should not be empty";
        errors.push(msg);
        locations.push({ spanId: span.span_id, attribute: "gen_ai.input.messages", message: msg });
        continue;
      }

      for (let i = 0; i < messages.length; i++) {
        const msgObj = messages[i] as Record<string, unknown>;
        if (!msgObj.role) {
          const msg = `messages[${i}] should have a role field`;
          errors.push(msg);
          locations.push({ spanId: span.span_id, attribute: "gen_ai.input.messages", message: msg });
        }
        if (msgObj.parts === undefined && msgObj.content === undefined) {
          const msg = `messages[${i}] should have "parts" (new format) or "content" (legacy)`;
          errors.push(msg);
          locations.push({ spanId: span.span_id, attribute: "gen_ai.input.messages", message: msg });
        }
      }
    }

    if (errors.length > 0) {
      throw new CheckError(errors.join("\n"), locations);
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

    const errors: string[] = [];
    const locations: ErrorLocation[] = [];

    for (const span of spansWithNewAttr) {
      const messagesRaw = span.data?.["gen_ai.output.messages"];

      let messages: unknown[];
      if (typeof messagesRaw === "string") {
        try {
          messages = JSON.parse(messagesRaw);
        } catch {
          const msg = `Invalid JSON in gen_ai.output.messages: ${String(messagesRaw).substring(0, 100)}...`;
          errors.push(msg);
          locations.push({ spanId: span.span_id, attribute: "gen_ai.output.messages", message: msg });
          continue;
        }
      } else {
        messages = messagesRaw as unknown[];
      }

      if (!Array.isArray(messages)) {
        const msg = "gen_ai.output.messages should be an array";
        errors.push(msg);
        locations.push({ spanId: span.span_id, attribute: "gen_ai.output.messages", message: msg });
        continue;
      }
      if (messages.length === 0) {
        const msg = "gen_ai.output.messages should not be empty";
        errors.push(msg);
        locations.push({ spanId: span.span_id, attribute: "gen_ai.output.messages", message: msg });
        continue;
      }

      for (let i = 0; i < messages.length; i++) {
        const msgObj = messages[i] as Record<string, unknown>;
        if (!msgObj.role) {
          const msg = `output.messages[${i}] should have a role field`;
          errors.push(msg);
          locations.push({ spanId: span.span_id, attribute: "gen_ai.output.messages", message: msg });
        } else if (msgObj.role !== "assistant") {
          const msg = `output.messages[${i}].role should be "assistant" but is "${msgObj.role}"`;
          errors.push(msg);
          locations.push({ spanId: span.span_id, attribute: "gen_ai.output.messages", message: msg });
        }
        if (msgObj.parts === undefined) {
          const msg = `output.messages[${i}] should have "parts" array`;
          errors.push(msg);
          locations.push({ spanId: span.span_id, attribute: "gen_ai.output.messages", message: msg });
        }
      }
    }

    if (errors.length > 0) {
      throw new CheckError(errors.join("\n"), locations);
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

    const locations: ErrorLocation[] = [];
    for (const span of spansWithNewAttr) {
      const instructions = span.data?.["gen_ai.system_instructions"];
      if (typeof instructions !== "string") {
        locations.push({ spanId: span.span_id, attribute: "gen_ai.system_instructions", message: `should be a string but is ${typeof instructions}` });
      }
    }
    if (locations.length > 0) {
      throw new CheckError(`gen_ai.system_instructions validation failed:\n  ${locations.map(l => l.message).join("\n  ")}`, locations);
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

    const span = spanWithNewAttr!;
    const toolDefsRaw = span.data?.["gen_ai.tool.definitions"];

    let toolDefs: Array<Record<string, unknown>>;
    if (typeof toolDefsRaw === "string") {
      try {
        toolDefs = JSON.parse(toolDefsRaw);
      } catch {
        throw new CheckError(
          `Invalid JSON in gen_ai.tool.definitions: ${toolDefsRaw}`,
          [{ spanId: span.span_id, attribute: "gen_ai.tool.definitions", message: "Invalid JSON" }],
        );
      }
    } else {
      toolDefs = toolDefsRaw as Array<Record<string, unknown>>;
    }

    if (!Array.isArray(toolDefs)) {
      throw new CheckError("gen_ai.tool.definitions should be an array", [
        { spanId: span.span_id, attribute: "gen_ai.tool.definitions", message: "Not an array" },
      ]);
    }

    const errors: string[] = [];
    const locations: ErrorLocation[] = [];
    for (const definedTool of definedTools) {
      const foundTool = toolDefs.find((t) => {
        const toolName = t.name || (t.function as Record<string, unknown>)?.name;
        return toolName === definedTool.name;
      });
      if (!foundTool) {
        const msg = `Tool definitions should include "${definedTool.name}"`;
        errors.push(msg);
        locations.push({ spanId: span.span_id, attribute: "gen_ai.tool.definitions", message: msg });
      }
    }
    if (errors.length > 0) {
      throw new CheckError(errors.join("\n"), locations);
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

    const locations: ErrorLocation[] = [];
    for (const span of spansWithNewAttr) {
      const argsRaw = span.data?.["gen_ai.tool.call.arguments"];
      if (typeof argsRaw !== "string") {
        locations.push({ spanId: span.span_id, attribute: "gen_ai.tool.call.arguments", message: `should be a string but is ${typeof argsRaw}` });
        continue;
      }
      try {
        JSON.parse(argsRaw);
      } catch {
        locations.push({ spanId: span.span_id, attribute: "gen_ai.tool.call.arguments", message: "not valid JSON" });
      }
    }
    if (locations.length > 0) {
      throw new CheckError(`gen_ai.tool.call.arguments validation failed:\n  ${locations.map(l => l.message).join("\n  ")}`, locations);
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

    const locations: ErrorLocation[] = [];
    for (const span of spansWithNewAttr) {
      const resultRaw = span.data?.["gen_ai.tool.call.result"];
      if (typeof resultRaw !== "string") {
        locations.push({ spanId: span.span_id, attribute: "gen_ai.tool.call.result", message: `should be a string but is ${typeof resultRaw}` });
      }
    }
    if (locations.length > 0) {
      throw new CheckError(`gen_ai.tool.call.result validation failed:\n  ${locations.map(l => l.message).join("\n  ")}`, locations);
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
      if (toolSpans.length < expectedTools.length) {
        throw new CheckError(`Should have at least ${expectedTools.length} tool span(s) but found ${toolSpans.length}`);
      }

      const hasNewFormat = toolSpans.some(
        (s) =>
          s.data?.["gen_ai.tool.call.arguments"] !== undefined ||
          s.data?.["gen_ai.tool.call.result"] !== undefined,
      );

      skipIf(
        !hasNewFormat,
        "Tool spans do not use new format (gen_ai.tool.call.arguments/result)",
      );

      const errors: string[] = [];
      const locations: ErrorLocation[] = [];

      for (const expected of expectedTools) {
        const toolSpan = toolSpans.find(
          (s) => s.data?.["gen_ai.tool.name"] === expected.name,
        );
        if (!toolSpan) {
          errors.push(`Should have a tool span for "${expected.name}"`);
          continue;
        }

        if (expected.input !== undefined) {
          const argsRaw = toolSpan.data?.["gen_ai.tool.call.arguments"];
          if (argsRaw === undefined || argsRaw === null) {
            const msg = `Tool "${expected.name}" should have gen_ai.tool.call.arguments`;
            errors.push(msg);
            locations.push({ spanId: toolSpan.span_id, attribute: "gen_ai.tool.call.arguments", message: msg });
          } else {
            let args: Record<string, unknown>;
            if (typeof argsRaw === "string") {
              try { args = JSON.parse(argsRaw); } catch {
                const msg = `Tool "${expected.name}" has invalid JSON in gen_ai.tool.call.arguments`;
                errors.push(msg);
                locations.push({ spanId: toolSpan.span_id, attribute: "gen_ai.tool.call.arguments", message: msg });
                continue;
              }
            } else {
              args = argsRaw as Record<string, unknown>;
            }

            for (const [key, value] of Object.entries(expected.input)) {
              if (args[key] === undefined || args[key] === null) {
                const msg = `Tool "${expected.name}" args should have "${key}"`;
                errors.push(msg);
                locations.push({ spanId: toolSpan.span_id, attribute: "gen_ai.tool.call.arguments", message: msg });
              } else if (value !== undefined) {
                const actualValue = args[key];
                let matches = false;
                if (typeof value === "number" && typeof actualValue === "string") {
                  matches = Number(actualValue) === value;
                } else {
                  matches = JSON.stringify(actualValue) === JSON.stringify(value);
                }
                if (!matches) {
                  const msg = `Tool "${expected.name}" args.${key} should equal ${JSON.stringify(value)} but is ${JSON.stringify(actualValue)}`;
                  errors.push(msg);
                  locations.push({ spanId: toolSpan.span_id, attribute: "gen_ai.tool.call.arguments", message: msg });
                }
              }
            }
          }
        }

        if (expected.output !== undefined) {
          const resultRaw = toolSpan.data?.["gen_ai.tool.call.result"];
          if (resultRaw === undefined || resultRaw === null) {
            const msg = `Tool "${expected.name}" should have gen_ai.tool.call.result`;
            errors.push(msg);
            locations.push({ spanId: toolSpan.span_id, attribute: "gen_ai.tool.call.result", message: msg });
          } else {
            let result: unknown;
            if (typeof resultRaw === "string") {
              try { result = JSON.parse(resultRaw); } catch { result = resultRaw; }
            } else {
              result = resultRaw;
            }
            if (JSON.stringify(result) !== JSON.stringify(expected.output)) {
              const msg = `Tool "${expected.name}" result should equal ${JSON.stringify(expected.output)} but is ${JSON.stringify(result)}`;
              errors.push(msg);
              locations.push({ spanId: toolSpan.span_id, attribute: "gen_ai.tool.call.result", message: msg });
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

      const span = spanWithOutput!;
      const outputRaw = span.data?.["gen_ai.output.messages"];

      let outputMessages: Array<Record<string, unknown>>;
      if (typeof outputRaw === "string") {
        try {
          outputMessages = JSON.parse(outputRaw);
        } catch {
          throw new CheckError(
            `Invalid JSON in gen_ai.output.messages: ${outputRaw}`,
            [{ spanId: span.span_id, attribute: "gen_ai.output.messages", message: "Invalid JSON" }],
          );
        }
      } else {
        outputMessages = outputRaw as Array<Record<string, unknown>>;
      }

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

      const errors: string[] = [];
      const locations: ErrorLocation[] = [];

      if (allToolCalls.length < expectedToolCalls.length) {
        const msg = `Should have at least ${expectedToolCalls.length} tool call(s) in output messages but found ${allToolCalls.length}`;
        errors.push(msg);
        locations.push({ spanId: span.span_id, attribute: "gen_ai.output.messages", message: msg });
      }

      for (const expected of expectedToolCalls) {
        const foundCall = allToolCalls.find((tc) => tc.name === expected.name);
        if (!foundCall) {
          const msg = `Output messages should include tool call for "${expected.name}"`;
          errors.push(msg);
          locations.push({ spanId: span.span_id, attribute: "gen_ai.output.messages", message: msg });
          continue;
        }

        let actualArgs: Record<string, unknown>;
        const argsRaw = foundCall.arguments;
        if (typeof argsRaw === "string") {
          try { actualArgs = JSON.parse(argsRaw); } catch {
            const msg = `Invalid JSON in tool call arguments for "${expected.name}"`;
            errors.push(msg);
            locations.push({ spanId: span.span_id, attribute: "gen_ai.output.messages", message: msg });
            continue;
          }
        } else {
          actualArgs = (argsRaw as Record<string, unknown>) || {};
        }

        for (const [key, value] of Object.entries(expected.arguments)) {
          if (actualArgs[key] === undefined || actualArgs[key] === null) {
            const msg = `Tool call "${expected.name}" should have argument "${key}"`;
            errors.push(msg);
            locations.push({ spanId: span.span_id, attribute: "gen_ai.output.messages", message: msg });
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
              locations.push({ spanId: span.span_id, attribute: "gen_ai.output.messages", message: msg });
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
