# Claude Context: Sentry AI SDK Integration Testing

## Project Purpose

This repository contains a comprehensive testing framework for Sentry's AI SDK integrations. Sentry's `@sentry/node` (JavaScript) and `sentry-sdk` (Python) have auto-enabled integrations for popular AI SDKs. This project ensures those integrations work correctly across all supported AI SDKs and captures breakages when new AI SDK versions are released.

## Goals

1. **Catch integration breakages early** - Detect when new AI SDK versions break Sentry instrumentation
2. **Comprehensive coverage** - Test all popular AI SDKs that Sentry supports
3. **Language parity** - Identical test behavior across JavaScript and Python
4. **Clear error messages** - When tests fail, show exactly what's wrong
5. **Template-based test generation** - Nunjucks templates generate runnable test files for each framework

## IMPORTANT: Never Skip Failing Tests

**Do NOT add check names to `skip.checks` in `config.json` just because they fail.** The entire purpose of this framework is to surface failures. If a check fails, it means the Sentry integration has a real issue that needs to be fixed — that is a valid, expected test result. Skipping it hides the problem and makes this tool useless. Failing tests are the output of this project, not a problem to be worked around.

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
│   │   ├── checks.ts                 # Reusable check functions
│   │   ├── utils.ts                  # Test utilities (skip, assertions)
│   │   ├── llm/                      # LLM test cases
│   │   │   ├── basic.ts              # Basic single completion test
│   │   │   ├── multi-turn.ts         # Multi-turn conversation test
│   │   │   ├── basic-error.ts        # Error handling test
│   │   │   ├── vision.ts             # Vision/image input test
│   │   │   └── long-input.ts         # Long input trimming test
│   │   ├── agents/                   # Agent test cases
│   │   │   ├── basic.ts              # Basic agent (no tools)
│   │   │   ├── tool-call.ts          # Agent with tool calling
│   │   │   ├── tool-error.ts         # Tool error handling
│   │   │   ├── vision.ts             # Vision agent test
│   │   │   └── long-input.ts         # Long input agent test
│   │   └── embeddings/               # Embeddings test cases
│   │       └── basic.ts              # Basic embedding test
│   ├── runner/                       # Test execution
│   │   ├── runner.ts                 # Main runner
│   │   ├── javascript-runner.ts      # JS (Node) execution
│   │   ├── python-runner.ts          # Python execution
│   │   ├── browser-runner.ts         # Browser execution (Playwright)
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
│   ├── ctrf-report-*.json
│   └── test-report-*.html
├── docs/                             # Documentation
└── package.json
```

### Framework Templates Structure

Templates are organized by **category** (llm, agents, embeddings), then **platform** (node, python, browser), then **framework** name. The framework folder name is the **SDK or framework that Sentry instruments** (e.g. `openai` = OpenAI SDK, `langchain` = LangChain); the fact that a template calls a given provider (e.g. LangChain using OpenAI) is an implementation detail. See `src/runner/templates/README.md` for the full naming convention and options to reduce confusion.

```
src/runner/templates/
├── base.node.njk                     # Base JavaScript (Node) template
├── base.python.njk                       # Base Python template
├── base.browser.njk                  # Base JavaScript (browser) template
├── base.nextjs.njk                   # Base Next.js template
├── base.php.njk                      # Base PHP (Laravel) template
├── llm/                              # Low-level LLM frameworks
│   ├── node/
│   │   ├── anthropic/                # config.json + template.njk
│   │   ├── google-genai/
│   │   ├── langchain/
│   │   └── openai/
│   └── python/
│   │   ├── anthropic/
│   │   ├── langchain/
│   │   ├── litellm/
│   │   └── openai/
│   ├── browser/
│   │   ├── anthropic/
│   │   ├── google-genai/
│   │   ├── langchain/
│   │   └── openai/
│   └── nextjs/
│       ├── anthropic/
│       ├── google-genai/
│       ├── langchain/
│       └── openai/
├── agents/                           # Agentic frameworks
│   ├── node/
│   │   ├── langgraph/
│   │   ├── mastra/
│   │   └── vercel/
│   └── python/
│   │   ├── google-genai/
│   │   ├── langgraph/
│   │   ├── openai-agents/
│   │   └── pydantic-ai/
│   ├── nextjs/
│   │   ├── mastra/
│   │   └── vercel/
│   └── php/
│       └── laravel/                  # config.json + template.njk + agent.php.njk + tool.php.njk
└── embeddings/                       # Embedding frameworks
    ├── node/
    │   ├── google-genai/
    │   ├── langchain/
    │   ├── openai/
    │   └── vercel/
    ├── browser/
    │   ├── google-genai/
    │   ├── langchain/
    │   └── openai/
    ├── nextjs/
    │   ├── google-genai/
    │   ├── langchain/
    │   ├── openai/
    │   └── vercel/
    ├── python/
    │   ├── google-genai/
    │   ├── langchain/
    │   ├── litellm/
    │   ├── manual/                   # Manual instrumentation (no SDK dependency)
    │   └── openai/
    └── php/
        └── laravel/
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

# Run tests for a specific platform (node, python, browser, nextjs, php, or js)
npm run test -- --platform python
npm run test -- --platform browser
npm run test -- --platform nextjs
npm run test -- --platform php                        # PHP platform (Laravel)
npm run test -- --platform js                         # all JS platforms (node + browser)

# Run tests for a specific type (llm, agents, embeddings)
npm run test -- --type embeddings
npm run test -- --type llm --platform python

# Run with verbose output
npm run test -- --framework openai --verbose

# Run only streaming tests
npm run test -- --streaming

# Run only sync tests (Python)
npm run test -- --platform python --sync

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
  --type <type>              Filter by framework type (llm, agents, embeddings)
  --platform <node|python|browser|nextjs|php|js>  Filter by platform (js = node + browser)
  --sync                     Run only sync tests (default: both)
  --async                    Run only async tests (default: both)
  --streaming                Run only streaming tests (default: both)
  --blocking                 Run only blocking (non-streaming) tests (default: both)
  --parallel, -j <N>         Run up to N tests in parallel (default: 1)
  --verbose, -v              Show detailed output (test execution logs, etc.)
  --live-status              Enable live status display (real-time tree view)
  --open                     Open HTML report in browser after test run
  --sentry-python <path>     Use local Sentry Python SDK (editable install)
  --sentry-javascript <path> Use local Sentry JavaScript SDK (link)
  --sentry-php <path>        Use local Sentry PHP SDK (core sentry/sentry-php)
  --sentry-laravel <path>    Use local Sentry Laravel SDK (composer path repository)
  --help, -h                 Show this help message
```

## How Tests Work

1. **Discovery**: `framework-discovery.ts` scans `templates/` directory for `config.json` files
2. **Matrix Generation**: Creates test matrix (framework x test definition x execution modes)
3. **Template Rendering**: Uses Nunjucks to generate runnable test files from templates
4. **Execution**: Runs generated tests with Sentry DSN pointing to span collector
5. **Validation**: Runs check functions from `checks` array against captured spans
6. **Reporting**: Generates console output + CTRF JSON + HTML reports

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
        Validator runs checks array on captured spans
                    ↓
        Reporter outputs results
```

## Supported AI SDKs

### Currently Implemented

| Platform          | SDK             | Category | Type     | Streaming | Execution Modes |
| ----------------- | --------------- | -------- | -------- | --------- | --------------- |
| JavaScript (Node) | `openai`        | llm      | llm-only | both      | -               |
| JavaScript (Node) | `anthropic`     | llm      | llm-only | both      | -               |
| JavaScript (Node) | `google-genai`  | llm      | llm-only | both      | -               |
| JavaScript (Node) | `langchain`     | llm      | llm-only | both      | -               |
| JavaScript (Node) | `vercel`        | agents   | agentic  | -         | -               |
| JavaScript (Node) | `langgraph`     | agents   | agentic  | -         | -               |
| JavaScript (Node) | `mastra`        | agents   | agentic  | -         | -               |
| Browser           | `openai`        | llm      | llm-only | both      | -               |
| Browser           | `anthropic`     | llm      | llm-only | both      | -               |
| Browser           | `google-genai`  | llm      | llm-only | both      | -               |
| Browser           | `langchain`     | llm      | llm-only | both      | -               |
| Next.js           | `openai`        | llm      | llm-only | both      | -               |
| Next.js           | `anthropic`     | llm      | llm-only | both      | -               |
| Next.js           | `google-genai`  | llm      | llm-only | both      | -               |
| Next.js           | `langchain`     | llm      | llm-only | both      | -               |
| Next.js           | `vercel`        | agents   | agentic  | -         | -               |
| Next.js           | `mastra`        | agents   | agentic  | -         | -               |
| Python            | `openai`        | llm      | llm-only | both      | sync/async      |
| Python            | `anthropic`     | llm      | llm-only | both      | sync/async      |
| Python            | `langchain`     | llm      | llm-only | both      | sync/async      |
| Python            | `litellm`       | llm      | llm-only | both      | sync/async      |
| Python            | `openai-agents` | agents   | agentic  | -         | async           |
| Python            | `langgraph`     | agents   | agentic  | -         | sync/async      |
| Python            | `pydantic-ai`   | agents   | agentic  | -         | async           |
| Python            | `google-genai`  | agents   | agentic  | -         | sync/async      |
| PHP (Laravel)     | `laravel`       | agents   | agentic  | -         | -               |
| JavaScript (Node) | `openai`        | embeddings | embeddings | -      | -               |
| JavaScript (Node) | `google-genai`  | embeddings | embeddings | -      | -               |
| JavaScript (Node) | `langchain`     | embeddings | embeddings | -      | -               |
| JavaScript (Node) | `vercel`        | embeddings | embeddings | -      | -               |
| Browser           | `openai`        | embeddings | embeddings | -      | -               |
| Browser           | `google-genai`  | embeddings | embeddings | -      | -               |
| Browser           | `langchain`     | embeddings | embeddings | -      | -               |
| Next.js           | `openai`        | embeddings | embeddings | -      | -               |
| Next.js           | `google-genai`  | embeddings | embeddings | -      | -               |
| Next.js           | `langchain`     | embeddings | embeddings | -      | -               |
| Next.js           | `vercel`        | embeddings | embeddings | -      | -               |
| Python            | `manual`        | embeddings | embeddings | -      | sync/async      |
| Python            | `openai`        | embeddings | embeddings | -      | sync/async      |
| Python            | `litellm`       | embeddings | embeddings | -      | sync/async      |
| Python            | `langchain`     | embeddings | embeddings | -      | sync/async      |
| Python            | `google-genai`  | embeddings | embeddings | -      | sync/async      |
| PHP (Laravel)     | `laravel`       | embeddings | embeddings | -      | -               |

## Test Cases

Test cases are TypeScript files in `src/test-cases/` that define:

- **name**: Human-readable test name
- **description**: What the test validates
- **type**: `"llm"`, `"agent"`, or `"embeddings"` (determines which frameworks can run it)
- **inputs**: Test input data (model, messages or input text)
- **checks**: Array of check functions that validate captured spans

### LLM Test Cases

| Test                   | Description                               |
| ---------------------- | ----------------------------------------- |
| `Basic LLM Test`       | Single completion with system message     |
| `Multi Turn LLM Test`  | Multi-turn conversation (3 turns)         |
| `Basic Error LLM Test` | Tests API error handling                  |
| `Vision LLM Test`      | Image input processing                    |
| `Long Input LLM Test`  | Message trimming for large inputs (>20KB) |

### Agent Test Cases

| Test                    | Description                             |
| ----------------------- | --------------------------------------- |
| `Basic Agent Test`      | Agent without tools (simple completion) |
| `Tool Call Agent Test`  | Agent with successful tool calling      |
| `Tool Error Agent Test` | Agent with tool that raises exception   |
| `Vision Agent Test`     | Agent that processes images             |
| `Long Input Agent Test` | Agent with large input trimming         |

### Embeddings Test Cases

| Test                     | Description                          |
| ------------------------ | ------------------------------------ |
| `Basic Embeddings Test`  | Single embedding call with text input |

### Test Definition Example

Test definitions use an explicit `checks` array with reusable check functions:

```typescript
// src/test-cases/llm/basic.ts
import { TestDefinition } from "../../types.js";
import {
  checkAISpanCount,
  checkChatSpanAttributes,
  checkValidTokenUsage,
  checkInputMessagesSchema,
} from "../checks.js";

export const basicLLMTest: TestDefinition = {
  name: "Basic LLM Test",
  description: "Single completion call with system message",
  type: "llm",

  inputs: [
    {
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: "What is the capital of France?" },
      ],
    },
  ],

  checks: [
    checkAISpanCount(1),
    checkChatSpanAttributes,
    checkValidTokenUsage,
    checkInputMessagesSchema,
  ],
};
```

## Check Functions

Reusable check functions are defined in `src/test-cases/checks.ts`. Each check is an object with a `name` and `fn`:

```typescript
interface Check {
  name: string;
  fn: (
    spans: CapturedSpan[],
    config: FrameworkConfig,
    testDef: TestDefinition,
  ) => void;
}
```

### Available Checks

| Check                        | Description                                         |
| ---------------------------- | --------------------------------------------------- |
| `checkAISpanCount(n)`        | Factory: validate AI span count (exact or min/max)  |
| `checkChatSpanAttributes`    | Validates chat/completion spans (model, messages)   |
| `checkAgentSpanAttributes`   | Validates agent invocation spans                    |
| `checkToolSpanAttributes`    | Validates tool execution spans                      |
| `checkValidTokenUsage`       | Token counts exist and are valid                    |
| `checkInputTokensCached`     | Cached tokens ≤ input tokens                        |
| `checkOutputTokensReasoning` | Reasoning tokens ≤ output tokens                    |
| `checkInputMessagesSchema`   | Validates message schema follows Sentry conventions |
| `checkAgentHierarchy`        | Agent span hierarchy and name propagation           |
| `checkAvailableTools`        | Validates gen_ai.request.available_tools            |
| `checkResponseToolCalls([])` | Factory: validate tool calls in LLM response        |
| `checkToolCalls([])`         | Factory: validate tool execution spans              |
| `checkMessageTrimming`       | Messages are trimmed below 15KB                     |
| `checkTrimmingMetadata`      | Original length metadata is present                 |
| `checkBinaryRedaction`       | Binary content (images) is redacted                 |
| `checkEmbeddingSpanAttributes` | Validates embedding spans (model, input, description) |
| `checkEmbeddingTokenUsage`   | Embedding token usage (input_tokens, total_tokens)  |

## Attribute Deprecation System

The project uses sentry-conventions as a git submodule to dynamically track deprecated GenAI attributes. This ensures the test framework stays aligned with OpenTelemetry standards while maintaining backward compatibility.

### How It Works

1. **Dynamic Loading**: The deprecation loader (`src/deprecation/loader.ts`) scans the `sentry-conventions/model/attributes/gen_ai/` directory at runtime to identify deprecated attributes
2. **Automatic Fallback**: Checks use new OTEL attributes first, automatically falling back to legacy attributes if the new ones aren't present
3. **Non-Blocking Warnings**: When legacy attributes are detected, deprecation warnings are logged (visible in console output) but tests continue to pass
4. **Graceful Degradation**: If the submodule isn't available, the system continues to work with fallback behavior

### Attribute Migration Mapping

The following attributes have been migrated to OpenTelemetry standards:

| Legacy Attribute | OTEL Replacement | Status |
|------------------|------------------|--------|
| `gen_ai.request.messages` | `gen_ai.input.messages` | Deprecated |
| `gen_ai.response.text` | `gen_ai.output.messages` | Deprecated |
| `gen_ai.response.tool_calls` | `gen_ai.output.messages` (embedded) | Deprecated |
| `gen_ai.request.available_tools` | `gen_ai.tool.definitions` | Deprecated |
| `gen_ai.tool.input` | `gen_ai.tool.call.arguments` | Pending deprecation |
| `gen_ai.tool.output` | `gen_ai.tool.call.result` | Pending deprecation |

### Updating Deprecation Mappings

To pull the latest attribute definitions from sentry-conventions:

```bash
npm run update-conventions
npm run build
```

The loader will automatically detect any new deprecations added to the conventions repository.

## Framework Configuration

Each framework has a `config.json` file that defines its capabilities:

```json
{
  "name": "openai",
  "displayName": "OpenAI JavaScript SDK",
  "type": "llm-only",
  "platform": "node",
  "streamingMode": "both",
  "dependencies": [{ "package": "openai", "version": "framework" }],
  "versions": ["4.96.0"],
  "sentryVersions": ["latest"]
}
```

### Configuration Fields

| Field            | Description                                                                                             |
| ---------------- | ------------------------------------------------------------------------------------------------------- |
| `name`           | Framework identifier                                                                                    |
| `displayName`    | Human-readable name                                                                                     |
| `type`           | `"llm-only"`, `"agentic"`, or `"embeddings"`                                                            |
| `platform`       | `"node"`, `"python"`, `"browser"`, `"php"`, or `"nextjs"` (CLI also accepts `"js"` as meta-platform for node + browser) |
| `streamingMode`  | `"streaming"`, `"blocking"`, or `"both"`                                                                |
| `executionMode`  | Python only: `"sync"`, `"async"`, or `"both"`                                                           |
| `dependencies`   | NPM/pip packages to install                                                                             |
| `versions`       | Framework versions to test                                                                              |
| `sentryVersions` | Sentry SDK versions to test against                                                                     |
| `modelOverrides` | Override model names for request/response validation                                                    |
| `skip`           | Tests or checks to skip for this framework                                                              |

## Test Utilities

Available in `src/test-cases/utils.ts`:

| Function               | Purpose                                |
| ---------------------- | -------------------------------------- |
| `skip(reason)`         | Skip the current check with a reason   |
| `skipIf(cond, reason)` | Conditionally skip a check             |
| `extractGenAISpans()`  | Filter spans for `gen_ai.*` operations |
| `findAgentSpans()`     | Find `invoke_agent` spans              |
| `findChatSpans()`      | Find `chat`/`completion` spans         |
| `findToolSpans()`      | Find tool execution spans              |
| `findEmbeddingSpans()` | Find `embeddings` spans                |
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
mkdir -p src/runner/templates/{llm|agents}/{node|python|browser|nextjs|php}/your-framework
```

### 2. Create `config.json`

```json
{
  "name": "your-framework",
  "displayName": "Your Framework SDK",
  "type": "llm-only",
  "platform": "node",
  "streamingMode": "both",
  "dependencies": [{ "package": "your-framework", "version": "framework" }],
  "versions": ["1.0.0"],
  "sentryVersions": ["latest"]
}
```

### 3. Create `template.njk`

Templates extend the base template and implement required blocks. Use `base.node.njk` for Node, `base.py.njk` for Python, `base.browser.njk` for browser, or `base.nextjs.njk` for Next.js.

```njk
{% extends "base.node.njk" %}

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
import { TestDefinition } from "../../types.js";
import { checkAISpanCount, checkChatSpanAttributes } from "../checks.js";

export const yourTest: TestDefinition = {
  name: "Your Test Name",
  description: "What this test validates",
  type: "llm", // or 'agent'

  inputs: [
    {
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: "Test prompt" }],
    },
  ],

  checks: [checkAISpanCount({ min: 1 }), checkChatSpanAttributes],
};

export default yourTest;
```

### 2. Register in Index

```typescript
// src/test-cases/index.ts
import { yourTest } from "./llm/your-test.js";

export const testCases = {
  llm: {
    // ... existing tests
    yourTest: yourTest,
  },
};
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
  type: "llm" | "agent" | "embeddings";
  inputs: TestInput[];
  agent?: AgentDefinition; // For agent tests
  causeAPIError?: boolean; // Trigger API errors
  checks: Check[]; // Array of check functions
}
```

### FrameworkConfig

```typescript
interface FrameworkConfig {
  name: string;
  platform: "node" | "python" | "browser" | "nextjs" | "php";
  type: "llm-only" | "agentic" | "embeddings";
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
GOOGLE_GENAI_API_KEY=...
```

## Debugging

### View Captured Spans

Use `printSpanSummary()` in your check methods:

```typescript
import { printSpanSummary } from "../utils.js";

const debugCheck: Check = {
  name: "debugCheck",
  fn: (spans) => {
    printSpanSummary(spans);
  },
};
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
4. **Message handling** - Proper schema, trimming, binary redaction

## Success Criteria

A test passes when:

1. Test code runs without exceptions
2. All check functions pass (or are skipped with reason)
3. Required spans are captured with correct attributes

## Special Frameworks

### Mastra

Mastra uses its own Sentry integration (`@mastra/sentry`) rather than `@sentry/node`. Key differences:

- Uses `SentryExporter` with Mastra's `Observability` system
- Attribute names follow newer OpenTelemetry conventions (`gen_ai.input.messages` instead of `gen_ai.request.messages`)
- Template is standalone (does not extend base.node.njk)

### Laravel

Laravel uses a split-file template setup unique among the platforms:

- Uses `composer create-project laravel/laravel` for environment setup
- Sentry is integrated via `sentry/sentry-laravel` (Composer package)
- AI functionality comes from `laravel/ai` package
- Templates generate multiple PHP files: agent classes (`app/Ai/Agents/`), tool classes (`app/Ai/Tools/`), and artisan commands (`app/Console/Commands/`)
- Tests are executed via `php artisan test:<test-case-id>` rather than running a script file directly
- The `PhpRunner` handles Composer project creation, dependency installation, and artisan command execution

## References

- **Sentry JavaScript SDK:** https://github.com/getsentry/sentry-javascript
- **Sentry Python SDK:** https://github.com/getsentry/sentry-python
- **Vercel AI SDK:** https://sdk.vercel.ai/docs
- **OpenAI Python SDK:** https://github.com/openai/openai-python
- **Mastra AI Framework:** https://mastra.ai/docs
