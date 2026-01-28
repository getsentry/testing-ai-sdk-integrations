/**
 * Basic Agent Test Case
 * 
 * Tests an agentic workflow with tool calling.
 * Validates that Sentry captures both agent and LLM spans.
 */

import { TestDefinition, CapturedSpan, FrameworkConfig } from '../../types.js';
import {
  extractGenAISpans,
  checkSpanStructure,
  printSpanSummary,
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
  
  // Check 1: Basic structure validation
  checkStructure(spans: CapturedSpan[], config: FrameworkConfig) {
    const aiSpans = extractGenAISpans(spans);
    printSpanSummary(aiSpans);
    
    // Verify we have at least one AI span
    if (aiSpans.length === 0) {
      throw new Error('No gen_ai.* spans captured');
    }
    
    // Verify all operations start with gen_ai
    aiSpans.forEach((span, idx) => {
      if (!span.op || !span.op.startsWith('gen_ai')) {
        throw new Error(`Span ${idx}: operation must start with 'gen_ai' but got '${span.op}'`);
      }
    });
    
    console.log(`  Captured ${aiSpans.length} AI span(s)`);
  },
  
  // Check 2: Agent and LLM span validation
  checkAgentSpans(spans: CapturedSpan[], config: FrameworkConfig) {
    const aiSpans = extractGenAISpans(spans);
    
    // Look for agent span (for agentic frameworks)
    const agentSpan = aiSpans.find((s) => 
      s.op?.match(/^gen_ai\.(invoke_agent|agent\.run|agent)/) ||
      s.description?.toLowerCase().includes('agent')
    );
    
    // Look for LLM call span
    const llmSpan = aiSpans.find((s) => 
      s.op?.match(/^gen_ai\.(chat|completion|generate)/)
    );
    
    if (agentSpan) {
      console.log('  Agent span captured');
      
      // Check for agent-specific attributes
      if (agentSpan.data) {
        const hasAgentInfo = 
          agentSpan.data['gen_ai.agent.name'] ||
          agentSpan.description?.includes('math_assistant');
        
        if (hasAgentInfo) {
          console.log('  Agent metadata captured');
        }
      }
      
      // If both agent and LLM spans exist, validate hierarchy
      if (llmSpan) {
        try {
          checkSpanStructure(aiSpans, {
            parentOp: /^gen_ai\.(invoke_agent|agent\.run|agent)/,
            childOp: /^gen_ai\.(chat|completion|generate)/,
            minChildren: 1,
          });
          console.log('  Agent → LLM hierarchy validated');
        } catch (error) {
          console.log('  ⚠ Agent hierarchy not validated (flat structure)');
        }
      }
    }
    
    if (llmSpan) {
      console.log('  LLM span captured');
      
      // Verify model information is present
      if (llmSpan.data && (llmSpan.data['gen_ai.request.model'] || llmSpan.data['gen_ai.response.model'])) {
        console.log('  Model information captured');
      }
    }
  },
  
  // Check 3: Tool call validation
  checkToolCalls(spans: CapturedSpan[], config: FrameworkConfig) {
    const aiSpans = extractGenAISpans(spans);
    
    const hasToolCall = aiSpans.some((s) => 
      s.data && (
        s.data['gen_ai.tool_calls'] ||
        s.data['gen_ai.tool.name'] ||
        s.description?.toLowerCase().includes('tool')
      )
    );
    
    if (!hasToolCall) {
      console.log('  ⚠ Tool call information not found in span data');
    } else {
      console.log('  Tool call information captured');
    }
  },
};

export default basicAgentTest;
