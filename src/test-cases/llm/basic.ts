/**
 * Basic LLM Test Case
 * 
 * Tests a simple completion call with system message and user prompt.
 * Validates that Sentry captures the gen_ai span correctly.
 */

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
  
  // Check 1: Validate span structure
  checkStructure(spans: CapturedSpan[], config: FrameworkConfig) {
    // Extract AI spans
    const aiSpans = extractGenAISpans(spans);
    
    // Print span summary for debugging
    printSpanSummary(aiSpans);
    
    // Verify we have at least one AI span
    if (aiSpans.length === 0) {
      throw new Error('No gen_ai.* spans captured');
    }
    
    // Verify operation names start with gen_ai
    aiSpans.forEach((span, idx) => {
      if (!span.op || !span.op.startsWith('gen_ai')) {
        throw new Error(`Span ${idx}: operation must start with 'gen_ai' but got '${span.op}'`);
      }
      
      // Check that it matches expected patterns
      const validOps = /^gen_ai\.(chat|completion|generate)/;
      if (!validOps.test(span.op)) {
        throw new Error(`Span ${idx}: operation '${span.op}' doesn't match expected patterns`);
      }
    });
    
    console.log(`  Captured ${aiSpans.length} AI span(s) with correct structure`);
  },
  
  // Check 2: Validate span attributes against schema
  checkAttributes(spans: CapturedSpan[], config: FrameworkConfig) {
    const aiSpans = extractGenAISpans(spans);
    
    // Skip if no spans were captured (allows graceful handling)
    skipIf(aiSpans.length === 0, 'No AI spans captured - cannot validate attributes');
    
    // Use model overrides if provided, otherwise use default test input
    const requestModel = config.modelOverrides?.request || 'gpt-5-nano';
    const responseModel = config.modelOverrides?.response || 'gpt-5-nano*';
    
    // Define expected attributes schema
    const schema: AttributeSchema = {
      'gen_ai.operation.name': true, // Must exist
      'gen_ai.request.model': requestModel, // Use override or default
      'gen_ai.response.model': responseModel, // Use override or default
      'gen_ai.usage.input_tokens': true, // Must exist
      'gen_ai.usage.output_tokens': true, // Must exist
      'gen_ai.usage.total_tokens': true, // Must exist
    };
    
    assertAttributes(aiSpans, schema);
    console.log(`  All attributes validated against schema (request: ${requestModel}, response: ${responseModel})`);
  },
  
  // Check 3: Validate token usage
  checkTokens(spans: CapturedSpan[], config: FrameworkConfig) {
    const aiSpans = extractGenAISpans(spans);
    
    // Skip if no spans were captured
    skipIf(aiSpans.length === 0, 'No AI spans captured - cannot validate token usage');
    
    const span = aiSpans[0];
    
    checkTokenUsage(span, {
      hasInputTokens: true,
      hasOutputTokens: true,
      hasTotalTokens: true,
      validateSum: true,
    });
    
    console.log('  Token usage validated');
  },

  checkSkip(spans: CapturedSpan[], config: FrameworkConfig) {
    skip("Always skip here to test");
  },
};

export default basicLLMTest;
