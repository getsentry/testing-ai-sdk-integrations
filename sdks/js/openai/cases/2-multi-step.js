/**
 * 2-multi-step: Multi-step Conversation
 *
 * Tests a multi-step conversation with conversation history using OpenAI SDK
 * and verifies that Sentry captures all spans for both API calls.
 */

const { Sentry } = require("../setup");
const OpenAI = require("openai");
const { runTestCase } = require("../../_test-utils/test-runner.cjs");

async function testLogic(inputs) {
  const { model, system, first_prompt, second_prompt } = inputs;

  const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  // First call
  const firstCompletion = await client.chat.completions.create({
    model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: first_prompt },
    ],
  });

  const firstText = firstCompletion.choices[0]?.message?.content;

  if (!firstText) {
    throw new Error("No completion returned from OpenAI (first call)");
  }

  if (process.env.SENTRY_AI_TEST_VERBOSE === "true") {
    console.log(`    First response: ${firstText}`);
  }

  // Second call with conversation history
  const secondCompletion = await client.chat.completions.create({
    model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: first_prompt },
      { role: "assistant", content: firstText },
      { role: "user", content: second_prompt },
    ],
  });

  const secondText = secondCompletion.choices[0]?.message?.content;

  if (!secondText) {
    throw new Error("No completion returned from OpenAI (second call)");
  }

  if (process.env.SENTRY_AI_TEST_VERBOSE === "true") {
    console.log(`    Second response: ${secondText}`);
  }
}

module.exports = runTestCase("2-multi-step", testLogic, Sentry);
