/**
 * 9-message-truncation: Message Truncation
 *
 * Tests that large messages are properly truncated while preserving the original message count.
 * Sends multiple large messages (~9KB each) and verifies that Sentry captures:
 * - gen_ai.request.messages.original_length (the actual count of messages sent)
 * - gen_ai.request.messages array (potentially truncated for telemetry)
 * - The relationship: len(messages) <= original_length
 */

const { Sentry } = require("../setup");
const { GoogleGenAI } = require("@google/genai");
const { runTestCase } = require("../../_test-utils/test-runner.cjs");

async function testLogic(inputs) {
  const { model, message_size_kb, message_count } = inputs;

  const client = new GoogleGenAI({
    apiKey: process.env.GOOGLE_GENAI_API_KEY,
  });

  // Generate large content for each message (~9KB each)
  const contentSize = message_size_kb * 1024;
  const largeContent = "x".repeat(contentSize);

  // Build a large prompt with multiple "messages" embedded
  // Google GenAI treats contents as a single string or array of Content objects
  // For testing message truncation, we'll embed multiple messages in the prompt
  const promptParts = [];
  for (let i = 0; i < message_count; i++) {
    promptParts.push(`Message ${i + 1}: ${largeContent}`);
  }

  const largePrompt = promptParts.join("\n\n") + "\n\nPlease summarize the above messages briefly.";

  const response = await client.models.generateContent({
    model,
    contents: largePrompt,
  });

  const text = response.text;

  if (!text) {
    throw new Error("No completion returned from Google GenAI");
  }

  if (process.env.SENTRY_AI_TEST_VERBOSE === "true") {
    console.log(`    Response: ${text.substring(0, 100)}...`);
    console.log(`    Sent ${message_count} messages with ~${message_size_kb}KB content each`);
  }
}

module.exports = runTestCase("9-message-truncation", testLogic, Sentry);
