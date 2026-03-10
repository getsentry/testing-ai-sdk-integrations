/**
 * Conversation ID Agent Test Case
 *
 * Tests that gen_ai.conversation.id is correctly set on spans when
 * interleaving two agent conversations (A, B, A, B).
 *
 * Uses sentry_sdk.ai.set_conversation_id() (Python) to set the
 * conversation ID before each agent invocation.
 */

import { TestDefinition } from "../../types.js";
import {
  checkChatSpanAttributes,
  checkAgentSpanAttributes,
  checkValidTokenUsage,
  checkAgentHierarchy,
  checkInputMessagesSchema,
  checkConversationIds,
  checkResponseModel,
} from "../checks.js";

export const conversationIdAgentTest: TestDefinition = {
  name: "Conversation ID Agent Test",
  description:
    "Two interleaved agent conversations (A, B, A, B) with distinct conversation IDs",
  type: "agent",

  agent: {
    name: "helpful_assistant",
    description: "A helpful assistant that answers questions",
    tools: [],
  },

  inputs: [
    // Turn A1: First message in conversation A
    {
      model: "gpt-4o-mini",
      conversationId: "conv-a",
      messages: [
        { role: "user", content: "What is the capital of France?" },
      ],
    },
    // Turn B1: First message in conversation B
    {
      model: "gpt-4o-mini",
      conversationId: "conv-b",
      messages: [{ role: "user", content: "What is 2 + 2?" }],
    },
    // Turn A2: Follow-up in conversation A
    {
      model: "gpt-4o-mini",
      conversationId: "conv-a",
      messages: [{ role: "user", content: "What about Germany?" }],
    },
    // Turn B2: Follow-up in conversation B
    {
      model: "gpt-4o-mini",
      conversationId: "conv-b",
      messages: [{ role: "user", content: "What about 3 + 3?" }],
    },
  ],

  criticalChecks: [
    checkAgentSpanAttributes,
    checkChatSpanAttributes,
    checkAgentHierarchy,
    checkConversationIds(["conv-a", "conv-b", "conv-a", "conv-b"]),
  ],

  checks: [checkValidTokenUsage, checkInputMessagesSchema],

  warningChecks: [checkResponseModel],
};

export default conversationIdAgentTest;
