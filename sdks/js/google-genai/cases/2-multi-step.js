/**
 * 2-multi-step: Multi-step Conversation
 *
 * Tests a multi-step conversation with conversation history using Google GenAI SDK
 * and verifies that Sentry captures all spans for both API calls.
 */

const { Sentry } = require("../setup");
const { GoogleGenAI } = require("@google/genai");
const { runTestCase } = require("../../_test-utils/test-runner.cjs");

async function testLogic(inputs) {
  const { model, system, first_prompt, second_prompt } = inputs;

  const client = new GoogleGenAI({
    apiKey: process.env.GOOGLE_GENAI_API_KEY,
  });

  // First call
  const firstResponse = await client.models.generateContent({
    model,
    contents: first_prompt,
    config: {
      systemInstruction: [system],
    },
  });

  const firstText = firstResponse.text;

  if (!firstText) {
    throw new Error("No completion returned from Google GenAI (first call)");
  }

  if (process.env.SENTRY_AI_TEST_VERBOSE === "true") {
    console.log(`    First response: ${firstText}`);
  }

  // Second call with conversation history
  const secondResponse = await client.models.generateContent({
    model,
    contents: [
      { role: "user", parts: [{ text: first_prompt }] },
      { role: "model", parts: [{ text: firstText }] },
      { role: "user", parts: [{ text: second_prompt }] },
    ],
    config: {
      systemInstruction: [system],
    },
  });

  const secondText = secondResponse.text;

  if (!secondText) {
    throw new Error("No completion returned from Google GenAI (second call)");
  }

  if (process.env.SENTRY_AI_TEST_VERBOSE === "true") {
    console.log(`    Second response: ${secondText}`);
  }
}

module.exports = runTestCase("2-multi-step", testLogic, Sentry);
