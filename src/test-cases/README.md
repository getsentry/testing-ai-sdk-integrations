# Test Cases

Abstract test definitions that describe expected behavior across all frameworks.

## Structure

```
test-cases/
├── llm/           # Tests for LLM-only frameworks (OpenAI, Anthropic, etc.)
│   └── basic.ts   # Basic completion test
├── agents/        # Tests for agentic frameworks (Vercel AI, LangChain, etc.)
│   └── basic.ts   # Basic agent with tool test
└── index.ts       # Exports all test cases
```

## Test Definition Format

Each test case exports a `TestDefinition` object:

```typescript
export const basicLLMTest: TestDefinition = {
  name: 'Basic LLM Test',
  description: 'Single completion call with system message',
  
  // For LLM tests: system + input
  system: 'You are a helpful assistant.',
  input: {
    model: 'gpt-4o',
    prompt: 'What is the capital of France?',
  },
  
  // For agent tests: agent + input
  agent: {
    name: 'math_assistant',
    tools: [/* ... */],
  },
  
  // Validation function (runs in orchestrator with Chai)
  checks(spans) {
    expect(spans.length).to.be.greaterThan(0);
    // ... more assertions
  }
};
```

## LLM Tests

Tests for frameworks that support direct LLM calls (all frameworks):

- **`basic.ts`** - Single completion with system message

**Compatible frameworks:**
- OpenAI SDK
- Anthropic SDK
- Vercel AI SDK
- LangChain
- Google GenAI

## Agent Tests

Tests for frameworks that support agentic workflows (subset of frameworks):

- **`basic.ts`** - Agent with simple tool call

**Compatible frameworks:**
- Vercel AI SDK (agentic mode)
- LangChain (agents)
- OpenAI Agents SDK
- LangGraph

## Adding a New Test Case

1. **Create test file:**
   ```bash
   # For LLM test
   touch src/test-cases/llm/my-test.ts
   
   # For agent test
   touch src/test-cases/agents/my-test.ts
   ```

2. **Define test:**
   ```typescript
   import { TestDefinition } from '../../types.js';
   import { expect } from 'chai';
   
   export const myTest: TestDefinition = {
     name: 'My Test',
     description: 'What this test validates',
     
     // System or agent config
     system: '...',  // OR agent: { ... }
     
     input: {
       model: 'gpt-4o',
       prompt: '...',
     },
     
     checks(spans) {
       // Chai assertions
       expect(spans.length).to.be.greaterThan(0);
     }
   };
   
   export default myTest;
   ```

3. **Export in index:**
   ```typescript
   // src/test-cases/index.ts
   import { myTest } from './llm/my-test.js';
   
   export const testCases = {
     llm: {
       basic: basicLLMTest,
       myTest: myTest,  // Add here
     },
     // ...
   };
   ```

## Validation Guidelines

The `checks(spans)` function receives captured Sentry spans and should validate:

### Basic Checks (all tests)

```typescript
checks(spans) {
  const genAISpans = spans.filter(s => s.op?.startsWith('gen_ai'));
  
  // Should capture spans
  expect(genAISpans.length).to.be.at.least(1);
  
  // Basic span structure
  expect(genAISpans[0].op).to.exist;
  expect(genAISpans[0].start_timestamp).to.exist;
  expect(genAISpans[0].timestamp).to.exist;
}
```

### AI Monitoring Attributes

```typescript
// Model information
expect(span.data['gen_ai.request.model']).to.exist;

// Token usage (if available)
if (span.data['gen_ai.usage.input_tokens']) {
  expect(span.data['gen_ai.usage.input_tokens']).to.be.a('number');
}

// Prompt data (if captured)
if (span.data['gen_ai.prompt']) {
  expect(span.data['gen_ai.prompt']).to.be.a('string');
}
```

### Agent-Specific Checks

```typescript
// Agent span exists
const agentSpan = spans.find(s => s.op === 'gen_ai.invoke_agent');
expect(agentSpan).to.exist;

// Tool calls captured
if (span.data['gen_ai.tool_calls']) {
  expect(span.data['gen_ai.tool_calls']).to.be.an('array');
}
```

## Framework Compatibility

Test cases are automatically filtered based on framework type:

| Framework Type | Compatible Tests |
|----------------|------------------|
| `llm-only` | Only tests with `system` property |
| `agentic` | Tests with `system` OR `agent` property |

The orchestrator handles this filtering automatically.

## Test Execution Flow

1. Orchestrator loads test definitions
2. Generates test matrix (framework × compatible tests)
3. For each test:
   - Renders framework template with test inputs
   - Executes test in isolated environment
   - Collects Sentry spans
   - Runs `checks(spans)` function
   - Reports pass/fail

## Tips

- **Keep tests focused** - Test one behavior per test case
- **Use descriptive names** - Make it clear what's being tested
- **Flexible assertions** - Account for framework differences
- **Log useful info** - Use `console.log` to show what was captured
- **Handle missing data** - Not all SDKs capture everything
