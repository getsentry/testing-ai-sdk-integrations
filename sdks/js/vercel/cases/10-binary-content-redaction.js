/**
 * 10-binary-content-redaction: Binary Content Redaction
 *
 * Tests that when binary data (such as images) is sent to an LLM, Sentry correctly
 * redacts the binary content in the captured span data and replaces it with a substitute marker.
 */

const { Sentry } = require("../setup");
const { generateText } = require("ai");
const { openai } = require("@ai-sdk/openai");
const { runTestCase } = require("../../_test-utils/test-runner.cjs");

async function testLogic(inputs) {
  const { model, image_type } = inputs;

  // Create a small binary image (1x1 pixel PNG)
  // This is a valid 1x1 transparent PNG in base64
  const smallPngBase64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

  // Convert to Buffer for binary representation
  const imageBuffer = Buffer.from(smallPngBase64, "base64");

  // Send a multimodal message with image content
  const { text } = await generateText({
    model: openai(model),
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Describe this image briefly.",
          },
          {
            type: "image",
            image: imageBuffer,
          },
        ],
      },
    ],
  });

  if (!text) {
    throw new Error("No completion returned from OpenAI");
  }

  if (process.env.SENTRY_AI_TEST_VERBOSE === "true") {
    console.log(`    Response: ${text}`);
    console.log(`    Sent image of type: ${image_type}`);
  }
}

module.exports = runTestCase("10-binary-content-redaction", testLogic, Sentry);
