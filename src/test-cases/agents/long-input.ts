/**
 * Long Input Agent Test Case
 *
 * Tests that very long user messages (>20KB) trigger proper trimming
 * of gen_ai.request.messages in the Sentry span data for agentic frameworks.
 *
 * Sentry SDKs trim long messages to prevent excessive span sizes.
 * This test validates:
 * 1. The message content is trimmed (less than original size)
 * 2. Metadata about trimming is present (original_length)
 * 3. Basic attributes are still captured correctly
 * 4. Token counts reflect the actual (untrimmed) input
 */

import { TestDefinition } from "../../types.js";
import {
  checkChatSpanAttributes,
  checkAgentSpanAttributes,
  checkMessageTrimming,
  checkTrimmingMetadata,
  checkAgentHierarchy,
  checkInputMessagesSchema,
} from "../checks.js";
import {
  checkInputMessages,
  checkOutputMessages,
} from "../otel-checks.js";

// Generate a long message that exceeds 20KB
// We'll repeat a pattern to create predictable content
const LONG_MESSAGE_PATTERN =
  "This is a test message that will be repeated many times to create a very long input. ";
const REPETITIONS = 300; // ~25KB of text (85 chars * 300 = 25,500 bytes)
const LONG_MESSAGE = LONG_MESSAGE_PATTERN.repeat(REPETITIONS);

export const longInputAgentTest: TestDefinition = {
  name: "Long Input Agent Test",
  description: "Tests message trimming for agent inputs > 20KB",
  type: "agent",

  // Simple agent with a tool - the focus is on the long input, not tool usage
  agent: {
    name: "summarizer_assistant",
    description: "An assistant that can summarize text",
    tools: [
      {
        name: "get_word_count",
        description: "Count the number of words in a text",
        parameters: {
          type: "object",
          properties: {
            text: {
              type: "string",
              description: "The text to count words in",
            },
          },
          required: ["text"],
        },
        arguments: { text: "sample text" },
        result: 2400, // Approximate word count for our long message
      },
    ],
  },

  inputs: [
    {
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: `Please summarize the following text in one sentence. You may use the get_word_count tool first if needed: ${LONG_MESSAGE}`,
        },
      ],
    },
  ],

  checks: [
    checkAgentSpanAttributes,
    checkChatSpanAttributes,
    checkMessageTrimming,
    checkTrimmingMetadata,
    checkAgentHierarchy,
    checkInputMessagesSchema,
    // OTel-aligned checks (soft failure if not migrated)
    checkInputMessages,
    checkOutputMessages,
  ],
};

export default longInputAgentTest;
