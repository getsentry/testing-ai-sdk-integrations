# Architecture V3

## Overview

Test framework for Sentry AI SDK integrations. Abstract test definitions describe behavior; framework templates render executable tests.

## Components

```
┌─────────────────────────────────────────────────────────────────┐
│                      Test Definition                            │
│     { name, system?, agent?, input, checks(spans) }             │
└─────────────────────────────────────────────────────────────────┘
                              │
            ┌─────────────────┴─────────────────┐
            │ static config                     │ checks function
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

### Orchestrator
Entry point. Discovers tests, coordinates execution, generates reports.

### Span Collector
HTTP server. Creates dynamic DSN endpoints, collects spans per test run.

### Test Library
Abstract test definitions (JS modules). Shared across all frameworks.

### Runner
Renders framework template with test definition config. Executes in cached environment.

### Validator
Runs `checks(spans)` function from test definition using Chai.

## Test Definition Format

### Simple LLM Test

```javascript
import { expect } from "chai";
import { extractGenAISpans, assertBasicGenAISpan } from "./checks.js";

export default {
  name: "Basic LLM test",
  description: "Single completion call",
  system: "You are a helpful assistant.",
  input: {
    model: "gpt-4o",
    prompt: "What is the capital of France?",
  },
  checks(spans) {
    const genAISpans = extractGenAISpans(spans);
    expect(genAISpans).to.have.lengthOf(1);
    assertBasicGenAISpan(genAISpans[0]);
  }
};
```

### Agentic Test

```javascript
import { expect } from "chai";
import { extractGenAISpans, assertBasicGenAISpan, assertAgenticSpan } from "./checks.js";

export default {
  name: "Agentic LLM test",
  description: "Agent with tool call",
  agent: {
    name: "math_assistant",
    description: "A math assistant",
    tools: [
      {
        name: "add",
        description: "Add two numbers",
        parameters: {
          type: "object",
          properties: {
            a: { type: "number" },
            b: { type: "number" },
          },
          required: ["a", "b"],
        },
        result: 11,        // Static return value
        // OR: error: "Division by zero"
      },
    ],
  },
  input: {
    model: "gpt-5o",
    prompt: "What is 4 + 7? Use tools only.",
  },
  checks(spans) {
    const genAISpans = extractGenAISpans(spans);
    expect(genAISpans).to.have.lengthOf(1);
    assertBasicGenAISpan(genAISpans[0]);
    assertAgenticSpan(genAISpans[0]);
  }
};
```

## Framework Classification

| Type | Supports | Examples |
|------|----------|----------|
| **LLM-only** | `system` + `input` | OpenAI SDK, Anthropic SDK |
| **Agentic** | `system` + `input`, `agent` + `input` | Vercel AI, LangChain, OpenAI Agents |

Each framework has **one template** that handles all test types it supports.

## Directory Structure

```
testing-ai-sdk-integrations/
├── Makefile                    # Top-level test commands
├── package.json                # Orchestrator dependencies
├── tsconfig.json
│
├── src/                        # Orchestrator source
│   ├── cli.ts
│   ├── orchestrator.ts
│   ├── types.ts
│   ├── validator.ts
│   ├── span-collector/
│   │   ├── server.ts
│   │   └── store.ts
│   ├── runner/
│   │   ├── runner.ts
│   │   ├── template-renderer.ts
│   │   └── templates/
│   │       ├── base.js.njk         # JavaScript base template
│   │       ├── base.py.njk         # Python base template
│   │       ├── llm/                # LLM framework templates
│   │       │   ├── js/
│   │       │   │   ├── openai.njk
│   │       │   │   └── anthropic.njk
│   │       │   └── py/
│   │       │       ├── openai.njk
│   │       │       └── anthropic.njk
│   │       └── agents/             # Agent framework templates
│   │           ├── js/
│   │           │   ├── vercel.njk
│   │           │   └── langchain.njk
│   │           └── py/
│   │               ├── openai-agents.njk
│   │               └── langchain.njk
│   └── test-cases/             # Abstract test definitions
│       ├── llm/
│       │   └── basic.ts
│       ├── agents/
│       │   └── basic.ts
│       └── index.ts
│
├── runs/                       # Cached environments (gitignored)
│   ├── js/
│   │   └── vercel-4.0.0-sentry-8.0.0/
│   │       ├── node_modules/
│   │       ├── package.json
│   │       └── test.js         # Rendered test
│   └── py/
│       └── openai-agents-0.1.0-sentry-2.0.0/
│           ├── .venv/
│           ├── requirements.txt
│           └── test.py
│
└── archive/                    # Old implementation
    ├── sdks/                   # Moved from root
    └── shared/                 # Moved from root
```

## Execution Flow

1. **Discover** test definitions from `test-definitions/`
2. **Start** Span Collector HTTP server
3. **For each** framework × test definition:
   - Check environment cache (`runs/{platform}/{framework}-{version}/`)
   - Install dependencies if needed
   - **Render** template with test definition static config + DSN
   - **Execute** rendered test
   - **Collect** spans from Span Collector
   - **Validate** by running `checks(spans)` from test definition
4. **Report** results

## Runner Input

Runner passes to template:

```javascript
{
  // From test definition (static part)
  name: "Basic LLM test",
  system: "You are a helpful assistant.",
  input: { model: "gpt-4o", prompt: "..." },
  
  // From orchestrator
  sentryDsn: "http://localhost:9999/run-abc123",
  sentryVersion: "8.0.0",
}
```

## Tool Implementation

Templates generate tool implementations from definitions:

```javascript
// Definition
{ name: "add", result: 11 }

// Generated (pseudo-code)
const addTool = tool({
  name: "add",
  execute: async () => 11
});
```

For errors:
```javascript
// Definition
{ name: "divide", error: "Division by zero" }

// Generated
const divideTool = tool({
  name: "divide",
  execute: async () => { throw new Error("Division by zero"); }
});
```

## Initial Scope

**Python only:**
- OpenAI Agents SDK

**Archive:**
- All existing `sdks/` code → `archive/sdks/`
- All existing `shared/` code → `archive/shared/`

## Makefile Commands

```makefile
make test              # Run all tests
make test-js           # Run JavaScript framework tests
make test-py           # Run Python framework tests
make test-framework    # Run specific framework (e.g., make test-framework FRAMEWORK=openai-agents)
make clean             # Remove runs/ cache
make install           # Install orchestrator dependencies
```
