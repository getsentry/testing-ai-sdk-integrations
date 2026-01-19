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
const { ChatOpenAI } = require("@langchain/openai");
const { HumanMessage, AIMessage } = require("@langchain/core/messages");
const { runTestCase } = require("../../_test-utils/test-runner.cjs");

async function testLogic(inputs) {
  const { model, message_size_kb, message_count } = inputs;

  const chatModel = new ChatOpenAI({
    modelName: model,
    apiKey: process.env.OPENAI_API_KEY,
  });

  // Generate large message content (~9KB each)
  const contentSize = message_size_kb * 1024;
  const largeContent = "x".repeat(contentSize);

  // Create the messages array with large content
  // Alternate between HumanMessage and AIMessage to simulate conversation
  const messages = [];
  for (let i = 0; i < message_count; i++) {
    if (i % 2 === 0) {
      messages.push(new HumanMessage(`Message ${i + 1}: ${largeContent}`));
    } else {
      messages.push(new AIMessage(`Message ${i + 1}: ${largeContent}`));
    }
  }

  // Ensure the last message is from user (required by OpenAI API)
  if (messages[messages.length - 1] instanceof AIMessage) {
    messages.push(new HumanMessage("Please summarize what we discussed."));
  }

  const response = await chatModel.invoke(messages);

  const text = response.content;

  if (!text) {
    throw new Error("No completion returned from LangChain");
  }

  if (process.env.SENTRY_AI_TEST_VERBOSE === "true") {
    console.log(`    Response: ${text.substring(0, 100)}...`);
    console.log(`    Sent ${messages.length} messages with ~${message_size_kb}KB content each`);
  }
}

module.exports = runTestCase("9-message-truncation", testLogic, Sentry);
