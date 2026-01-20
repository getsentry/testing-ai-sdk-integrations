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
const { createReactAgent } = require("@langchain/langgraph/prebuilt");
const { HumanMessage } = require("@langchain/core/messages");
const { runTestCase } = require("../../_test-utils/test-runner.cjs");

async function testLogic(inputs) {
  const { model, message_size_kb, message_count } = inputs;

  // Create LLM instance
  const llm = new ChatOpenAI({
    modelName: model,
    apiKey: process.env.OPENAI_API_KEY,
  });

  // Create a simple react agent with no tools
  const agent = createReactAgent({ llm, tools: [] });

  // Generate large message content (~9KB each)
  // Using approximately 1 character per byte for ASCII
  const contentSize = message_size_kb * 1024;
  const largeContent = "A".repeat(contentSize);

  // Build messages array with multiple large messages
  const messages = [];
  for (let i = 0; i < message_count; i++) {
    messages.push(new HumanMessage(`Message ${i + 1}: ${largeContent}`));
  }

  // Invoke the agent with large messages
  const result = await agent.invoke({
    messages: messages,
  });

  // Extract the AI's response from the result
  const resultMessages = result.messages;
  const lastMessage = resultMessages[resultMessages.length - 1];
  const text = lastMessage.content;

  if (!text) {
    throw new Error("No completion returned from LangGraph");
  }

  if (process.env.SENTRY_AI_TEST_VERBOSE === "true") {
    console.log(`    Response: ${text}`);
    console.log(
      `    Sent ${messages.length} messages with ~${message_size_kb}KB each`
    );
  }
}

module.exports = runTestCase("9-message-truncation", testLogic, Sentry);
