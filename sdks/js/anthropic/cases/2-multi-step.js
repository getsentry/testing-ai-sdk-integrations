/**
 * 2-multi-step: Multi-step Conversation
 *
 * Tests a multi-step conversation with conversation history using Anthropic SDK
 * and verifies that Sentry captures all spans for both API calls.
 */

const { Sentry } = require("../setup");
const Anthropic = require("@anthropic-ai/sdk");
const { runTestCase } = require("../../_test-utils/test-runner.cjs");

async function testLogic(inputs) {
  const { model, system, first_prompt, second_prompt } = inputs;

  // Initialize Anthropic client
  const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });

  // First call
  const firstMessage = await anthropic.messages.create({
    model: model,
    max_tokens: 1024,
    system: system,
    messages: [
      {
        role: "user",
        content: first_prompt,
      },
    ],
  });

  if (!firstMessage.content || firstMessage.content.length === 0) {
    throw new Error("No completion returned from Anthropic (first call)");
  }

  const firstText = firstMessage.content[0].text;

  if (process.env.SENTRY_AI_TEST_VERBOSE === "true") {
    console.log(`    First response: ${firstText}`);
  }

  // Second call with conversation history
  const secondMessage = await anthropic.messages.create({
    model: model,
    max_tokens: 1024,
    system: system,
    messages: [
      {
        role: "user",
        content: first_prompt,
      },
      {
        role: "assistant",
        content: firstText,
      },
      {
        role: "user",
        content: second_prompt,
      },
    ],
  });

  if (!secondMessage.content || secondMessage.content.length === 0) {
    throw new Error("No completion returned from Anthropic (second call)");
  }

  const secondText = secondMessage.content[0].text;

  if (process.env.SENTRY_AI_TEST_VERBOSE === "true") {
    console.log(`    Second response: ${secondText}`);
  }
}

module.exports = runTestCase("2-multi-step", testLogic, Sentry);
