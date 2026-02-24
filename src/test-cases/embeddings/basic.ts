/**
 * Basic Embeddings Test Case
 *
 * Tests a single embedding call with text input.
 * Validates that Sentry captures the gen_ai embedding span correctly.
 */

import { TestDefinition } from "../../types.js";
import {
  checkAISpanCount,
  checkEmbeddingSpanAttributes,
  checkEmbeddingTokenUsage,
  checkResponseModel,
} from "../checks.js";

export const basicEmbeddingsTest: TestDefinition = {
  name: "Basic Embeddings Test",
  description: "Single embedding call with text input",
  type: "embeddings",

  inputs: [
    {
      model: "text-embedding-3-small",
      input: "What is the capital of France?",
    },
  ],

  criticalChecks: [
    checkAISpanCount(1),
    checkEmbeddingSpanAttributes,
  ],

  checks: [
    checkEmbeddingTokenUsage,
  ],

  warningChecks: [
    checkResponseModel,
  ],
};

export default basicEmbeddingsTest;
