/**
 * 2-multi-step: Multi-step Conversation
 *
 * Tests a multi-step conversation with conversation history using Vercel AI SDK
 * and verifies that Sentry captures all spans for both API calls.
 */

const { Sentry } = require("../setup");
const { generateText } = require("ai");
const { openai } = require("@ai-sdk/openai");
const { runTestCase } = require("../../_test-utils/test-runner.cjs");

async function testLogic(inputs) {
  const { model, system, first_prompt, second_prompt } = inputs;

  // First call
  const firstResult = await generateText({
    model: openai(model),
    system,
    prompt: first_prompt,
  });

  const firstText = firstResult.text;

  if (!firstText) {
    throw new Error("No completion returned from Vercel AI (first call)");
  }

  if (process.env.SENTRY_AI_TEST_VERBOSE === "true") {
    console.log(`    First response: ${firstText}`);
  }

  // Second call with conversation history
  const secondResult = await generateText({
    model: openai(model),
    system,
    messages: [
      { role: "user", content: first_prompt },
      { role: "assistant", content: firstText },
      { role: "user", content: second_prompt },
    ],
  });

  const secondText = secondResult.text;

  if (!secondText) {
    throw new Error("No completion returned from Vercel AI (second call)");
  }

  if (process.env.SENTRY_AI_TEST_VERBOSE === "true") {
    console.log(`    Second response: ${secondText}`);
  }
}

module.exports = runTestCase("2-multi-step", testLogic, Sentry);
