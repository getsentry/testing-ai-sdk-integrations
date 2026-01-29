/**
 * Multi-Turn LLM Test Case
 * 
 * Tests a conversation with multiple back-and-forth exchanges.
 * Validates that Sentry captures multiple gen_ai spans correctly.
 */

import { expect } from 'chai';
import { TestDefinition, CapturedSpan, FrameworkConfig } from '../../types.js';
import {
  extractGenAISpans,
  checkTokenUsage,
  assertAttributes,
  skipIf,
} from '../utils.js';

export const multiTurnLLMTest: TestDefinition = {
  name: 'Multi-Turn LLM Test',
  description: 'Multi-turn conversation with back-and-forth exchanges',
  type: 'llm',
  
  inputs: [
    // Turn 1: Initial question
    {
      model: 'gpt-5-nano',
      messages: [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'What is the capital of France?' },
      ],
    },
    // Turn 2: Follow-up question
    {
      model: 'gpt-5-nano',
      messages: [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'What is the capital of France?' },
        { role: 'assistant', content: 'The capital of France is Paris.' },
        { role: 'user', content: 'What is the population of that city?' },
      ],
    },
    // Turn 3: Another follow-up
    {
      model: 'gpt-5-nano',
      messages: [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'What is the capital of France?' },
        { role: 'assistant', content: 'The capital of France is Paris.' },
        { role: 'user', content: 'What is the population of that city?' },
        { role: 'assistant', content: 'Paris has a population of approximately 2.2 million people in the city proper.' },
        { role: 'user', content: 'What about the metropolitan area?' },
      ],
    },
  ],
  
  checkStructure(spans: CapturedSpan[], config: FrameworkConfig) {
    const aiSpans = extractGenAISpans(spans);
    expect(aiSpans.length).to.equal(3);
  },
  
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
  
  checkTokenProgression(spans: CapturedSpan[], config: FrameworkConfig) {
    const aiSpans = extractGenAISpans(spans);
    skipIf(aiSpans.length < 3, `Expected 3 spans for multi-turn test, got ${aiSpans.length}`);
    
    // Extract input token counts for each turn
    const inputTokens = aiSpans.map((span) => span.data?.['gen_ai.usage.input_tokens'] as number);
    
    // Input tokens should increase with each turn (more conversation history)
    expect(inputTokens[1]).to.be.greaterThan(inputTokens[0]);
    expect(inputTokens[2]).to.be.greaterThan(inputTokens[1]);
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

export default multiTurnLLMTest;
