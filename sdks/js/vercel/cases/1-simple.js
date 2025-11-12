/**
 * 1-simple: Basic Completion
 *
 * Tests a simple chat completion request with Vercel AI SDK
 * and verifies that Sentry captures the appropriate spans and AI monitoring data.
 */

const { Sentry } = require("../setup");
const { generateText } = require("ai");
const { openai } = require("@ai-sdk/openai");
const { runTestCase } = require("../../_test-utils/test-runner.cjs");

async function testLogic(inputs) {
  const { model, system, prompt } = inputs;

  const { text } = await generateText({
    model: openai(model),
    system,
    prompt,
  });

  if (!text) {
    throw new Error("No completion returned from OpenAI");
  }

  if (process.env.SENTRY_AI_TEST_VERBOSE === "true") {
    console.log(`    Response: ${text}`);
  }
}

module.exports = runTestCase("1-simple", testLogic, Sentry);
