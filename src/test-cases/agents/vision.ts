/**
 * Vision Agent Test Case
 *
 * Tests an agentic workflow with image input.
 * Validates that Sentry captures agent spans when processing images.
 */

import { TestDefinition } from "../../types.js";
import {
  checkChatSpanAttributes,
  checkAgentSpanAttributes,
  checkValidTokenUsage,
  checkAgentHierarchy,
} from "../checks.js";

// Small 10x10 red PNG image encoded as base64
const TEST_IMAGE_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mP8z8BQz0AEYBxVSF+FABJADveWkH6oAAAAAElFTkSuQmCC";

export const visionAgentTest: TestDefinition = {
  name: "Vision Agent Test",
  description: "Agent that analyzes an image",
  type: "agent",

  // No tools needed for this test - just image analysis
  agent: {
    name: "vision_assistant",
    description:
      "An assistant that can analyze images and describe what it sees",
    tools: [],
  },

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
    checkAgentSpanAttributes,
    checkChatSpanAttributes,
    checkValidTokenUsage,
    checkAgentHierarchy,
  ],
};

export default visionAgentTest;
