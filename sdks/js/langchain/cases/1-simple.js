/**
 * 1-simple: Basic Completion
 *
 * Tests a simple chat completion request with LangChain SDK
 * and verifies that Sentry captures the appropriate spans and AI monitoring data.
 */

const { Sentry } = require("../setup");
const { ChatOpenAI } = require("@langchain/openai");
const { HumanMessage, SystemMessage } = require("@langchain/core/messages");
const { runTestCase } = require("../../_test-utils/test-runner.cjs");

const FRAMEWORK_TYPE = "low-level";

async function testLogic(inputs) {
  const { model, system, prompt } = inputs;

  const chatModel = new ChatOpenAI({
    modelName: model,
    apiKey: process.env.OPENAI_API_KEY,
  });

  const messages = [
    new SystemMessage(system),
    new HumanMessage(prompt),
  ];

  const response = await chatModel.invoke(messages);

  const text = response.content;

  if (!text) {
    throw new Error("No completion returned from LangChain");
  }

  if (process.env.SENTRY_AI_TEST_VERBOSE === "true") {
    console.log(`    Response: ${text}`);
  }
}

module.exports = runTestCase("1-simple", FRAMEWORK_TYPE, testLogic, Sentry);
