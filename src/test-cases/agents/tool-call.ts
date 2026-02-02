/**
 * Tool Call Agent Test Case
 *
 * Tests an agentic workflow with successful tool calling.
 * Validates that Sentry captures both agent and tool call spans.
 */

import { TestDefinition, CapturedSpan, Check } from "../../types.js";
import {
  hasLLMAttributes,
  hasValidTokenUsage,
  hasAgentHierarchy,
  hasValidInputTokensCached,
  hasValidOutputTokensReasoning,
} from "../checks.js";
import { expect } from "chai";
import { extractGenAISpans, findToolSpans, assertToolInput } from "../utils.js";

/**
 * Check that tool input arguments are captured correctly
 */
const hasToolInputArguments: Check = {
  name: "hasToolInputArguments",
  fn: (spans: CapturedSpan[], config, testDef) => {
    const toolSpans = findToolSpans(extractGenAISpans(spans));
    expect(
      toolSpans.length,
      "Should have at least one tool span",
    ).to.be.greaterThan(0);

    // Get expected tool from test definition
    const expectedTool = testDef.agent?.tools?.[0];
    expect(expectedTool, "Test should define at least one tool").to.exist;

    // Find the span for the expected tool
    const toolSpan = toolSpans.find(
      (s) =>
        s.data?.["gen_ai.tool.name"] === expectedTool!.name ||
        s.description?.includes(expectedTool!.name),
    );
    expect(toolSpan, `Should have a span for tool "${expectedTool!.name}"`).to
      .exist;

    // Check that tool input contains expected arguments
    // For the add tool, we expect a and b to be present
    assertToolInput(toolSpan!, {
      a: true, // Must exist (any value)
      b: true, // Must exist (any value)
    });
  },
};

export const toolCallAgentTest: TestDefinition = {
  name: "Tool Call Agent Test",
  description: "Agent with successful tool call",
  type: "agent",

  agent: {
    name: "math_assistant",
    description: "A math assistant that can perform basic arithmetic",
    tools: [
      {
        name: "add",
        description: "Add two numbers together",
        parameters: {
          type: "object",
          properties: {
            a: {
              type: "number",
              description: "First number",
            },
            b: {
              type: "number",
              description: "Second number",
            },
          },
          required: ["a", "b"],
        },
        result: 11, // Static result: 4 + 7 = 11
      },
    ],
  },

  inputs: [
    {
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: "What is the result of 4 + 7? Use the add tool.",
        },
      ],
    },
  ],

  checks: [
    hasLLMAttributes,
    hasValidTokenUsage,
    hasAgentHierarchy,
    hasToolInputArguments,
    hasValidInputTokensCached,
    hasValidOutputTokensReasoning,
  ],
};

export default toolCallAgentTest;
