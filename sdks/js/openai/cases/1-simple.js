/**
 * 1-simple: Basic Completion
 *
 * Tests a simple chat completion request with OpenAI SDK
 * and verifies that Sentry captures the appropriate spans and AI monitoring data.
 */

const Sentry = require("@sentry/node");
const OpenAI = require("openai");
const { getMockSentryTransport } = require("../setup");
const { runTestCase } = require("../../_test-utils/sdk-helpers.cjs");

// Framework type for this SDK (low-level: direct LLM calls without agent wrappers)
const FRAMEWORK_TYPE = "low-level";

async function testLogic(inputs) {
  const { model, system, prompt } = inputs;

  // Create OpenAI client
  const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  // Make chat completion request
  const completion = await client.chat.completions.create({
    model: model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: prompt },
    ],
  });

  const text = completion.choices[0]?.message?.content;

  if (!text) {
    throw new Error("No completion returned from OpenAI");
  }

  // Only show response in verbose mode
  if (process.env.SENTRY_AI_TEST_VERBOSE === 'true') {
    console.log(`    Response: ${text}`);
  }
}

module.exports = runTestCase(
  "1-simple",
  FRAMEWORK_TYPE,
  testLogic,
  getMockSentryTransport,
  (spanOptions, callback) => Sentry.startSpan(spanOptions, callback),
  (timeout) => Sentry.flush(timeout)
);
