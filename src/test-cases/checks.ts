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
 * - gen_ai.operation.name exists
 * - gen_ai.request.model matches expected model
 * - gen_ai.request.messages exists
 * - gen_ai.response.model matches expected pattern
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
      "gen_ai.operation.name": true,
      "gen_ai.request.model": requestModel,
      "gen_ai.request.messages": true,
      "gen_ai.response.model": responseModel,
      "gen_ai.usage.input_tokens": true,
      "gen_ai.usage.output_tokens": true,
    });
  },
};

/**
 * Check attributes on invoke_agent spans (agent invocations)
 *
 * Validates:
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

    // TODO: Add attribute validation once we know what attributes agent spans should have
    for (const span of agentSpans) {
      expect(
        span.data?.["gen_ai.agent.name"],
        `Agent span should have gen_ai.agent.name attribute`,
      ).to.exist;
    }
  },
};

/**
 * Check attributes on tool execution spans
 *
 * Validates:
 * - gen_ai.tool.name exists
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

    // TODO: Add attribute validation once we know what attributes tool spans should have
    for (const span of toolSpans) {
      expect(
        span.data?.["gen_ai.tool.name"],
        `Tool span should have gen_ai.tool.name attribute`,
      ).to.exist;
    }
  },
};

/**
 * Check attributes on handoff spans (agent-to-agent handoffs)
 *
 * Validates:
 * - Handoff spans exist
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

    // TODO: Add attribute validation once we know what attributes handoff spans should have
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
 * Check that trimming metadata is present
 */
export const checkTrimmingMetadata: Check = {
  name: "checkTrimmingMetadata",
  fn: (spans) => {
    const aiSpans = extractGenAISpans(spans);
    skipIf(aiSpans.length === 0, "No AI spans captured");

    let foundMetadata = false;
    const metadataAttr = "gen_ai.input.messages.original_length";

    for (const span of aiSpans) {
      const originalLength = span.data?.[metadataAttr];
      if (originalLength !== undefined) {
        expect(originalLength).to.be.a("number");
        expect(originalLength).to.be.greaterThan(0);
        foundMetadata = true;
      }
    }

    skipIf(!foundMetadata, `No trimming metadata found at '${metadataAttr}'`);
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
