/**
 * Basic LLM Test Case
 * 
 * Tests a simple completion call with system message and user prompt.
 * Validates that Sentry captures the gen_ai span correctly.
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

export const basicLLMTest: TestDefinition = {
  name: 'Basic LLM Test',
  description: 'Single completion call with system message',
  type: 'llm',
  
  inputs: [
    {
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'What is the capital of France?' },
      ],
    },
  ],
  
  // Check 1: Validate span structure
  checkStructure(spans: CapturedSpan[]) {
    // Extract AI spans
    const aiSpans = extractGenAISpans(spans);
    
    // Print span summary for debugging
    printSpanSummary(aiSpans);
    
    // Check general span attributes
    checkGenAISpan(aiSpans, {
      minCount: 1,
      opPattern: /^gen_ai\.(chat|completion|generate)/,
      hasDescription: true,
      hasModel: true,
      hasValidTimestamps: true,
    });
    
    console.log(`  Captured ${aiSpans.length} AI span(s) with correct structure`);
  },
  
  // Check 2: Validate span attributes against schema
  checkAttributes(spans: CapturedSpan[]) {
    const aiSpans = extractGenAISpans(spans);
    
    if (aiSpans.length === 0) {
      throw new Error('No AI spans captured');
    }
    
    // Define expected attributes schema
    const schema: AttributeSchema = {
      'gen_ai.operation.name': true, // Must exist
      'gen_ai.request.model': 'gpt-4o', // Exact match
      'gen_ai.response.model': 'gpt-4o*', // Pattern match (e.g., "gpt-4o-2024-08-06")
      'gen_ai.usage.input_tokens': true, // Must exist
      'gen_ai.usage.output_tokens': true, // Must exist
      'gen_ai.usage.total_tokens': true, // Must exist
    };
    
    assertAttributes(aiSpans, schema);
    console.log(`  All attributes validated against schema`);
  },
  
  // Check 3: Validate token usage
  checkTokens(spans: CapturedSpan[]) {
    const aiSpans = extractGenAISpans(spans);
    
    if (aiSpans.length === 0) {
      throw new Error('No AI spans captured');
    }
    
    const span = aiSpans[0];
    
    checkTokenUsage(span, {
      hasInputTokens: true,
      hasOutputTokens: true,
      hasTotalTokens: true,
      validateSum: true,
    });
    
    console.log('  Token usage validated');
  },
};

export default basicLLMTest;
