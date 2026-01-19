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
const Anthropic = require("@anthropic-ai/sdk");
const { runTestCase } = require("../../_test-utils/test-runner.cjs");

async function testLogic(inputs) {
  const { model, message_size_kb, message_count } = inputs;

  // Initialize Anthropic client
  const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });

  // Generate large message content (~9KB each)
  // Using approximately 1 character per byte for ASCII
  const contentSize = message_size_kb * 1024;
  const largeContent = "A".repeat(contentSize);

  // Build messages array with alternating user/assistant messages
  // Anthropic requires conversation to alternate between user and assistant
  const messages = [];
  for (let i = 0; i < message_count; i++) {
    if (i % 2 === 0) {
      // User messages
      messages.push({
        role: "user",
        content: `Message ${i + 1}: ${largeContent}`,
      });
    } else {
      // Assistant messages (for conversation history)
      messages.push({
        role: "assistant",
        content: `Message ${i + 1}: ${largeContent}`,
      });
    }
  }

  // Ensure the last message is from user (required by Anthropic)
  if (messages[messages.length - 1].role === "assistant") {
    messages.push({
      role: "user",
      content: "Please summarize what we discussed.",
    });
  }

  // Make the API call with large messages
  const message = await anthropic.messages.create({
    model: model,
    max_tokens: 1024,
    messages: messages,
  });

  if (!message.content || message.content.length === 0) {
    throw new Error("No completion returned from Anthropic");
  }

  if (process.env.SENTRY_AI_TEST_VERBOSE === "true") {
    console.log(`    Response: ${JSON.stringify(message.content[0])}`);
    console.log(
      `    Sent ${messages.length} messages with ~${message_size_kb}KB each`
    );
  }
}

module.exports = runTestCase("9-message-truncation", testLogic, Sentry);
