/**
 * Conversation ID LLM Test Case
 *
 * Tests that gen_ai.conversation.id is correctly set on spans when
 * interleaving two conversations (A, B, A, B).
 *
 * Uses sentry_sdk.ai.set_conversation_id() (Python) to set the
 * conversation ID before each API call.
 */

import { TestDefinition } from "../../types.js";
import {
  checkAISpanCount,
  checkChatSpanAttributes,
  checkValidTokenUsage,
  checkInputMessagesSchema,
  checkConversationIdPresent,
  checkConversationIdInterleaving,
  checkResponseModel,
} from "../checks.js";

export const conversationIdLLMTest: TestDefinition = {
  name: "Conversation ID LLM Test",
  description:
    "Two interleaved conversations (A, B, A, B) with distinct conversation IDs",
  type: "llm",

  inputs: [
    // Turn A1: First message in conversation A
    {
      model: "gpt-5-nano",
      conversationId: "conv-a",
      messages: [
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: "What is the capital of France?" },
      ],
    },
    // Turn B1: First message in conversation B
    {
      model: "gpt-5-nano",
      conversationId: "conv-b",
      messages: [
        { role: "system", content: "You are a math tutor." },
        { role: "user", content: "What is 2 + 2?" },
      ],
    },
    // Turn A2: Follow-up in conversation A
    {
      model: "gpt-5-nano",
      conversationId: "conv-a",
      messages: [
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: "What is the capital of France?" },
        { role: "assistant", content: "The capital of France is Paris." },
        { role: "user", content: "What about Germany?" },
      ],
    },
    // Turn B2: Follow-up in conversation B
    {
      model: "gpt-5-nano",
      conversationId: "conv-b",
      messages: [
        { role: "system", content: "You are a math tutor." },
        { role: "user", content: "What is 2 + 2?" },
        { role: "assistant", content: "2 + 2 equals 4." },
        { role: "user", content: "What about 3 + 3?" },
      ],
    },
  ],

  criticalChecks: [
    checkAISpanCount(4),
    checkChatSpanAttributes,
    checkConversationIdPresent,
  ],

  checks: [
    checkConversationIdInterleaving,
    checkValidTokenUsage,
    checkInputMessagesSchema,
  ],

  warningChecks: [checkResponseModel],
};

export default conversationIdLLMTest;
