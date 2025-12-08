/**
 * 1-simple: Basic Completion
 *
 * Tests a simple chat completion request with Google GenAI SDK
 * and verifies that Sentry captures the appropriate spans and AI monitoring data.
 */

const { Sentry } = require("../setup");
const { GoogleGenAI } = require("@google/genai");
const { runTestCase } = require("../../_test-utils/test-runner.cjs");

async function testLogic(inputs) {
  const { model, prompt, system } = inputs;

  const client = new GoogleGenAI({
    apiKey: process.env.GOOGLE_GENAI_API_KEY,
  });

  const response = await client.models.generateContent({
    model,
    contents: prompt,
    config: {
      systemInstruction: [ system ],
    },
  });

  const text = response.text;

  if (!text) {
    throw new Error("No completion returned from Google GenAI");
  }

  if (process.env.SENTRY_AI_TEST_VERBOSE === "true") {
    console.log(`    Response: ${text}`);
  }
}

module.exports = runTestCase("1-simple", testLogic, Sentry);
