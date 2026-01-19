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
const OpenAI = require("openai");
const { runTestCase } = require("../../_test-utils/test-runner.cjs");

async function testLogic(inputs) {
  const { model, image_type } = inputs;

  const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  // Create a small base64-encoded image (1x1 pixel PNG)
  // This is a valid 1x1 transparent PNG image
  const base64Image =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

  // Use OpenAI's vision API format (multimodal message)
  // Note: Using gpt-4-vision-preview or gpt-4o for vision support
  // The fixture uses gpt-5-nano but we'll let the test runner handle model override
  const completion = await client.chat.completions.create({
    model,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "What do you see in this image?",
          },
          {
            type: "image_url",
            image_url: {
              url: `data:image/${image_type};base64,${base64Image}`,
            },
          },
        ],
      },
    ],
  });

  const text = completion.choices[0]?.message?.content;

  if (!text) {
    throw new Error("No completion returned from OpenAI");
  }

  if (process.env.SENTRY_AI_TEST_VERBOSE === "true") {
    console.log(`    Response: ${text}`);
    console.log(`    Sent message with base64-encoded ${image_type} image`);
  }
}

module.exports = runTestCase("10-binary-content-redaction", testLogic, Sentry);
