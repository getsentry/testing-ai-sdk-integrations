/**
 * 1-simple: Basic Completion
 *
 * Tests a simple chat completion request with Vercel AI SDK
 * and verifies that Sentry captures the appropriate spans and AI monitoring data.
 */

const Sentry = require("@sentry/node");
const { generateText } = require("ai");
const { openai } = require("@ai-sdk/openai");
const { getMockSentryTransport } = require("../setup");
const { runTestCase } = require("../../_test-utils/sdk-helpers.cjs");

// Framework type for this SDK (agentic: produces agent wrapper spans)
const FRAMEWORK_TYPE = "agentic";

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
