/**
 * 10-binary-content-redaction: Binary Content Redaction Test
 *
 * Tests that when binary data (such as images) is sent to an LLM via Anthropic,
 * Sentry correctly redacts the binary content in the captured span data and
 * replaces it with a substitute marker ("[Blob substitute]").
 */

const { Sentry } = require("../setup");
const Anthropic = require("@anthropic-ai/sdk");
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

  // Initialize Anthropic client
  const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });

  // Create binary image data
  const base64Image = createMinimalPng();

  // Anthropic uses a specific content block format for images
  // See: https://docs.anthropic.com/en/docs/build-with-claude/vision
  const message = await anthropic.messages.create({
    model: model,
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: `image/${image_type}`,
              data: base64Image,
            },
          },
          {
            type: "text",
            text: "What color is this image? Answer in one word.",
          },
        ],
      },
    ],
  });

  if (!message.content || message.content.length === 0) {
    throw new Error("No completion returned from Anthropic");
  }

  if (process.env.SENTRY_AI_TEST_VERBOSE === "true") {
    console.log(`    Response: ${JSON.stringify(message.content[0])}`);
    console.log(
      `    Sent image with ${base64Image.length} characters of base64 data`
    );
  }
}

module.exports = runTestCase("10-binary-content-redaction", testLogic, Sentry);
