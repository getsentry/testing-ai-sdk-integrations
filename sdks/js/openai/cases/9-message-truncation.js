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
const OpenAI = require("openai");
const { runTestCase } = require("../../_test-utils/test-runner.cjs");

async function testLogic(inputs) {
  const { model, message_size_kb, message_count } = inputs;

  const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  // Generate large message content (~9KB each)
  // Using approximately 9 characters per byte (rough estimate for ASCII)
  const contentSize = message_size_kb * 1024;
  const largeContent = "A".repeat(contentSize);

  // Build messages array with multiple large messages
  const messages = [];
  for (let i = 0; i < message_count; i++) {
    messages.push({
      role: "user",
      content: `Message ${i + 1}: ${largeContent}`,
    });
  }

  const completion = await client.chat.completions.create({
    model,
    messages,
  });

  const text = completion.choices[0]?.message?.content;

  if (!text) {
    throw new Error("No completion returned from OpenAI");
  }

  if (process.env.SENTRY_AI_TEST_VERBOSE === "true") {
    console.log(`    Response: ${text}`);
    console.log(`    Sent ${messages.length} messages with ~${message_size_kb}KB each`);
  }
}

module.exports = runTestCase("9-message-truncation", testLogic, Sentry);
