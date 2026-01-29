/**
 * Basic LLM Test Case
 * 
 * Tests a simple completion call with system message and user prompt.
 * Validates that Sentry captures the gen_ai span correctly.
 */

import { assert, expect } from 'chai';
import { TestDefinition, CapturedSpan, FrameworkConfig } from '../../types.js';
import {
  extractGenAISpans,
  checkTokenUsage,
  printSpanSummary,
  assertAttributes,
  AttributeSchema,
  skipIf,
  skip,
} from '../utils.js';

export const basicLLMTest: TestDefinition = {
  name: 'Basic LLM Test',
  description: 'Single completion call with system message',
  type: 'llm',
  
  inputs: [
    {
      model: 'gpt-5-nano',
      messages: [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'What is the capital of France?' },
      ],
    },
  ],

  checkStructure(spans: CapturedSpan[], config: FrameworkConfig) {
    const aiSpans = extractGenAISpans(spans);
    expect(aiSpans.length).to.equal(1);
  },
  
  // Check 2: Validate span attributes against schema
  checkAttributes(spans: CapturedSpan[], config: FrameworkConfig) {
    const aiSpans = extractGenAISpans(spans);
    assertAttributes(aiSpans, {
      'gen_ai.operation.name': true,
      'gen_ai.request.model': config.modelOverrides?.request || 'gpt-5-nano',
      'gen_ai.response.model': config.modelOverrides?.response || 'gpt-5-nano*',
      'gen_ai.usage.input_tokens': true,
      'gen_ai.usage.output_tokens': true,
      'gen_ai.usage.total_tokens': true,
    });
  },
  checkTokens(spans: CapturedSpan[], config: FrameworkConfig) {
    const aiSpans = extractGenAISpans(spans);
    
    for (const span of aiSpans) {
      checkTokenUsage(span, { validateSum: true });
    }
  },

  checkInputTokensCached(spans: CapturedSpan[], config: FrameworkConfig) {
    const aiSpansWithInputTokensCached = extractGenAISpans(spans).filter(span => span.data?.['gen_ai.usage.input_tokens.cached'] !== undefined);
    skipIf(aiSpansWithInputTokensCached.length === 0, 'No AI spans captured with input tokens cached - cannot validate input tokens cached');
    for (const span of aiSpansWithInputTokensCached) {
      expect(span.data?.['gen_ai.usage.input_tokens.cached']).to.be.lessThanOrEqual(span.data?.['gen_ai.usage.input_tokens']);
    }
  },

  checkOutputTokensReasoning(spans: CapturedSpan[], config: FrameworkConfig) {
    const aiSpansWithOutputTokensReasoning = extractGenAISpans(spans).filter(span => span.data?.['gen_ai.usage.output_tokens.reasoning'] !== undefined);
    skipIf(aiSpansWithOutputTokensReasoning.length === 0, 'No AI spans captured with output tokens reasoning - cannot validate output tokens reasoning');
    for (const span of aiSpansWithOutputTokensReasoning) {
      expect(span.data?.['gen_ai.usage.output_tokens.reasoning']).to.be.lessThanOrEqual(span.data?.['gen_ai.usage.output_tokens']);
    }
  },
};

export default basicLLMTest;
