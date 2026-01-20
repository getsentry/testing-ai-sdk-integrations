/**
 * 9-message-truncation: Message Truncation
 *
 * Tests that when large messages are sent to an LLM, Sentry correctly tracks
 * the original message count vs. the potentially truncated message count in the captured span data.
 */

const { Sentry } = require("../setup");
const { generateText } = require("ai");
const { openai } = require("@ai-sdk/openai");
const { runTestCase } = require("../../_test-utils/test-runner.cjs");

async function testLogic(inputs) {
  const { model, message_size_kb, message_count } = inputs;

  // Generate large content (~9KB each message)
  const largeContent = "A".repeat(message_size_kb * 1024);

  // Build a conversation with multiple large messages
  const messages = [];
  
  for (let i = 0; i < message_count; i++) {
    // Alternate between user and assistant messages to simulate a conversation
    messages.push({
      role: i % 2 === 0 ? "user" : "assistant",
      content: `Message ${i + 1}: ${largeContent}`,
    });
  }

  // Add final user message to prompt the model
  messages.push({
    role: "user",
    content: "Please provide a brief summary.",
  });

  const { text } = await generateText({
    model: openai(model),
    messages,
  });

  if (!text) {
    throw new Error("No completion returned from OpenAI");
  }

  if (process.env.SENTRY_AI_TEST_VERBOSE === "true") {
    console.log(`    Response: ${text}`);
    console.log(`    Sent ${messages.length} messages with large content`);
  }
}

module.exports = runTestCase("9-message-truncation", testLogic, Sentry);
