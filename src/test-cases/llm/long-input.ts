/**
 * Long Input LLM Test Case
 *
 * Tests that very long user messages (>20KB) trigger proper trimming
 * of gen_ai.request.messages in the Sentry span data.
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
  checkMessageTrimming,
  checkTrimmingMetadata,
  checkInputMessagesSchema,
} from "../checks.js";

// Generate a long message that exceeds 20KB
// We'll repeat a pattern to create predictable content
const LONG_MESSAGE_PATTERN =
  "This is a test message that will be repeated many times to create a very long input. ";
const REPETITIONS = 300; // ~25KB of text (85 chars * 300 = 25,500 bytes)
const LONG_MESSAGE = LONG_MESSAGE_PATTERN.repeat(REPETITIONS);

export const longInputLLMTest: TestDefinition = {
  name: "Long Input LLM Test",
  description: "Tests message trimming for inputs > 20KB",
  type: "llm",

  inputs: [
    {
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are a helpful assistant. Respond briefly.",
        },
        {
          role: "user",
          content: `Summarize this in one sentence: ${LONG_MESSAGE}`,
        },
      ],
    },
  ],

  checks: [
    checkChatSpanAttributes,
    checkMessageTrimming,
    checkTrimmingMetadata,
    checkInputMessagesSchema,
  ],
};

export default longInputLLMTest;
