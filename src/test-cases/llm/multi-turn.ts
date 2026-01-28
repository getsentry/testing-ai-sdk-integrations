/**
 * Multi-Turn LLM Test Case
 * 
 * Tests a conversation with multiple back-and-forth exchanges.
 * Validates that Sentry captures multiple gen_ai spans correctly.
 */

import { TestDefinition, CapturedSpan, FrameworkConfig } from '../../types.js';
import {
  extractGenAISpans,
  checkTokenUsage,
  printSpanSummary,
  assertAttributes,
  AttributeSchema,
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
  
  // Check 1: Validate span structure for multiple turns
  checkStructure(spans: CapturedSpan[], config: FrameworkConfig) {
    const aiSpans = extractGenAISpans(spans);
    printSpanSummary(aiSpans);
    
    // Should have 3 spans (one for each turn)
    if (aiSpans.length !== 3) {
      throw new Error(`Expected exactly 3 gen_ai spans, got ${aiSpans.length}`);
    }
    
    // Verify each span has correct operation
    const validOps = /^gen_ai\.(chat|completion|generate)/;
    aiSpans.forEach((span, idx) => {
      if (!span.op || !validOps.test(span.op)) {
        throw new Error(`Span ${idx}: operation '${span.op}' doesn't match expected patterns`);
      }
    });
    
    console.log(`  Captured ${aiSpans.length} AI span(s) for multi-turn conversation`);
  },
  
  // Check 2: Validate attributes on all spans
  checkAttributes(spans: CapturedSpan[], config: FrameworkConfig) {
    const aiSpans = extractGenAISpans(spans);
    
    skipIf(aiSpans.length === 0, 'No AI spans captured');
    
    // Use model overrides if provided, otherwise use default test input
    const requestModel = config.modelOverrides?.request || 'gpt-5-nano';
    const responseModel = config.modelOverrides?.response || 'gpt-5-nano*';
    
    // All spans should have same basic attributes
    const schema: AttributeSchema = {
      'gen_ai.operation.name': true,
      'gen_ai.request.model': requestModel,
      'gen_ai.response.model': responseModel,
      'gen_ai.usage.input_tokens': true,
      'gen_ai.usage.output_tokens': true,
      'gen_ai.usage.total_tokens': true,
    };
    
    assertAttributes(aiSpans, schema);
    console.log(`  All ${aiSpans.length} spans validated against schema`);
  },
  
  // Check 3: Validate token progression
  checkTokenProgression(spans: CapturedSpan[], config: FrameworkConfig) {
    const aiSpans = extractGenAISpans(spans);
    
    skipIf(aiSpans.length < 3, `Expected 3 spans for multi-turn test, got ${aiSpans.length}`);
    
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
  checkIndividualTurns(spans: CapturedSpan[], config: FrameworkConfig) {
    const aiSpans = extractGenAISpans(spans);
    
    skipIf(aiSpans.length !== 3, `Expected exactly 3 spans, got ${aiSpans.length}`);
    
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
