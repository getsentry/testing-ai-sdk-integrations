/**
 * 1-simple: Basic Completion
 *
 * Tests a simple chat completion request with Anthropic AI SDK
 * and verifies that Sentry captures the appropriate spans and AI monitoring data.
 */

const { Sentry } = require("../setup");
const Anthropic = require("@anthropic-ai/sdk");
const { runTestCase } = require("../../_test-utils/test-runner.cjs");

async function testLogic(inputs) {
  const { model, system, prompt } = inputs;

  // Initialize Anthropic client
  const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });

  // Make the API call
  const message = await anthropic.messages.create({
    model: model,
    max_tokens: 1024,
    system: system,
    messages: [
      {
        role: "user",
        content: prompt,
      },
    ],
  });

  if (!message.content || message.content.length === 0) {
    throw new Error("No completion returned from Anthropic");
  }

  if (process.env.SENTRY_AI_TEST_VERBOSE === "true") {
    console.log(`    Response: ${JSON.stringify(message.content[0])}`);
  }
}

module.exports = runTestCase("1-simple", testLogic, Sentry);
