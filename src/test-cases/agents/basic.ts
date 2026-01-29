/**
 * Basic Agent Test Case
 * 
 * Tests an agentic workflow with tool calling.
 * Validates that Sentry captures both agent and LLM spans.
 */

import { expect } from 'chai';
import { TestDefinition, CapturedSpan, FrameworkConfig } from '../../types.js';
import {
  extractGenAISpans,
  checkTokenUsage,
  assertAttributes,
  skipIf,
} from '../utils.js';

export const basicAgentTest: TestDefinition = {
  name: 'Basic Agent Test',
  description: 'Agent with simple tool call',
  type: 'agent',
  
  agent: {
    name: 'math_assistant',
    description: 'A math assistant that can perform basic arithmetic',
    tools: [
      {
        name: 'add',
        description: 'Add two numbers together',
        parameters: {
          type: 'object',
          properties: {
            a: {
              type: 'number',
              description: 'First number',
            },
            b: {
              type: 'number',
              description: 'Second number',
            },
          },
          required: ['a', 'b'],
        },
        result: 11, // Static result: 4 + 7 = 11
      },
    ],
  },
  
  inputs: [
    {
      model: 'gpt-5-nano',
      messages: [
        { role: 'user', content: 'What is the result of 4 + 7? Use the add tool.' },
      ],
    },
  ],
  
  checkStructure(spans: CapturedSpan[], config: FrameworkConfig) {
    const aiSpans = extractGenAISpans(spans);
    expect(aiSpans.length).to.be.greaterThan(0);
  },
  
  checkAttributes(spans: CapturedSpan[], config: FrameworkConfig) {
    const aiSpans = extractGenAISpans(spans);
    
    // Find LLM spans (chat/completion/generate)
    const llmSpans = aiSpans.filter(s => s.op?.match(/^gen_ai\.(chat|completion|generate)/));
    skipIf(llmSpans.length === 0, 'No LLM spans captured');
    
    assertAttributes(llmSpans, {
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
    const llmSpans = aiSpans.filter(s => s.op?.match(/^gen_ai\.(chat|completion|generate)/));
    skipIf(llmSpans.length === 0, 'No LLM spans captured');
    
    for (const span of llmSpans) {
      checkTokenUsage(span, { validateSum: true });
    }
  },

  checkAgentSpan(spans: CapturedSpan[], config: FrameworkConfig) {
    const aiSpans = extractGenAISpans(spans);
    
    // Look for agent span (for agentic frameworks)
    const agentSpan = aiSpans.find((s) => 
      s.op?.match(/^gen_ai\.(invoke_agent|agent\.run|agent)/) ||
      s.description?.toLowerCase().includes('agent')
    );
    
    skipIf(!agentSpan, 'No agent span captured - framework may not emit agent spans');
    
    // If agent span exists, verify it has the expected structure
    expect(agentSpan!.op).to.match(/^gen_ai\./);
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

export default basicAgentTest;
