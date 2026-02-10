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
  
  // Checks grouped by severity (critical, normal, warning)
  criticalChecks: [/* must pass */],
  checks: [/* normal checks */],
  warningChecks: [/* optional checks */],
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
   import { checkAISpanCount, checkChatSpanAttributes } from '../checks.js';
   
   export const myTest: TestDefinition = {
     name: 'My Test',
     description: 'What this test validates',
     
     // System or agent config
     system: '...',  // OR agent: { ... }
     
     input: {
       model: 'gpt-4o',
       prompt: '...',
     },
     
     // Checks grouped by severity
     criticalChecks: [
       checkAISpanCount(1),       // Must pass or test is broken
     ],
     checks: [
       checkChatSpanAttributes,   // Normal correctness checks
     ],
     warningChecks: [
       // Optional/OTel migration checks (failures don't fail the test)
     ],
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

Checks are reusable functions defined in `checks.ts` and `otel-checks.ts`. They throw `CheckError` (with `ErrorLocation[]`) on failure.

### Check Severity

Tests define checks in three tiers:

- **`criticalChecks`** — Structural checks (span existence, hierarchy). If these fail, the test is fundamentally broken.
- **`checks`** — Normal data correctness checks (token usage, message schema, tool calls).
- **`warningChecks`** — Optional/OTel migration checks. Failures are reported but don't fail the test.

### Writing Custom Checks

```typescript
import { Check, ErrorLocation } from '../../types.js';
import { CheckError } from '../../validator.js';
import { extractGenAISpans } from '../utils.js';

const myCheck: Check = {
  name: 'myCheck',
  fn: (spans, config, testDef) => {
    const aiSpans = extractGenAISpans(spans);
    if (aiSpans.length === 0) {
      throw new CheckError('Expected at least one AI span');
    }

    const errors: ErrorLocation[] = [];
    for (const span of aiSpans) {
      if (!span.data?.['gen_ai.request.model']) {
        errors.push({
          spanId: span.span_id,
          attribute: 'gen_ai.request.model',
          message: 'Model attribute is missing',
        });
      }
    }
    if (errors.length > 0) {
      throw new CheckError('Model attribute validation failed', errors);
    }
  },
};
```

### Reusable Check Functions

Use the built-in checks from `checks.ts` for common validations:

```typescript
import {
  checkAISpanCount,
  checkChatSpanAttributes,
  checkValidTokenUsage,
  checkInputMessagesSchema,
} from '../checks.js';

// In your test definition:
criticalChecks: [checkAISpanCount(1), checkChatSpanAttributes],
checks: [checkValidTokenUsage, checkInputMessagesSchema],
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
