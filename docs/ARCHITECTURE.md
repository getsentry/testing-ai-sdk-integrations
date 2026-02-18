# Architecture

## Overview

Test framework for Sentry AI SDK integrations. Test definitions (TypeScript) combined with framework templates (Nunjucks) generate runnable test files. A span collector HTTP server captures Sentry data for validation.

## Components

```
┌─────────────────────────────────────────────────────────────────┐
│                      Test Definition                            │
│  { name, type, inputs, agent?, checks: Check[] }                │
└─────────────────────────────────────────────────────────────────┘
                              │
            ┌─────────────────┴─────────────────┐
            │ static config                     │ checks array
            ▼                                   ▼
┌───────────────────────┐              ┌───────────────────────┐
│        Runner         │              │      Validator        │
│  + Framework Template │              │  (Chai assertions)    │
└───────────────────────┘              └───────────────────────┘
            │                                   ▲
            │ rendered test                     │ spans
            ▼                                   │
┌───────────────────────┐              ┌───────────────────────┐
│   Test Execution      │─────────────▶│    Span Collector     │
│   (runs/ directory)   │   Sentry     │    (HTTP server)      │
└───────────────────────┘              └───────────────────────┘
```

### Orchestrator (`src/orchestrator.ts`)

Entry point. Discovers frameworks, builds test matrix, coordinates execution, generates reports.

### Span Collector (`src/span-collector/`)

HTTP server that mimics Sentry's envelope endpoint. Creates dynamic DSN endpoints per test run, collects spans.

### Test Cases (`src/test-cases/`)

TypeScript test definitions shared across all frameworks. Each test has a `type` ("llm" or "agent") that determines which frameworks can run it.

### Runner (`src/runner/`)

- `runner.ts` - Main runner orchestration
- `javascript-runner.ts` - Node.js environment setup and execution
- `browser-runner.ts` - Browser environment setup, Vite bundling, and Playwright execution
- `python-runner.ts` - Python/uv environment setup and execution
- `php-runner.ts` - PHP/Laravel environment setup and execution
- `template-renderer.ts` - Nunjucks template rendering
- `framework-discovery.ts` - Auto-discovers frameworks from templates directory

### Validator (`src/validator.ts`)

Runs each check function from the test definition's `checks` array against captured spans.

### Reporters (`src/reporters/`)

- `ctrf-reporter.ts` - CTRF JSON report generation
- `live-status.ts` - Real-time terminal status display

## Test Definition Format

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

### Agent Test Definition

```typescript
// src/test-cases/agents/tool-call.ts
import { TestDefinition } from "../../types.js";
import {
  checkAgentSpanAttributes,
  checkChatSpanAttributes,
  checkToolSpanAttributes,
  checkValidTokenUsage,
  checkToolCalls,
} from "../checks.js";

export const toolCallAgentTest: TestDefinition = {
  name: "Tool Call Agent Test",
  description: "Agent with successful tool calling",
  type: "agent",

  agent: {
    name: "math_assistant",
    description: "A math assistant that can perform calculations",
    tools: [
      {
        name: "add",
        description: "Add two numbers together",
        parameters: {
          type: "object",
          properties: {
            a: { type: "number", description: "First number" },
            b: { type: "number", description: "Second number" },
          },
          required: ["a", "b"],
        },
        result: 8,
      },
    ],
  },

  inputs: [
    {
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: "What is 3 + 5? Use the add tool." }],
    },
  ],

  checks: [
    checkAgentSpanAttributes,
    checkChatSpanAttributes,
    checkToolSpanAttributes,
    checkValidTokenUsage,
    checkToolCalls([{ name: "add", input: { a: 3, b: 5 }, output: 8 }]),
  ],
};
```

## Framework Classification

| Type         | Test Type | Supports           | Examples                                    |
| ------------ | --------- | ------------------ | ------------------------------------------- |
| **llm-only** | `llm`     | Simple completions | OpenAI SDK, Anthropic SDK, LangChain        |
| **agentic**  | `agent`   | Agents with tools  | Vercel AI, LangGraph, Mastra, OpenAI Agents |

Frameworks with type `agentic` run agent tests. Frameworks with type `llm-only` run LLM tests.

## Framework Templates

Each framework has a directory with `config.json` and `template.njk`:

```
src/runner/templates/

├── base.node.njk                     # Base JavaScript (Node) template
├── base.python.njk                   # Base Python template
├── base.browser.njk                  # Base JavaScript (Browser) template
├── base.php.njk                      # Base PHP (Laravel) template
├── llm/                              # LLM-only frameworks
│   ├── node/
│   │   ├── openai/
│   │   │   ├── config.json
│   │   │   └── template.njk
│   │   ├── anthropic/
│   │   ├── google-genai/
│   │   └── langchain/
│   ├── browser/
│   │   ├── openai/
│   │   ├── anthropic/
│   │   ├── google-genai/
│   │   └── langchain/
│   └── python/
│       ├── openai/
│       ├── anthropic/
│       ├── langchain/
│       └── litellm/
└── agents/                           # Agentic frameworks
    ├── node/
    │   ├── vercel/
    │   ├── langgraph/
    │   └── mastra/
    ├── python/
    │   ├── openai-agents/
    │   ├── langgraph/
    │   ├── pydantic-ai/
    │   └── google-genai/
    └── php/
        └── laravel/
```

### Framework Configuration (`config.json`)

```json
{
  "name": "openai",
  "displayName": "OpenAI JavaScript SDK",
  "type": "llm-only",
  "platform": "node",
  "streamingMode": "both",
  "dependencies": [{ "package": "openai", "version": "framework" }],
  "versions": ["4.96.0"],
  "sentryVersions": ["latest"],
  "modelOverrides": {
    "request": "gpt-4o-mini",
    "response": "gpt-4o-mini*"
  },
  "skip": {
    "tests": ["Long Input LLM Test"],
    "checks": {
      "Basic LLM Test": ["checkAgentHierarchy"]
    }
  }
}
```

### Configuration Fields

| Field            | Description                                           |
| ---------------- | ----------------------------------------------------- |
| `name`           | Framework identifier                                  |
| `displayName`    | Human-readable name                                   |
| `type`           | `"llm-only"` or `"agentic"`                           |
| `platform`       | `"node"`, `"python"`, `"browser"`, `"nextjs"`, or `"php"` |
| `streamingMode`  | `"streaming"`, `"blocking"`, or `"both"`              |
| `executionMode`  | Python only: `"sync"`, `"async"`, or `"both"`         |
| `dependencies`   | NPM/pip packages to install                           |
| `versions`       | Framework versions to test                            |
| `sentryVersions` | Sentry SDK versions to test against                   |
| `modelOverrides` | Override model names for validation                   |
| `skip.tests`     | Test names to skip entirely                           |
| `skip.checks`    | Per-test check names to skip                          |

## Directory Structure

```
testing-ai-sdk-integrations/
├── package.json                # Orchestrator dependencies
├── tsconfig.json
├── .env                        # API keys (gitignored)
│
├── src/                        # TypeScript source (ES modules)
│   ├── cli.ts                  # CLI entry point
│   ├── orchestrator.ts         # Main test coordinator
│   ├── types.ts                # Core type definitions
│   ├── validator.ts            # Test validation logic
│   ├── setup.ts                # Setup utilities
│   ├── concurrency.ts          # Parallel execution support
│   │
│   ├── test-cases/             # Test definitions
│   │   ├── index.ts            # Test registry
│   │   ├── checks.ts           # Reusable check functions
│   │   ├── utils.ts            # Test utilities
│   │   ├── llm/                # LLM test cases
│   │   │   ├── basic.ts
│   │   │   ├── multi-turn.ts
│   │   │   ├── basic-error.ts
│   │   │   ├── vision.ts
│   │   │   └── long-input.ts
│   │   └── agents/             # Agent test cases
│   │       ├── basic.ts
│   │       ├── tool-call.ts
│   │       ├── tool-error.ts
│   │       ├── vision.ts
│   │       └── long-input.ts
│   │
│   ├── runner/                 # Test execution
│   │   ├── runner.ts
│   │   ├── javascript-runner.ts
│   │   ├── python-runner.ts
│   │   ├── framework-config.ts
│   │   ├── framework-discovery.ts
│   │   ├── template-renderer.ts
│   │   └── templates/          # Framework templates
│   │
│   ├── span-collector/         # HTTP server
│   │   ├── server.ts
│   │   └── store.ts
│   │
│   └── reporters/              # Output reporters
│       ├── ctrf-reporter.ts
│       └── live-status.ts
│
├── dist/                       # Compiled JavaScript
├── runs/                       # Generated test environments (gitignored)
│   ├── node/
│   │   └── openai-4.96.0-sentry-latest/
│   │       ├── node_modules/
│   │       ├── package.json
│   │       └── test-basic-llm-test.js
│   ├── browser/
│   │   └── openai-4.96.0-sentry-latest/
│   │       ├── node_modules/
│   │       ├── dist/             # Vite-bundled HTML files
│   │       └── test-basic-llm-test-streaming.html
│   ├── python/
│   │   └── openai-1.82.0-sentry-latest/
│   │       ├── .venv/
│   │       └── test-basic-llm-test-async-streaming.py
│   └── php/
│       └── laravel-0.1.0-sentry-latest/
│           ├── vendor/
│           ├── app/Ai/Agents/
│           ├── app/Ai/Tools/
│           ├── app/Console/Commands/
│           └── test-basic-agent-test.php
│
├── test-results/               # Generated reports
│   ├── ctrf-report-*.json
│   └── test-report-*.html
│
├── docs/                       # Documentation
└── archive/                    # Old implementation (reference)
```

## Execution Flow

1. **CLI** parses arguments, creates Orchestrator
2. **Discovery** scans `templates/` for framework `config.json` files
3. **Matrix Generation** creates test combinations:
   - Framework × Test Definition × Execution Modes (sync/async, streaming/blocking)
4. **For each test run:**
   - Check/create environment cache (`runs/{platform}/{framework}-{version}/`)
   - Install dependencies if needed (npm install / uv sync)
   - **Render** template with test definition context + Sentry DSN
   - **Execute** rendered test file
   - **Collect** spans from Span Collector HTTP server
   - **Validate** by running each check function against spans
5. **Report** results to console + CTRF JSON + HTML

## Template Context

Templates receive this context when rendering:

```javascript
{
  // From test definition
  testName: "Basic LLM Test",
  inputs: [{ model: "gpt-4o-mini", messages: [...] }],
  agent: { name: "...", tools: [...] },  // For agent tests
  causeAPIError: false,

  // From framework config
  frameworkName: "openai",

  // From orchestrator
  sentryDsn: "http://public@localhost:9999/123456",

  // Execution mode flags
  isAsync: true,      // Python only
  isStreaming: false,
}
```

## Check Functions

Checks are reusable validation functions defined in `src/test-cases/checks.ts`:

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

**Structure:**

- `checkAISpanCount(n)` - Validate exact or range of AI span count

**Span Attributes:**

- `checkChatSpanAttributes` - Validate chat/completion spans
- `checkAgentSpanAttributes` - Validate agent invocation spans
- `checkToolSpanAttributes` - Validate tool execution spans
- `checkAvailableTools` - Validate available_tools attribute
- `checkResponseToolCalls([...])` - Validate tool calls in response
- `checkToolCalls([...])` - Validate tool execution with input/output

**Tokens:**

- `checkValidTokenUsage` - Token counts exist and are valid
- `checkInputTokensCached` - Cached tokens ≤ input tokens
- `checkOutputTokensReasoning` - Reasoning tokens ≤ output tokens

**Messages:**

- `checkInputMessagesSchema` - Validate message schema
- `checkBinaryRedaction` - Binary content is redacted
- `checkMessageTrimming` - Long messages are trimmed
- `checkTrimmingMetadata` - Trimming metadata is present

**Hierarchy:**

- `checkAgentHierarchy` - Agent span hierarchy and name propagation

## Supported Frameworks

### Node.js

| Type   | Framework    | Streaming | Notes                                     |
| ------ | ------------ | --------- | ----------------------------------------- |
| llm    | openai       | both      | OpenAI SDK                                |
| llm    | anthropic    | both      | Anthropic SDK                             |
| llm    | google-genai | both      | Google Generative AI                      |
| llm    | langchain    | both      | LangChain                                 |
| agents | vercel       | -         | Vercel AI SDK                             |
| agents | langgraph    | -         | LangGraph                                 |
| agents | mastra       | -         | Mastra AI Framework (uses @mastra/sentry) |

### Browser

| Type   | Framework    | Streaming | Notes                                     |
| ------ | ------------ | --------- | ----------------------------------------- |
| llm    | openai       | both      | OpenAI SDK                                |
| llm    | anthropic    | both      | Anthropic SDK                             |
| llm    | google-genai | both      | Google Generative AI                      |
| llm    | langchain    | both      | LangChain                                 |
| agents | vercel       | -         | Vercel AI SDK                             |
| agents | langgraph    | -         | LangGraph                                 |
| agents | mastra       | -         | Mastra AI Framework (uses @mastra/sentry) |

### Python

| Type   | Framework     | Streaming | Execution  |
| ------ | ------------- | --------- | ---------- |
| llm    | openai        | both      | sync/async |
| llm    | anthropic     | both      | sync/async |
| llm    | langchain     | both      | sync/async |
| llm    | litellm       | both      | sync/async |
| agents | openai-agents | -         | async      |
| agents | langgraph     | -         | sync/async |
| agents | pydantic-ai   | -         | async      |
| agents | google-genai  | -         | sync/async |

### PHP (Laravel)

| Type   | Framework | Streaming | Notes                         |
| ------ | --------- | --------- | ----------------------------- |
| agents | laravel   | -         | Laravel AI via sentry-laravel |

## CLI Commands

```bash
# Run all tests
npm run test run

# List discovered frameworks
npm run test list

# Filter by framework/platform/test
npm run test -- --framework openai
npm run test -- --platform python
npm run test -- --test "Basic LLM Test"

# Execution mode filters
npm run test -- --streaming    # Only streaming tests
npm run test -- --blocking     # Only non-streaming tests
npm run test -- --sync         # Only sync tests (Python)
npm run test -- --async        # Only async tests (Python)

# Parallel execution
npm run test -- -j=4

# Verbose output
npm run test -- --verbose

# Use local Sentry SDK
npm run test -- --sentry-python /path/to/sentry-python
npm run test -- --sentry-javascript /path/to/sentry-javascript

# Setup only (generate files without running)
npm run test setup -- --framework openai
```

## Special Framework: Mastra

Mastra uses its own Sentry integration (`@mastra/sentry`) rather than `@sentry/node`. Key differences:

- Uses `SentryExporter` from `@mastra/sentry` with Mastra's `Observability` system
- Attribute names follow newer OpenTelemetry conventions:
  - `gen_ai.input.messages` instead of `gen_ai.request.messages`
  - `gen_ai.tool.call.arguments` instead of `gen_ai.tool.input`
- Tool type is `"tool"` instead of `"function"`
- Template does not extend base.node.njk (standalone implementation)
