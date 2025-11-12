/**
 * 1-simple: Basic Completion
 *
 * Tests a simple agent workflow request with LangGraph SDK
 * and verifies that Sentry captures the appropriate spans and AI monitoring data.
 */

const { Sentry } = require("../setup");
const { ChatOpenAI } = require("@langchain/openai");
const { createReactAgent } = require("@langchain/langgraph/prebuilt");
const { HumanMessage, SystemMessage } = require("@langchain/core/messages");
const { runTestCase } = require("../../_test-utils/test-runner.cjs");

async function testLogic(inputs) {
  const { model, system, prompt } = inputs;

  // Create LLM instance
  const llm = new ChatOpenAI({
    modelName: model,
    apiKey: process.env.OPENAI_API_KEY,
  });

  // Create a simple react agent with no tools
  const agent = createReactAgent({ llm, tools: [] });

  // Invoke the agent with system and user messages
  const result = await agent.invoke({
    messages: [new SystemMessage(system), new HumanMessage(prompt)],
  });

  // Extract the AI's response from the result
  const messages = result.messages;
  const lastMessage = messages[messages.length - 1];
  const text = lastMessage.content;

  if (!text) {
    throw new Error("No completion returned from LangGraph");
  }

  if (process.env.SENTRY_AI_TEST_VERBOSE === "true") {
    console.log(`    Response: ${text}`);
  }
}

module.exports = runTestCase("1-simple", testLogic, Sentry);
