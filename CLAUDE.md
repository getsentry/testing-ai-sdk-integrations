# Claude Context: Sentry AI SDK Integration Testing

## Project Purpose

This repository contains a comprehensive testing framework for Sentry's AI SDK integrations. Sentry's `@sentry/node` (JavaScript) and `sentry-sdk` (Python) have auto-enabled integrations for popular AI SDKs. This project ensures those integrations work correctly across all supported AI SDKs and captures breakages when new AI SDK versions are released.

## Goals

1. **Catch integration breakages early** - Detect when new AI SDK versions break Sentry instrumentation
2. **Comprehensive coverage** - Test all popular AI SDKs that Sentry supports
3. **Language parity** - Identical test behavior across JavaScript and Python
4. **Clear error messages** - When tests fail, show exactly what's wrong
5. **Template-based test generation** - Nunjucks templates generate runnable test files for each framework

## Architecture Overview

This project uses a **template-based test generation approach**. Test definitions (TypeScript) combined with framework templates (Nunjucks) generate runnable test files. A span collector HTTP server captures Sentry data for validation.

### Project Structure

```
testing-ai-sdk-integrations/
├── src/                              # TypeScript source code (ES modules)
│   ├── cli.ts                        # CLI entry point
│   ├── orchestrator.ts               # Main test coordinator
│   ├── types.ts                      # Core type definitions
│   ├── validator.ts                  # Test validation logic
│   ├── setup.ts                      # Setup utilities
│   ├── concurrency.ts                # Parallel execution support
│   ├── test-cases/                   # Test definitions
│   │   ├── index.ts                  # Test registry
│   │   ├── utils.ts                  # Test utilities (skip, assertions)
│   │   ├── llm/                      # LLM test cases
│   │   │   ├── basic.ts              # Basic single completion test
│   │   │   ├── multi-turn.ts         # Multi-turn conversation test
│   │   │   └── basic-error.ts        # Error handling test
│   │   └── agents/                   # Agent test cases
│   │       └── basic.ts              # Basic agent with tool calling
│   ├── runner/                       # Test execution
│   │   ├── runner.ts                 # Main runner
│   │   ├── javascript-runner.ts      # JS-specific execution
│   │   ├── python-runner.ts          # Python-specific execution
│   │   ├── framework-config.ts       # Framework configuration types
│   │   ├── framework-discovery.ts    # Auto-discovers frameworks
│   │   ├── template-renderer.ts      # Nunjucks template rendering
│   │   └── templates/                # Framework templates (see below)
│   ├── span-collector/               # HTTP server to capture Sentry data
│   │   ├── server.ts                 # Hono HTTP server
│   │   └── store.ts                  # In-memory span storage
│   └── reporters/                    # Test output reporters
│       ├── ctrf-reporter.ts          # CTRF JSON report generator
│       └── live-status.ts            # Real-time test status display
├── dist/                             # Compiled JavaScript output
├── runs/                             # Generated test files per run
├── test-results/                     # Generated reports
│   └── ctrf-report.json
├── docs/                             # Documentation
└── package.json
```

### Framework Templates Structure

Templates are organized by **category** (llm, agents), then **platform** (js, py), then **framework** name:

```
src/runner/templates/
├── base.js.njk                       # Base JavaScript template
├── base.py.njk                       # Base Python template
├── llm/                              # Low-level LLM frameworks
│   ├── js/
│   │   ├── anthropic/                # config.json + template.njk
│   │   ├── google-genai/
│   │   ├── langchain/
│   │   └── openai/
│   └── py/
│       ├── anthropic/
│       ├── langchain/
│       ├── litellm/
│       └── openai/
└── agents/                           # Agentic frameworks
    ├── js/
    │   ├── langgraph/
    │   ├── mastra/
    │   └── vercel/
    └── py/
        ├── google-genai/
        ├── langgraph/
        ├── openai-agents/
        └── pydantic-ai/
```

## Quick Start

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# List all discovered frameworks
npm run test list

# Run all tests
npm run test run

# Run tests for a specific framework
npm run test -- --framework openai

# Run tests for a specific platform
npm run test -- --platform py

# Run with verbose output
npm run test -- --framework openai --verbose

# Run only streaming tests
npm run test -- --streaming

# Run only sync tests (Python)
npm run test -- --platform py --sync

# Run tests in parallel
npm run test -- -j=4

# Setup only (generate test files without running)
npm run test setup -- --framework openai
```

## CLI Reference

```
Usage:
  npm run test [command] [options]

Commands:
  run             Run tests (default)
  setup           Setup environments and render templates (no test execution)
  list            List discovered frameworks

Options:
  --framework <name>         Filter by framework name
  --test <name>              Filter by test name
  --platform <js|py>         Filter by platform (js or py)
  --sync                     Run only sync tests (default: both)
  --async                    Run only async tests (default: both)
  --streaming                Run only streaming tests (default: both)
  --blocking                 Run only blocking (non-streaming) tests (default: both)
  --parallel, -j <N>         Run up to N tests in parallel (default: 1)
  --verbose, -v              Show detailed output (test execution logs, etc.)
  --live-status              Enable live status display (real-time tree view)
  --sentry-python <path>     Use local Sentry Python SDK (editable install)
  --sentry-javascript <path> Use local Sentry JavaScript SDK (link)
  --help, -h                 Show this help message
```

## How Tests Work

1. **Discovery**: `framework-discovery.ts` scans `templates/` directory for `config.json` files
2. **Matrix Generation**: Creates test matrix (framework x test definition x execution modes)
3. **Template Rendering**: Uses Nunjucks to generate runnable test files from templates
4. **Execution**: Runs generated tests with Sentry DSN pointing to span collector
5. **Validation**: Runs check methods against captured spans
6. **Reporting**: Generates console output + CTRF JSON report

### Test Flow

```
TestDefinition (TypeScript)  +  Framework Template (Nunjucks)
                    ↓
        Template Renderer generates test file
                    ↓
        Runner executes test file
                    ↓
        Sentry SDK sends spans to Span Collector
                    ↓
        Validator runs check methods on captured spans
                    ↓
        Reporter outputs results
```

## Supported AI SDKs

### Currently Implemented

| Platform   | SDK             | Category | Type     | Streaming | Execution Modes |
| ---------- | --------------- | -------- | -------- | --------- | --------------- |
| JavaScript | `openai`        | llm      | llm-only | both      | -               |
| JavaScript | `anthropic`     | llm      | llm-only | both      | -               |
| JavaScript | `google-genai`  | llm      | llm-only | both      | -               |
| JavaScript | `langchain`     | llm      | llm-only | both      | -               |
| JavaScript | `vercel`        | agents   | agentic  | -         | -               |
| JavaScript | `langgraph`     | agents   | agentic  | -         | -               |
| JavaScript | `mastra`        | agents   | agentic  | -         | -               |
| Python     | `openai`        | llm      | llm-only | both      | sync/async      |
| Python     | `anthropic`     | llm      | llm-only | both      | sync/async      |
| Python     | `langchain`     | llm      | llm-only | both      | sync/async      |
| Python     | `litellm`       | llm      | llm-only | both      | sync/async      |
| Python     | `openai-agents` | agents   | agentic  | -         | -               |
| Python     | `langgraph`     | agents   | agentic  | -         | -               |
| Python     | `pydantic-ai`   | agents   | agentic  | -         | -               |
| Python     | `google-genai`  | agents   | agentic  | -         | -               |

## Test Cases

Test cases are TypeScript files in `src/test-cases/` that define:

- **name**: Human-readable test name
- **description**: What the test validates
- **type**: `"llm"` or `"agent"` (determines which frameworks can run it)
- **inputs**: Test input data (model, messages)
- **check methods**: Functions that validate captured spans

### Current Test Cases

| Test                   | Type  | Description                           |
| ---------------------- | ----- | ------------------------------------- |
| `Basic LLM Test`       | llm   | Single completion with system message |
| `Multi Turn LLM Test`  | llm   | Multi-turn conversation               |
| `Basic Error LLM Test` | llm   | Tests API error handling              |
| `Basic Agent Test`     | agent | Agent with tool calling               |

### Test Definition Example

```typescript
// src/test-cases/llm/basic.ts
export const basicLLMTest: TestDefinition = {
  name: "Basic LLM Test",
  description: "Single completion call with system message",
  type: "llm",

  inputs: [
    {
      model: "gpt-5-nano",
      messages: [
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: "What is the capital of France?" },
      ],
    },
  ],

  // Check methods - any method starting with "check" is run as a validation
  checkStructure(spans: CapturedSpan[], config: FrameworkConfig) {
    const aiSpans = extractGenAISpans(spans);
    expect(aiSpans.length).to.equal(1);
  },

  checkAttributes(spans: CapturedSpan[], config: FrameworkConfig) {
    const aiSpans = extractGenAISpans(spans);
    assertAttributes(aiSpans, {
      "gen_ai.operation.name": true,
      "gen_ai.request.model": config.modelOverrides?.request || "gpt-5-nano",
      "gen_ai.response.model": config.modelOverrides?.response || "gpt-5-nano*",
      "gen_ai.usage.input_tokens": true,
      "gen_ai.usage.output_tokens": true,
    });
  },

  checkTokens(spans: CapturedSpan[], config: FrameworkConfig) {
    const aiSpans = extractGenAISpans(spans);
    for (const span of aiSpans) {
      checkTokenUsage(span, { validateSum: true });
    }
  },
};
```

## Framework Configuration

Each framework has a `config.json` file that defines its capabilities:

```json
{
  "name": "openai",
  "displayName": "OpenAI JavaScript SDK",
  "type": "llm-only",
  "platform": "js",
  "streamingMode": "both",
  "dependencies": [{ "package": "openai", "version": "framework" }],
  "versions": ["4.96.0"],
  "sentryVersions": ["10.28.0", "latest"]
}
```

### Configuration Fields

| Field            | Description                                          |
| ---------------- | ---------------------------------------------------- |
| `name`           | Framework identifier                                 |
| `displayName`    | Human-readable name                                  |
| `type`           | `"llm-only"` or `"agentic"`                          |
| `platform`       | `"js"` or `"py"`                                     |
| `streamingMode`  | `"streaming"`, `"blocking"`, or `"both"`             |
| `executionMode`  | Python only: `"sync"`, `"async"`, or `"both"`        |
| `dependencies`   | NPM/pip packages to install                          |
| `versions`       | Framework versions to test                           |
| `sentryVersions` | Sentry SDK versions to test against                  |
| `modelOverrides` | Override model names for request/response validation |
| `skip`           | Tests or checks to skip for this framework           |

## Test Utilities

Available in `src/test-cases/utils.ts`:

| Function               | Purpose                                |
| ---------------------- | -------------------------------------- |
| `skip(reason)`         | Skip the current check with a reason   |
| `skipIf(cond, reason)` | Conditionally skip a check             |
| `extractGenAISpans()`  | Filter spans for `gen_ai.*` operations |
| `checkTokenUsage()`    | Validate token count attributes        |
| `checkSpanStructure()` | Validate parent-child span hierarchy   |
| `assertAttributes()`   | Schema-based attribute validation      |
| `printSpanSummary()`   | Debug helper to print captured spans   |

### Attribute Schema

The `assertAttributes` function supports:

- `true`: Attribute must exist (any value)
- `false`: Attribute must NOT exist
- `"pattern*"`: Wildcard pattern matching
- `"exact"` / `123`: Exact value match

```typescript
assertAttributes(spans, {
  "gen_ai.operation.name": true, // Must exist
  "gen_ai.request.model": "gpt-4", // Exact match
  "gen_ai.response.model": "gpt-4*", // Pattern match
  sensitive_field: false, // Must NOT exist
});
```

## Adding a New Framework

### 1. Create Template Directory

```bash
mkdir -p src/runner/templates/{llm|agents}/{js|py}/your-framework
```

### 2. Create `config.json`

```json
{
  "name": "your-framework",
  "displayName": "Your Framework SDK",
  "type": "llm-only",
  "platform": "js",
  "streamingMode": "both",
  "dependencies": [{ "package": "your-framework", "version": "framework" }],
  "versions": ["1.0.0"],
  "sentryVersions": ["latest"]
}
```

### 3. Create `template.njk`

Templates extend the base template and implement required blocks:

```njk
{% extends "base.js.njk" %}

{% block setup %}
let client;
{% endblock %}

{% block dynamic_imports %}
      const SDK = (await import("your-framework")).default;
      client = new SDK();
{% endblock %}

{% block test %}
{% for input in inputs %}
      const response = await client.complete({
        model: "{{ input.model }}",
        messages: {{ input.messages | dump }},
      });
      console.log("Response:", response.content);
{% endfor %}
{% endblock %}
```

### 4. Build and Test

```bash
npm run build
npm run test -- --framework your-framework --verbose
```

## Adding a New Test Case

### 1. Create Test File

```typescript
// src/test-cases/llm/your-test.ts
import { TestDefinition, CapturedSpan, FrameworkConfig } from "../../types.js";
import { extractGenAISpans, assertAttributes } from "../utils.js";

export const yourTest: TestDefinition = {
  name: "Your Test Name",
  description: "What this test validates",
  type: "llm", // or 'agent'

  inputs: [
    {
      model: "gpt-5-nano",
      messages: [{ role: "user", content: "Test prompt" }],
    },
  ],

  checkYourValidation(spans: CapturedSpan[], config: FrameworkConfig) {
    // Your validation logic
  },
};
```

### 2. Register in Index

```typescript
// src/test-cases/index.ts
import { yourTest } from "./llm/your-test.js";

export function getAllTests(): TestDefinition[] {
  return [
    basicLLMTest,
    multiTurnLLMTest,
    yourTest, // Add here
    // ...
  ];
}
```

### 3. Build and Test

```bash
npm run build
npm run test -- --test "Your Test Name" --verbose
```

## Core Types

### TestDefinition

```typescript
interface TestDefinition {
  name: string;
  description: string;
  type: "llm" | "agent";
  inputs: TestInput[];
  agent?: AgentDefinition; // For agent tests
  causeAPIError?: boolean; // Trigger API errors
  [key: string]: any; // check* methods
}
```

### FrameworkConfig

```typescript
interface FrameworkConfig {
  name: string;
  platform: "js" | "py";
  type: "llm-only" | "agentic";
  version: string;
  sentryVersion: string;
  templatePath?: string;
  executionMode?: "sync" | "async" | "both";
  streamingMode?: "streaming" | "blocking" | "both";
  modelOverrides?: { request?: string; response?: string };
  skip?: { tests?: string[]; checks?: { [testName: string]: string[] } };
}
```

### CapturedSpan

```typescript
interface CapturedSpan {
  span_id: string;
  trace_id: string;
  op: string;
  description?: string;
  start_timestamp: number;
  timestamp: number;
  data?: Record<string, any>;
  tags?: Record<string, any>;
}
```

## Environment Variables

All API keys should be in a root `.env` file (gitignored):

```bash
# .env
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_API_KEY=...
```

## Debugging

### View Captured Spans

Use `printSpanSummary()` in your check methods:

```typescript
checkDebug(spans: CapturedSpan[]) {
  printSpanSummary(spans);
  // Output:
  //   Captured 3 span(s):
  //     [0] gen_ai.chat
  //     [1] http.client (parent: 12345678)
  //     [2] gen_ai.chat
}
```

### Verbose Mode

```bash
npm run test -- --framework openai --verbose
```

### Live Status

```bash
npm run test -- --framework openai --live-status
```

### Setup Only (Inspect Generated Files)

```bash
npm run test setup -- --framework openai
# Check runs/ directory for generated test files
```

## Sentry Features to Verify

Each test validates that Sentry captures:

1. **Performance tracing** - Spans with proper timing and hierarchy
2. **AI monitoring data** - Model name, token counts, operation names
3. **Error tracking** - Exceptions with context (for error tests)

## Success Criteria

A test passes when:

1. Test code runs without exceptions
2. All check methods pass (or are skipped with reason)
3. Required spans are captured with correct attributes

## References

- **Sentry JavaScript SDK:** https://github.com/getsentry/sentry-javascript
- **Sentry Python SDK:** https://github.com/getsentry/sentry-python
- **Vercel AI SDK:** https://sdk.vercel.ai/docs
- **OpenAI Python SDK:** https://github.com/openai/openai-python
- **Mastra AI Framework:** https://mastra.ai/docs
