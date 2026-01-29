/**
 * Basic Error LLM Test Case
 * 
 * Tests that Sentry correctly captures API errors when the LLM call fails.
 * Uses respx to mock a 500 Internal Server Error response.
 */

import { expect } from 'chai';
import { TestDefinition, CapturedSpan, FrameworkConfig } from '../../types.js';
import {
  extractGenAISpans,
  skipIf,
} from '../utils.js';

export const basicErrorLLMTest: TestDefinition = {
  name: 'Basic Error LLM Test',
  description: 'Tests error capture when API returns 500 Internal Server Error',
  type: 'llm',
  
  // This flag tells templates to mock an API error
  causeAPIError: true,
  
  inputs: [
    {
      model: 'gpt-5-nano',
      messages: [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'What is the capital of France?' },
      ],
    },
  ],

  // Check that we have at least one span (the errored gen_ai span)
  checkStructure(spans: CapturedSpan[], config: FrameworkConfig) {
    // We expect at least one AI span that captured the error
    const aiSpans = extractGenAISpans(spans);
    expect(aiSpans.length).to.be.greaterThanOrEqual(1, 'Expected at least one AI span for the errored request');
  },

  // Check that the span has error information
  checkErrorCaptured(spans: CapturedSpan[], config: FrameworkConfig) {
    const aiSpans = extractGenAISpans(spans);
    skipIf(aiSpans.length === 0, 'No AI spans captured');
    
    // Find a span with error status or error data
    const errorSpan = aiSpans.find(span => 
      span.status === 'internal_error' ||
      span.status === 'unknown_error' ||
      span.data?.['error.type'] !== undefined ||
      span.data?.['http.status_code'] === 500
    );
    
    expect(errorSpan, 'Expected to find a span with error information').to.exist;
  },

  // Check that the span has the correct operation name
  checkOperation(spans: CapturedSpan[], config: FrameworkConfig) {
    const aiSpans = extractGenAISpans(spans);
    skipIf(aiSpans.length === 0, 'No AI spans captured');
    
    // The span should still have the gen_ai operation
    const chatSpan = aiSpans.find(span => 
      span.op?.startsWith('gen_ai.') || 
      span.op === 'ai.chat' ||
      span.op === 'http.client'
    );
    
    expect(chatSpan, 'Expected to find a gen_ai or http span').to.exist;
  },

  // Skip token checks since the request failed
  checkTokens(spans: CapturedSpan[], config: FrameworkConfig) {
    skipIf(true, 'Skipped - API request failed, no tokens to check');
  },

  checkInputTokensCached(spans: CapturedSpan[], config: FrameworkConfig) {
    skipIf(true, 'Skipped - API request failed');
  },

  checkOutputTokensReasoning(spans: CapturedSpan[], config: FrameworkConfig) {
    skipIf(true, 'Skipped - API request failed');
  },
};

export default basicErrorLLMTest;
