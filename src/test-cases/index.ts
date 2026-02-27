/**
 * Test Cases Index
 *
 * Centralized export of all test definitions
 */

import { TestDefinition } from "../types.js";
import { basicLLMTest } from "./llm/basic.js";
import { multiTurnLLMTest } from "./llm/multi-turn.js";
import { basicErrorLLMTest } from "./llm/basic-error.js";
import { visionLLMTest } from "./llm/vision.js";
import { longInputLLMTest } from "./llm/long-input.js";
import { basicAgentTest } from "./agents/basic.js";
import { toolCallAgentTest } from "./agents/tool-call.js";
import { toolErrorAgentTest } from "./agents/tool-error.js";
import { visionAgentTest } from "./agents/vision.js";
import { longInputAgentTest } from "./agents/long-input.js";
import { conversationIdLLMTest } from "./llm/conversation-id.js";
import { conversationIdAgentTest } from "./agents/conversation-id.js";
import { basicEmbeddingsTest } from "./embeddings/basic.js";

/**
 * All available test cases
 */
export const testCases = {
  llm: {
    basic: basicLLMTest,
    multiTurn: multiTurnLLMTest,
    basicError: basicErrorLLMTest,
    vision: visionLLMTest,
    longInput: longInputLLMTest,
    conversationId: conversationIdLLMTest,
  },
  agents: {
    basic: basicAgentTest,
    toolCall: toolCallAgentTest,
    toolError: toolErrorAgentTest,
    vision: visionAgentTest,
    longInput: longInputAgentTest,
    conversationId: conversationIdAgentTest,
  },
  embeddings: {
    basic: basicEmbeddingsTest,
  },
};

/**
 * Get all LLM test cases
 */
export function getLLMTests(): TestDefinition[] {
  return Object.values(testCases.llm);
}

/**
 * Get all agent test cases
 */
export function getAgentTests(): TestDefinition[] {
  return Object.values(testCases.agents);
}

/**
 * Get all embeddings test cases
 */
export function getEmbeddingsTests(): TestDefinition[] {
  return Object.values(testCases.embeddings);
}

/**
 * Get all test cases
 */
export function getAllTests(): TestDefinition[] {
  return [...getLLMTests(), ...getAgentTests(), ...getEmbeddingsTests()];
}

/**
 * Get test case by name
 */
export function getTestByName(name: string): TestDefinition | undefined {
  const allTests = getAllTests();
  return allTests.find((test) => test.name === name);
}
