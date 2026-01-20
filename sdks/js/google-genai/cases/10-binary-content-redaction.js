/**
 * 10-binary-content-redaction: Binary Content Redaction
 *
 * Tests that binary image data is properly redacted in Sentry spans.
 * Sends a message with binary image data and verifies that Sentry:
 * - Captures the message structure
 * - Redacts the binary content with "[Blob substitute]" marker
 * - Does not send raw binary data to Sentry
 */

const { Sentry } = require("../setup");
const { GoogleGenAI } = require("@google/genai");
const { runTestCase } = require("../../_test-utils/test-runner.cjs");

async function testLogic(inputs) {
  const { model, image_type } = inputs;

  const client = new GoogleGenAI({
    apiKey: process.env.GOOGLE_GENAI_API_KEY,
  });

  // Create a small base64-encoded image (1x1 pixel PNG)
  // This is a valid 1x1 transparent PNG image
  const base64Image =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

  // Convert base64 to binary data
  const imageData = Buffer.from(base64Image, "base64");

  // Google GenAI accepts inline data as part of the contents array
  // Contents can be an array of Part objects with inlineData or text
  const response = await client.models.generateContent({
    model,
    contents: [
      {
        inlineData: {
          mimeType: `image/${image_type}`,
          data: base64Image,
        },
      },
      {
        text: "What do you see in this image? Describe briefly.",
      },
    ],
  });

  const text = response.text;

  if (!text) {
    throw new Error("No completion returned from Google GenAI");
  }

  if (process.env.SENTRY_AI_TEST_VERBOSE === "true") {
    console.log(`    Response: ${text}`);
    console.log(`    Sent message with base64-encoded ${image_type} image (${imageData.length} bytes)`);
  }
}

module.exports = runTestCase("10-binary-content-redaction", testLogic, Sentry);
