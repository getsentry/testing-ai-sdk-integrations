/**
 * 10-binary-content-redaction: Binary Content Redaction Test
 *
 * Tests that when binary data (such as images) is sent to an LLM via LangGraph,
 * Sentry correctly redacts the binary content in the captured span data and
 * replaces it with a substitute marker ("[Blob substitute]").
 */

const { Sentry } = require("../setup");
const { ChatOpenAI } = require("@langchain/openai");
const { createReactAgent } = require("@langchain/langgraph/prebuilt");
const { HumanMessage } = require("@langchain/core/messages");
const { runTestCase } = require("../../_test-utils/test-runner.cjs");

/**
 * Creates a minimal valid PNG image (10x10 red square).
 * Returns base64-encoded PNG data.
 */
function createMinimalPng() {
  // Minimal 10x10 red PNG image (base64)
  // This is a pre-generated minimal valid PNG to avoid needing canvas/sharp dependencies
  const minimalPngBase64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mP8z8BQz0AEYBxVSF+FABJADveWkH6oAAAAAElFTkSuQmCC";
  
  return minimalPngBase64;
}

async function testLogic(inputs) {
  const { model, image_type } = inputs;

  // Create LLM instance
  const llm = new ChatOpenAI({
    modelName: model,
    apiKey: process.env.OPENAI_API_KEY,
  });

  // Create a simple react agent with no tools
  const agent = createReactAgent({ llm, tools: [] });

  // Create binary image data
  const base64Image = createMinimalPng();

  // Create message with image content using LangChain's multimodal format
  const message = new HumanMessage({
    content: [
      {
        type: "image_url",
        image_url: { url: `data:image/${image_type};base64,${base64Image}` },
      },
      {
        type: "text",
        text: "What color is this image? Answer in one word.",
      },
    ],
  });

  // Invoke the agent with image message
  const result = await agent.invoke({
    messages: [message],
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
      `    Sent image with ${base64Image.length} characters of base64 data`
    );
  }
}

module.exports = runTestCase("10-binary-content-redaction", testLogic, Sentry);
