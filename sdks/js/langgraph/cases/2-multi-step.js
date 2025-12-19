/**
 * 2-multi-step: Multi-step Conversation
 *
 * Tests a multi-step conversation with conversation history using LangGraph SDK
 * and verifies that Sentry captures all spans for both API calls.
 */

const { Sentry } = require("../setup");
const { ChatOpenAI } = require("@langchain/openai");
const { createReactAgent } = require("@langchain/langgraph/prebuilt");
const {
  HumanMessage,
  SystemMessage,
  AIMessage,
} = require("@langchain/core/messages");
const { runTestCase } = require("../../_test-utils/test-runner.cjs");

async function testLogic(inputs) {
  const { model, system, first_prompt, second_prompt } = inputs;

  // Create LLM instance
  const llm = new ChatOpenAI({
    modelName: model,
    apiKey: process.env.OPENAI_API_KEY,
  });

  // Create a simple react agent with no tools
  const agent = createReactAgent({ llm, tools: [] });

  // First call
  const firstResult = await agent.invoke({
    messages: [new SystemMessage(system), new HumanMessage(first_prompt)],
  });

  const firstMessages = firstResult.messages;
  const firstLastMessage = firstMessages[firstMessages.length - 1];
  const firstText = firstLastMessage.content;

  if (!firstText) {
    throw new Error("No completion returned from LangGraph (first call)");
  }

  if (process.env.SENTRY_AI_TEST_VERBOSE === "true") {
    console.log(`    First response: ${firstText}`);
  }

  // Second call with conversation history
  const secondResult = await agent.invoke({
    messages: [
      new SystemMessage(system),
      new HumanMessage(first_prompt),
      new AIMessage(firstText),
      new HumanMessage(second_prompt),
    ],
  });

  const secondMessages = secondResult.messages;
  const secondLastMessage = secondMessages[secondMessages.length - 1];
  const secondText = secondLastMessage.content;

  if (!secondText) {
    throw new Error("No completion returned from LangGraph (second call)");
  }

  if (process.env.SENTRY_AI_TEST_VERBOSE === "true") {
    console.log(`    Second response: ${secondText}`);
  }
}

module.exports = runTestCase("2-multi-step", testLogic, Sentry);
