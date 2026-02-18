# Sentry AI SDK Integration Tests

A comprehensive testing framework for validating Sentry's automatic instrumentation of popular AI SDKs.

## Overview

Sentry SDKs (JavaScript and Python) automatically instrument popular AI SDKs like OpenAI, Anthropic, and LangChain. This repository tests those integrations to ensure they:

- Capture performance data (spans, transactions)
- Track AI-specific metadata (models, tokens, prompts, completions)
- Report errors with proper context
- Work correctly as AI SDK versions evolve

## Project Structure

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
│   │   └── agents/                   # Agent test cases
│   │       ├── basic.ts              # Basic agent (no tools)
│   │       ├── tool-call.ts          # Agent with tool calling
│   │       ├── tool-error.ts         # Tool error handling
│   │       ├── vision.ts             # Vision agent test
│   │       └── long-input.ts         # Long input agent test
│   ├── runner/                       # Test execution
│   │   ├── runner.ts                 # Main runner
│   │   ├── javascript-runner.ts      # JS (Node) execution
│   │   ├── browser-runner.ts         # Browser execution (Playwright)
│   │   ├── python-runner.ts          # Python execution
│   │   ├── php-runner.ts             # PHP (Laravel) execution
│   │   ├── framework-config.ts       # Framework configuration types
│   │   ├── framework-discovery.ts    # Auto-discovers frameworks
│   │   ├── template-renderer.ts      # Nunjucks template rendering
│   │   └── templates/                # Framework templates
│   │       ├── base.node.njk         # Base JavaScript (Node) template
│   │       ├── base.python.njk       # Base Python template
│   │       ├── base.browser.njk      # Base JavaScript (Browser) template
│   │       ├── base.nextjs.njk       # Base Next.js template
│   │       ├── base.php.njk          # Base PHP (Laravel) template
│   │       ├── llm/                  # LLM framework templates
│   │       │   ├── node/{openai,anthropic,google-genai,langchain}/
│   │       │   ├── browser/{openai,anthropic,google-genai,langchain}/
│   │       │   ├── nextjs/{openai,anthropic,google-genai,langchain}/
│   │       │   └── python/{openai,anthropic,langchain,litellm}/
│   │       └── agents/               # Agent framework templates
│   │           ├── node/{langgraph,mastra,vercel}/
│   │           ├── nextjs/{mastra,vercel}/
│   │           ├── python/{langgraph,openai-agents,pydantic-ai,google-genai}/
│   │           └── php/{laravel}/
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
├── .env                              # Environment variables (gitignored)
├── .env.example                      # Template for API keys
└── package.json
```

## Quick Start

### Prerequisites

- Node.js 18+ (for JavaScript tests and orchestration)
- Python 3.9+ (for Python tests)
- uv (Python package manager, recommended)
- API keys for AI services (OpenAI, Anthropic, Google)

### Setup

1. Clone the repository:

```bash
git clone <repository-url>
cd testing-ai-sdk-integrations
```

2. Copy and configure environment variables:

```bash
cp .env.example .env
# Edit .env with your API keys
```

3. Install dependencies and build:

```bash
npm install
npm run build
```

4. List available frameworks:

```bash
npm run test list
```

5. Run all tests:

```bash
npm run test run
```

### CLI Usage

```bash
# Run all tests
npm run test run

# Run tests for a specific framework
npm run test -- --framework openai

# Run tests for a specific platform
npm run test -- --platform python
npm run test -- --platform browser
npm run test -- --platform nextjs
npm run test -- --platform php                        # PHP platform (Laravel)
npm run test -- --platform js                         # all JS platforms (node + browser)

# Run a specific test
npm run test -- --test "Basic LLM Test"

# Run with verbose output
npm run test -- --framework openai --verbose

# Run only streaming tests
npm run test -- --streaming

# Run only blocking (non-streaming) tests
npm run test -- --blocking

# Run only sync tests (Python)
npm run test -- --platform python --sync

# Run only async tests (Python)
npm run test -- --platform python --async

# Run tests in parallel
npm run test -- -j=4

# Run tests and open report in browser
npm run test -- --framework openai --open

# Setup only (generate test files without running)
npm run test setup -- --framework openai

# Use local Sentry SDK
npm run test -- --sentry-python /path/to/sentry-python
npm run test -- --sentry-javascript /path/to/sentry-javascript
```

### CLI Options

| Option                                      | Description                                  |
| ------------------------------------------- | -------------------------------------------- |
| `--framework <name>`                        | Filter by framework name                     |
| `--test <name>`                             | Filter by test name                          |
| `--platform <node\|python\|browser\|nextjs\|php\|js>` | Filter by platform (`js` = node + browser)   |
| `--sync`                                    | Run only sync tests (Python, default: both)  |
| `--async`                                   | Run only async tests (Python, default: both) |
| `--streaming`                               | Run only streaming tests (default: both)     |
| `--blocking`                                | Run only blocking tests (default: both)      |
| `-j, --parallel <N>`                        | Run up to N tests in parallel                |
| `-v, --verbose`                             | Show detailed output                         |
| `--live-status`                             | Enable real-time status display              |
| `--open`                                    | Open HTML report in browser after test run   |
| `--sentry-python <path>`                    | Use local Sentry Python SDK                  |
| `--sentry-javascript <path>`                | Use local Sentry JavaScript SDK              |

## Test Matrix Structure

Tests are organized in a hierarchical structure:

```
Type / Platform / Framework / Test Case
```

| Dimension     | Description                | Examples                                                                                                       |
| ------------- | -------------------------- | -------------------------------------------------------------------------------------------------------------- |
| **Type**      | Category of AI integration | `llm` (low-level LLM SDKs), `agents` (agentic frameworks)                                                      |
| **Platform**  | Runtime environment        | `node` (Node.js), `browser` (Playwright), `nextjs` (Next.js), `python` (Python), `php` (Laravel). CLI also accepts `js` (= node + browser) |
| **Framework** | AI SDK being tested        | `openai`, `anthropic`, `langchain`, `langgraph`, etc.                                                          |
| **Test Case** | Specific test scenario     | `Basic LLM Test`, `Tool Call Agent Test`, etc.                                                                 |

This structure is reflected in the templates directory:

```
src/runner/templates/
├── llm/                      # Type: LLM
│   ├── node/                 # Platform: Node.js
│   │   ├── openai/           # Framework
│   │   ├── anthropic/
│   │   ├── google-genai/
│   │   └── langchain/
│   ├── browser/              # Platform: Browser (Playwright)
│   │   ├── openai/
│   │   ├── anthropic/
│   │   ├── google-genai/
│   │   └── langchain/
│   ├── nextjs/               # Platform: Next.js
│   │   ├── openai/
│   │   ├── anthropic/
│   │   ├── google-genai/
│   │   └── langchain/
│   └── python/               # Platform: Python
│       ├── openai/
│       ├── anthropic/
│       ├── langchain/
│       └── litellm/
└── agents/                   # Type: Agents
    ├── node/
    │   ├── langgraph/
    │   ├── mastra/
    │   └── vercel/
    ├── nextjs/
    │   ├── mastra/
    │   └── vercel/
    ├── python/
    │   ├── langgraph/
    │   ├── openai-agents/
    │   ├── pydantic-ai/
    │   └── google-genai/
    └── php/
        └── laravel/
```

When tests run, each **Test Case** is rendered using the framework's template and executed. For example:

- `llm / python / openai / Basic LLM Test` → Tests OpenAI Python SDK with a simple completion
- `agents / node / langgraph / Tool Call Agent Test` → Tests LangGraph JS with tool calling

## Supported Frameworks

| Type   | Platform | Framework       | Streaming | Execution Modes |
| ------ | -------- | --------------- | --------- | --------------- |
| llm    | Node.js  | `openai`        | both      | -               |
| llm    | Node.js  | `anthropic`     | both      | -               |
| llm    | Node.js  | `google-genai`  | both      | -               |
| llm    | Node.js  | `langchain`     | both      | -               |
| llm    | Browser  | `openai`        | both      | -               |
| llm    | Browser  | `anthropic`     | both      | -               |
| llm    | Browser  | `google-genai`  | both      | -               |
| llm    | Browser  | `langchain`     | both      | -               |
| llm    | Next.js  | `openai`        | both      | -               |
| llm    | Next.js  | `anthropic`     | both      | -               |
| llm    | Next.js  | `google-genai`  | both      | -               |
| llm    | Next.js  | `langchain`     | both      | -               |
| llm    | Python   | `openai`        | both      | sync/async      |
| llm    | Python   | `anthropic`     | both      | sync/async      |
| llm    | Python   | `langchain`     | both      | sync/async      |
| llm    | Python   | `litellm`       | both      | sync/async      |
| agents | Node.js  | `vercel`        | -         | -               |
| agents | Node.js  | `langgraph`     | -         | -               |
| agents | Node.js  | `mastra`        | -         | -               |
| agents | Next.js  | `vercel`        | -         | -               |
| agents | Next.js  | `mastra`        | -         | -               |
| agents | Python   | `openai-agents` | -         | async           |
| agents | Python   | `langgraph`     | -         | sync/async      |
| agents | Python   | `pydantic-ai`   | -         | async           |
| agents | Python   | `google-genai`  | -         | sync/async      |
| agents | PHP      | `laravel`       | -         | -               |

## Test Cases

Test cases are defined in `src/test-cases/` and apply to frameworks based on their **type**.

### LLM Test Cases (for `llm` type frameworks)

| Test Case              | Description                               |
| ---------------------- | ----------------------------------------- |
| `Basic LLM Test`       | Single completion with system message     |
| `Multi Turn LLM Test`  | Multi-turn conversation                   |
| `Basic Error LLM Test` | API error handling                        |
| `Vision LLM Test`      | Image input processing                    |
| `Long Input LLM Test`  | Message trimming for large inputs (>20KB) |

### Agent Test Cases (for `agents` type frameworks)

| Test Case               | Description                             |
| ----------------------- | --------------------------------------- |
| `Basic Agent Test`      | Agent without tools (simple completion) |
| `Tool Call Agent Test`  | Agent with successful tool calling      |
| `Tool Error Agent Test` | Agent with tool that raises exception   |
| `Vision Agent Test`     | Agent that processes images             |
| `Long Input Agent Test` | Agent with large input trimming         |

## Check Functions

Each test case specifies an explicit list of **checks** that validate the captured Sentry spans. Checks are reusable functions defined in `src/test-cases/checks.ts`.

### Check Structure

A check is an object with a `name` and validation function:

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

Test cases explicitly list their checks:

```typescript
export const basicLLMTest: TestDefinition = {
  name: "Basic LLM Test",
  type: "llm",
  inputs: [...],

  checks: [
    checkAISpanCount(1),
    checkChatSpanAttributes,
    checkValidTokenUsage,
    checkInputTokensCached,
    checkOutputTokensReasoning,
  ],
};
```

### Available Checks

#### Structure Checks

| Check                 | Description                                |
| --------------------- | ------------------------------------------ |
| `checkAISpanCount(n)` | Factory function to validate AI span count |

The `checkAISpanCount` factory function accepts:

- A number for exact count: `checkAISpanCount(1)`, `checkAISpanCount(3)`
- An object with bounds: `checkAISpanCount({ min: 1 })`, `checkAISpanCount({ max: 5 })`, `checkAISpanCount({ min: 2, max: 4 })`

#### Span Type Attribute Checks

| Check                           | Description                                                       |
| ------------------------------- | ----------------------------------------------------------------- |
| `checkChatSpanAttributes`       | Validates chat/completion spans (model, messages, tokens)         |
| `checkAgentSpanAttributes`      | Validates agent invocation spans (gen_ai.agent.name)              |
| `checkToolSpanAttributes`       | Validates tool execution spans (type, name, description)          |
| `checkHandoffSpanAttributes`    | Validates handoff spans (agent-to-agent transfers)                |
| `checkAvailableTools`           | Validates gen_ai.request.available_tools matches test's tool defs |
| `checkResponseToolCalls([...])` | Factory to validate gen_ai.response.tool_calls on chat spans      |
| `checkToolCalls([...])`         | Factory to validate tool execution spans with input/output        |

Each check **fails if no spans of that type are found**. Use these to verify the expected span types are captured.

**Tool validation factories:**

```typescript
// Validate tool calls in LLM response (gen_ai.response.tool_calls)
checkResponseToolCalls([
  { name: "add", arguments: { a: 3, b: 5 } },
  { name: "multiply", arguments: { a: 8, b: 4 } },
]);

// Validate tool execution spans (gen_ai.tool.*)
checkToolCalls([
  {
    name: "add",
    type: "function",
    description: "Add two numbers together",
    input: { a: 3, b: 5 },
    output: 8,
  },
]);
```

#### Token Checks

| Check                        | Description                                             |
| ---------------------------- | ------------------------------------------------------- |
| `checkValidTokenUsage`       | Token counts exist on invoke_agent and chat spans       |
| `checkInputTokensCached`     | Cached tokens ≤ input tokens (skips if not present)     |
| `checkOutputTokensReasoning` | Reasoning tokens ≤ output tokens (skips if not present) |

#### Message Schema Checks

| Check                      | Description                                                  |
| -------------------------- | ------------------------------------------------------------ |
| `checkInputMessagesSchema` | Validates `gen_ai.input.messages` follows Sentry conventions |

The `checkInputMessagesSchema` check validates that the input messages attribute follows the [Sentry conventions schema](https://getsentry.github.io/sentry-conventions/generated/attributes/gen_ai.html#gen_aiinputmessages):

- Must be an array of message objects
- Each message must have a `role` field: "user", "assistant", "tool", or "system"
- Each message must have a `parts` array (new format) or `content` field (legacy)
- Parts can have types: "text", "tool_call", "tool_call_response", "image"
- Validates type-specific fields (e.g., tool_call must have name)

#### Message Trimming Checks

| Check                   | Description                         |
| ----------------------- | ----------------------------------- |
| `checkMessageTrimming`  | Messages are trimmed below 15KB     |
| `checkTrimmingMetadata` | Original length metadata is present |

#### Agent-specific Checks

| Check                 | Description                                                                       |
| --------------------- | --------------------------------------------------------------------------------- |
| `checkAgentHierarchy` | Validates agent span hierarchy and `gen_ai.agent.name` propagation to child spans |

### Checks by Test Case

#### LLM Tests

**Basic LLM Test:**

- `checkAISpanCount(1)`, `checkChatSpanAttributes`, `checkValidTokenUsage`, `checkInputMessagesSchema`, `checkInputTokensCached`, `checkOutputTokensReasoning`

**Multi-Turn LLM Test:**

- `checkAISpanCount(3)`, `checkChatSpanAttributes`, `checkValidTokenUsage`, `checkTokenProgression` (inline), `checkInputMessagesSchema`, `checkInputTokensCached`, `checkOutputTokensReasoning`

**Basic Error LLM Test:**

- `checkAISpanCount({ min: 1 })`, `checkErrorCaptured` (inline)

**Vision LLM Test:**

- `checkChatSpanAttributes`, `checkValidTokenUsage`, `checkInputMessagesSchema`

**Long Input LLM Test:**

- `checkChatSpanAttributes`, `checkMessageTrimming`, `checkTrimmingMetadata`, `checkInputMessagesSchema`

#### Agent Tests

**Basic Agent Test:**

- `checkAgentSpanAttributes`, `checkChatSpanAttributes`, `checkValidTokenUsage`, `checkAgentHierarchy`, `checkInputMessagesSchema`, `checkInputTokensCached`, `checkOutputTokensReasoning`

**Tool Call Agent Test:**

- `checkAgentSpanAttributes`, `checkChatSpanAttributes`, `checkToolSpanAttributes`, `checkValidTokenUsage`, `checkAgentHierarchy`, `checkAvailableTools`, `checkResponseToolCalls([...])`, `checkToolCalls([...])`, `checkInputMessagesSchema`, `checkInputTokensCached`, `checkOutputTokensReasoning`

**Tool Error Agent Test:**

- `checkAgentSpanAttributes`, `checkChatSpanAttributes`, `checkToolSpanAttributes`, `checkAgentHierarchy`, `checkAvailableTools`, `checkResponseToolCalls([...])`, `checkInputMessagesSchema`, `checkToolErrorSpan` (inline)

**Vision Agent Test:**

- `checkAgentSpanAttributes`, `checkChatSpanAttributes`, `checkValidTokenUsage`, `checkAgentHierarchy`, `checkInputMessagesSchema`

**Long Input Agent Test:**

- `checkAgentSpanAttributes`, `checkChatSpanAttributes`, `checkMessageTrimming`, `checkTrimmingMetadata`, `checkAgentHierarchy`, `checkInputMessagesSchema`

## How It Works

1. **Discovery**: Scans `templates/` directory for framework configurations
2. **Matrix Generation**: Creates test matrix (framework × test × execution modes)
3. **Template Rendering**: Generates runnable test files using Nunjucks templates
4. **Execution**: Runs tests with Sentry DSN pointing to local span collector
5. **Validation**: Runs each check function against captured spans
6. **Reporting**: Generates console output and CTRF JSON report

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

Test cases use an explicit `checks` array to define validations:

```typescript
// src/test-cases/llm/your-test.ts
import { TestDefinition } from "../../types.js";
import {
  checkAISpanCount,
  checkChatSpanAttributes,
  checkValidTokenUsage,
} from "../checks.js";

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

  checks: [
    checkAISpanCount({ min: 1 }),
    checkChatSpanAttributes,
    checkValidTokenUsage,
  ],
};

export default yourTest;
```

### 2. Adding Custom Checks

For test-specific validations, define custom checks inline:

```typescript
import { expect } from "chai";
import { TestDefinition, Check } from "../../types.js";
import { checkAISpanCount } from "../checks.js";
import { extractGenAISpans, skipIf } from "../utils.js";

// Custom check for this test
const checkSpecificBehavior: Check = {
  name: "checkSpecificBehavior",
  fn: (spans, config, testDef) => {
    const aiSpans = extractGenAISpans(spans);
    skipIf(aiSpans.length === 0, "No AI spans captured");

    // Your custom validation logic
    expect(aiSpans[0].data?.["custom.attribute"]).to.exist;
  },
};

export const yourTest: TestDefinition = {
  name: "Your Test Name",
  type: "llm",
  inputs: [...],

  checks: [
    checkAISpanCount({ min: 1 }),
    checkSpecificBehavior,  // Custom check
  ],
};
```

### 3. Register in Index

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

### 4. Build and Test

```bash
npm run build
npm run test -- --test "Your Test Name" --verbose
```

## Framework Configuration

Each framework has a `config.json` with these fields:

| Field            | Description                                   |
| ---------------- | --------------------------------------------- |
| `name`           | Framework identifier                          |
| `displayName`    | Human-readable name                           |
| `type`           | `"llm-only"` or `"agentic"`                   |
| `platform`       | `"node"`, `"python"`, `"browser"`, `"php"`, or `"nextjs"`  |
| `streamingMode`  | `"streaming"`, `"blocking"`, or `"both"`      |
| `executionMode`  | Python only: `"sync"`, `"async"`, or `"both"` |
| `dependencies`   | NPM/pip packages to install                   |
| `versions`       | Framework versions to test                    |
| `sentryVersions` | Sentry SDK versions to test against           |
| `modelOverrides` | Override model names for validation           |
| `skip`           | Tests or checks to skip                       |

## Test Utilities

Available in `src/test-cases/utils.ts`:

### Core Utilities

| Function               | Purpose                                |
| ---------------------- | -------------------------------------- |
| `skip(reason)`         | Skip the current check with a reason   |
| `skipIf(cond, reason)` | Conditionally skip a check             |
| `extractGenAISpans()`  | Filter spans for `gen_ai.*` operations |
| `checkTokenUsage()`    | Validate token count attributes        |
| `assertAttributes()`   | Schema-based attribute validation      |
| `printSpanSummary()`   | Debug helper to print captured spans   |

### Span Type Filters

| Function             | Purpose                                      |
| -------------------- | -------------------------------------------- |
| `findAgentSpans()`   | Find `invoke_agent` spans (top-level agents) |
| `findChatSpans()`    | Find `chat`/`completion` spans (LLM calls)   |
| `findToolSpans()`    | Find tool execution spans                    |
| `findHandoffSpans()` | Find agent-to-agent handoff spans            |

### Tool Input Validation

| Function            | Purpose                                      |
| ------------------- | -------------------------------------------- |
| `assertToolInput()` | Validate tool input arguments against schema |
| `getToolInput()`    | Get parsed tool input arguments from span    |

### Attribute Schema

The `assertAttributes` function supports flexible matching:

```typescript
assertAttributes(spans, {
  "gen_ai.operation.name": true, // Must exist (any value)
  "gen_ai.request.model": "gpt-4", // Exact match
  "gen_ai.response.model": "gpt-4*", // Pattern match (wildcard)
  sensitive_field: false, // Must NOT exist
});
```

### Tool Input Schema

The `assertToolInput` function validates tool arguments:

```typescript
const toolSpans = findToolSpans(extractGenAISpans(spans));
assertToolInput(toolSpans[0], {
  a: true, // Argument must exist
  b: true, // Argument must exist
  optional: false, // Argument must NOT exist
});
```

## Environment Variables

Create a `.env` file with your API keys:

```bash
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_API_KEY=...
```

## Debugging

### Verbose Mode

```bash
npm run test -- --framework openai --verbose
```

### Setup Only (Inspect Generated Files)

```bash
npm run test setup -- --framework openai
# Check runs/ directory for generated test files
```

### Print Span Data

Use `printSpanSummary()` in a custom check:

```typescript
import { printSpanSummary } from "../utils.js";

const debugCheck: Check = {
  name: "debugCheck",
  fn: (spans) => {
    printSpanSummary(spans);
  },
};
```

## Using as a GitHub Action

This repository can be used as a reusable GitHub Action in SDK repositories to run AI integration tests on a schedule.

### Setup in SDK Repositories

Create a workflow in your SDK repo (e.g., `.github/workflows/ai-integration-tests.yml`):

```yaml
name: AI Integration Tests

on:
  schedule:
    - cron: "0 9 * * 1" # Weekly on Monday at 9am UTC
  workflow_dispatch:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout SDK repository
        uses: actions/checkout@v4

      - name: Run AI Integration Tests
        uses: getsentry/testing-ai-sdk-integrations@v1
        with:
          platform: python # or 'node', or leave empty for both
          openai-api-key: ${{ secrets.OPENAI_API_KEY }}
          anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
          google-api-key: ${{ secrets.GOOGLE_API_KEY }}
```

### Action Inputs

| Input                    | Required | Default       | Description                                                                                   |
| ------------------------ | -------- | ------------- | --------------------------------------------------------------------------------------------- |
| `platform`               | No       | `""`          | Platform to test: `node`, `python`, `browser`, `nextjs`, `php`, `js` (= node + browser), or empty for all |
| `framework`              | No       | `""`          | Specific framework to test (e.g., `openai`, `langchain`)                                      |
| `test`                   | No       | `""`          | Specific test to run (e.g., `Basic LLM Test`)                                                 |
| `parallel`               | No       | `4`           | Number of tests to run in parallel                                                            |
| `sentry-python-path`     | No       | `""`          | Path to local sentry-python for editable install                                              |
| `sentry-javascript-path` | No       | `""`          | Path to local sentry-javascript for linking                                                   |
| `openai-api-key`         | Yes      | -             | OpenAI API key                                                                                |
| `anthropic-api-key`      | Yes      | -             | Anthropic API key                                                                             |
| `google-api-key`         | Yes      | -             | Google API key for GenAI                                                                      |
| `google-vertex-project`  | No       | `""`          | Google Vertex AI project ID                                                                   |
| `google-vertex-location` | No       | `us-central1` | Google Vertex AI location                                                                     |

### Action Outputs

| Output    | Description                                   |
| --------- | --------------------------------------------- |
| `success` | `true` if all tests passed, `false` otherwise |
| `total`   | Total number of tests run                     |
| `passed`  | Number of tests that passed                   |
| `failed`  | Number of tests that failed                   |

### Advanced Usage

```yaml
# Test specific framework with local SDK
- name: Run AI Integration Tests
  id: ai-tests
  uses: getsentry/testing-ai-sdk-integrations@v1
  with:
    platform: python
    framework: openai
    parallel: 8
    sentry-python-path: ${{ github.workspace }}
    openai-api-key: ${{ secrets.OPENAI_API_KEY }}
    anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
    google-api-key: ${{ secrets.GOOGLE_API_KEY }}

- name: Check results
  run: |
    echo "Success: ${{ steps.ai-tests.outputs.success }}"
    echo "Passed: ${{ steps.ai-tests.outputs.passed }}/${{ steps.ai-tests.outputs.total }}"
```

### How It Works

- The action installs dependencies and builds the test framework
- Runs tests for the specified platform/framework with parallel execution
- Uploads test results as artifacts
- On failure, automatically creates or updates an issue in the calling repository
- Issues are labeled with `ai-integration-test-failure` for easy tracking
- Test results with detailed failure information are included in the issue body

## References

- **Sentry JavaScript SDK:** https://github.com/getsentry/sentry-javascript
- **Sentry Python SDK:** https://github.com/getsentry/sentry-python
- **Vercel AI SDK:** https://sdk.vercel.ai/docs
- **OpenAI Python SDK:** https://github.com/openai/openai-python
- **Mastra AI Framework:** https://mastra.ai/docs
