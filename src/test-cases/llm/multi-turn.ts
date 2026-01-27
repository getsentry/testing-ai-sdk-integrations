/**
 * Multi-Turn LLM Test Case
 * 
 * Tests a conversation with multiple back-and-forth exchanges.
 * Validates that Sentry captures multiple gen_ai spans correctly.
 */

import { TestDefinition, CapturedSpan } from '../../types.js';
import {
  extractGenAISpans,
  checkGenAISpan,
  checkTokenUsage,
  printSpanSummary,
  assertAttributes,
  AttributeSchema,
} from '../utils.js';

export const multiTurnLLMTest: TestDefinition = {
  name: 'Multi-Turn LLM Test',
  description: 'Multi-turn conversation with back-and-forth exchanges',
  type: 'llm',
  
  inputs: [
    // Turn 1: Initial question
    {
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'What is the capital of France?' },
      ],
    },
    // Turn 2: Follow-up question
    {
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'What is the capital of France?' },
        { role: 'assistant', content: 'The capital of France is Paris.' },
        { role: 'user', content: 'What is the population of that city?' },
      ],
    },
    // Turn 3: Another follow-up
    {
      model: 'gpt-4o',
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
  
  // Check 1: Validate span structure for multiple turns
  checkStructure(spans: CapturedSpan[]) {
    const aiSpans = extractGenAISpans(spans);
    printSpanSummary(aiSpans);
    
    // Should have 3 spans (one for each turn)
    checkGenAISpan(aiSpans, {
      exactCount: 3,
      opPattern: /^gen_ai\.(chat|completion|generate)/,
      hasDescription: true,
      hasModel: true,
      hasValidTimestamps: true,
    });
    
    console.log(`  Captured ${aiSpans.length} AI span(s) for multi-turn conversation`);
  },
  
  // Check 2: Validate attributes on all spans
  checkAttributes(spans: CapturedSpan[]) {
    const aiSpans = extractGenAISpans(spans);
    
    if (aiSpans.length === 0) {
      throw new Error('No AI spans captured');
    }
    
    // All spans should have same basic attributes
    const schema: AttributeSchema = {
      'gen_ai.operation.name': true,
      'gen_ai.request.model': 'gpt-4o',
      'gen_ai.response.model': 'gpt-4o*',
      'gen_ai.usage.input_tokens': true,
      'gen_ai.usage.output_tokens': true,
      'gen_ai.usage.total_tokens': true,
    };
    
    assertAttributes(aiSpans, schema);
    console.log(`  All ${aiSpans.length} spans validated against schema`);
  },
  
  // Check 3: Validate token progression
  checkTokenProgression(spans: CapturedSpan[]) {
    const aiSpans = extractGenAISpans(spans);
    
    if (aiSpans.length < 3) {
      throw new Error(`Expected 3 spans for multi-turn test, got ${aiSpans.length}`);
    }
    
    // Extract input token counts for each turn
    const inputTokens = aiSpans.map((span, idx) => {
      if (!span.data) {
        throw new Error(`Span ${idx} missing data field`);
      }
      const tokens = span.data['gen_ai.usage.input_tokens'];
      if (typeof tokens !== 'number') {
        throw new Error(`Span ${idx} missing input_tokens or not a number`);
      }
      return tokens;
    });
    
    // Input tokens should increase with each turn (more conversation history)
    // Turn 1: system + user
    // Turn 2: system + user + assistant + user (more tokens)
    // Turn 3: system + user + assistant + user + assistant + user (even more tokens)
    
    if (inputTokens[1] <= inputTokens[0]) {
      throw new Error(
        `Turn 2 input tokens (${inputTokens[1]}) should be greater than Turn 1 (${inputTokens[0]})`
      );
    }
    
    if (inputTokens[2] <= inputTokens[1]) {
      throw new Error(
        `Turn 3 input tokens (${inputTokens[2]}) should be greater than Turn 2 (${inputTokens[1]})`
      );
    }
    
    console.log(`  Token progression validated: ${inputTokens[0]} → ${inputTokens[1]} → ${inputTokens[2]} tokens`);
  },
  
  // Check 4: Validate each individual turn
  checkIndividualTurns(spans: CapturedSpan[]) {
    const aiSpans = extractGenAISpans(spans);
    
    if (aiSpans.length !== 3) {
      throw new Error(`Expected exactly 3 spans, got ${aiSpans.length}`);
    }
    
    // Validate each turn has valid token usage
    aiSpans.forEach((span, idx) => {
      try {
        checkTokenUsage(span, {
          hasInputTokens: true,
          hasOutputTokens: true,
          hasTotalTokens: true,
          validateSum: true,
        });
      } catch (error) {
        throw new Error(`Turn ${idx + 1} token validation failed: ${error instanceof Error ? error.message : error}`);
      }
    });
    
    console.log(`  All ${aiSpans.length} turns validated individually`);
  },
};

export default multiTurnLLMTest;
