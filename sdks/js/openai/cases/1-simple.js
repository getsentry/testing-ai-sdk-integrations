/**
 * 1-simple: Basic Completion
 *
 * Tests a simple chat completion request with OpenAI SDK
 * and verifies that Sentry captures the appropriate spans and AI monitoring data.
 */

const { Sentry } = require("../setup");
const OpenAI = require("openai");
const { runTestCase } = require("../../_test-utils/test-runner.cjs");

const FRAMEWORK_TYPE = "low-level";

async function testLogic(inputs) {
  const { model, system, prompt } = inputs;

  const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  const completion = await client.chat.completions.create({
    model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: prompt },
    ],
  });

  const text = completion.choices[0]?.message?.content;

  if (!text) {
    throw new Error("No completion returned from OpenAI");
  }

  if (process.env.SENTRY_AI_TEST_VERBOSE === "true") {
    console.log(`    Response: ${text}`);
  }
}

module.exports = runTestCase("1-simple", FRAMEWORK_TYPE, testLogic, Sentry);
