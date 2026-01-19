/**
 * 10-binary-content-redaction: Binary Content Redaction
 *
 * Tests that binary image data is properly redacted in Sentry spans.
 * Sends a message with a base64-encoded image and verifies that Sentry:
 * - Captures the message structure
 * - Redacts the binary content with "[Blob substitute]" marker
 * - Does not send raw binary data to Sentry
 */

const { Sentry } = require("../setup");
const { ChatOpenAI } = require("@langchain/openai");
const { HumanMessage } = require("@langchain/core/messages");
const { runTestCase } = require("../../_test-utils/test-runner.cjs");

async function testLogic(inputs) {
  const { model, image_type } = inputs;

  const chatModel = new ChatOpenAI({
    modelName: model,
    apiKey: process.env.OPENAI_API_KEY,
  });

  // Create a small base64-encoded image (1x1 pixel PNG)
  // This is a valid 1x1 transparent PNG image
  const base64Image =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

  // LangChain uses a specific format for multimodal messages with images
  // The content is an array with text and image_url objects
  const message = new HumanMessage({
    content: [
      {
        type: "text",
        text: "What color is this image? Answer in one word.",
      },
      {
        type: "image_url",
        image_url: {
          url: `data:image/${image_type};base64,${base64Image}`,
        },
      },
    ],
  });

  const response = await chatModel.invoke([message]);

  const text = response.content;

  if (!text) {
    throw new Error("No completion returned from LangChain");
  }

  if (process.env.SENTRY_AI_TEST_VERBOSE === "true") {
    console.log(`    Response: ${text}`);
    console.log(`    Sent message with base64-encoded ${image_type} image`);
  }
}

module.exports = runTestCase("10-binary-content-redaction", testLogic, Sentry);
