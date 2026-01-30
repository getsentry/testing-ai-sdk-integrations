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
import { basicAgentTest } from "./agents/basic.js";
import { visionAgentTest } from "./agents/vision.js";

/**
 * All available test cases
 */
export const testCases = {
  llm: {
    basic: basicLLMTest,
    multiTurn: multiTurnLLMTest,
    basicError: basicErrorLLMTest,
    vision: visionLLMTest,
  },
  agents: {
    basic: basicAgentTest,
    vision: visionAgentTest,
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
 * Get all test cases
 */
export function getAllTests(): TestDefinition[] {
  return [...getLLMTests(), ...getAgentTests()];
}

/**
 * Get test case by name
 */
export function getTestByName(name: string): TestDefinition | undefined {
  const allTests = getAllTests();
  return allTests.find((test) => test.name === name);
}
