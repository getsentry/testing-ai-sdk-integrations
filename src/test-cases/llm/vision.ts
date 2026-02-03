/**
 * Vision LLM Test Case
 *
 * Tests sending an image (base64 encoded PNG) to the LLM to verify
 * multimodal input handling and Sentry span capture.
 */

import { TestDefinition } from "../../types.js";
import {
  checkChatSpanAttributes,
  checkValidTokenUsage,
  checkInputMessagesSchema,
  checkBinaryRedaction,
} from "../checks.js";

// Small 10x10 red PNG image encoded as base64
const TEST_IMAGE_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mP8z8BQz0AEYBxVSF+FABJADveWkH6oAAAAAElFTkSuQmCC";

export const visionLLMTest: TestDefinition = {
  name: "Vision LLM Test",
  description: "Send an image to the LLM and ask about its contents",
  type: "llm",

  inputs: [
    {
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are a helpful assistant that can analyze images. Be concise.",
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "What color is this image? Reply with just the color name.",
            },
            {
              type: "image",
              base64: TEST_IMAGE_BASE64,
              mediaType: "image/png",
            },
          ],
        },
      ],
    },
  ],

  checks: [
    checkChatSpanAttributes,
    checkValidTokenUsage,
    checkInputMessagesSchema,
    checkBinaryRedaction,
  ],
};

export default visionLLMTest;
