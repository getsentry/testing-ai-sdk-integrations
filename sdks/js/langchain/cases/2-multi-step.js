/**
 * 2-multi-step: Multi-step Conversation
 *
 * Tests a multi-step conversation with conversation history using LangChain SDK
 * and verifies that Sentry captures all spans for both API calls.
 */

const { Sentry } = require("../setup");
const { ChatOpenAI } = require("@langchain/openai");
const { HumanMessage, SystemMessage, AIMessage } = require("@langchain/core/messages");
const { runTestCase } = require("../../_test-utils/test-runner.cjs");

async function testLogic(inputs) {
  const { model, system, first_prompt, second_prompt } = inputs;

  const chatModel = new ChatOpenAI({
    modelName: model,
    apiKey: process.env.OPENAI_API_KEY,
  });

  // First call
  const firstMessages = [
    new SystemMessage(system),
    new HumanMessage(first_prompt),
  ];

  const firstResponse = await chatModel.invoke(firstMessages);
  const firstText = firstResponse.content;

  if (!firstText) {
    throw new Error("No completion returned from LangChain (first call)");
  }

  if (process.env.SENTRY_AI_TEST_VERBOSE === "true") {
    console.log(`    First response: ${firstText}`);
  }

  // Second call with conversation history
  const secondMessages = [
    new SystemMessage(system),
    new HumanMessage(first_prompt),
    new AIMessage(firstText),
    new HumanMessage(second_prompt),
  ];

  const secondResponse = await chatModel.invoke(secondMessages);
  const secondText = secondResponse.content;

  if (!secondText) {
    throw new Error("No completion returned from LangChain (second call)");
  }

  if (process.env.SENTRY_AI_TEST_VERBOSE === "true") {
    console.log(`    Second response: ${secondText}`);
  }
}

module.exports = runTestCase("2-multi-step", testLogic, Sentry);
