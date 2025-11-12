# Sentry AI SDK Integration Tests

A comprehensive testing framework for validating Sentry's automatic instrumentation of popular AI SDKs.

## Overview

Sentry SDKs (JavaScript and Python) automatically instrument popular AI SDKs like OpenAI, Anthropic, LangChain, and LlamaIndex. This repository tests those integrations to ensure they:

- Capture performance data (spans, transactions)
- Track AI-specific metadata (models, tokens, prompts, completions)
- Report errors with proper context
- Work correctly as AI SDK versions evolve

## Project Structure

```
ai-sdks-test/
├── sdks/
│   ├── js/                        # JavaScript SDK implementations
│   │   ├── _test-utils/           # JS test utilities (mock transport, fixtures, validators)
│   │   ├── openai/
│   │   │   ├── setup.js           # Sentry initialization
│   │   │   ├── config.json        # SDK configuration (framework type, overrides)
│   │   │   ├── package.json
│   │   │   └── cases/             # Test case implementations
│   │   │       └── 1-simple.js
│   │   ├── anthropic/
│   │   ├── langchain/
│   │   ├── langgraph/
│   │   ├── vercel/
│   │   └── google-genai/
│   └── py/                        # Python SDK implementations
│       ├── _test-utils/           # Python test utilities (mock transport, fixtures, validators)
│       ├── openai/
│       │   ├── setup.py           # Sentry initialization
│       │   ├── config.json        # SDK configuration (framework type, overrides)
│       │   ├── requirements.txt
│       │   └── cases/             # Test case implementations
│       │       └── 1-simple.py
│       ├── openai-agents/
│       ├── anthropic/
│       ├── langchain/
│       ├── langgraph/
│       ├── google-genai/
│       ├── litellm/
│       └── pydantic-ai/
├── shared/
│   ├── specs/                     # Test specifications (language-agnostic)
│   │   ├── 1-simple/
│   │   │   ├── spec.md            # Human-readable specification
│   │   │   ├── fixture-agentic.json    # Expected spans for agentic frameworks
│   │   │   └── fixture-low-level.json  # Expected spans for low-level frameworks
│   │   └── 2-simple-with-error/
│   └── orchestration/             # Test runner and CLI
│       ├── src/                   # TypeScript source
│       │   ├── cli.ts             # CLI entry point
│       │   ├── runner.ts          # Test execution
│       │   ├── discovery.ts       # SDK/test discovery
│       │   ├── setup.ts           # Dependency installation
│       │   └── reporters/         # Test reporting (console, CTRF, HTML)
│       ├── dist/                  # Compiled JavaScript
│       └── test-results/          # Generated test reports
├── .env                           # Environment variables (gitignored)
├── .env.example                   # Template for API keys
└── package.json                   # Root package.json for CLI alias
```

## Quick Start

### Prerequisites

- Node.js 18+ (for JavaScript tests)
- Python 3.9+ (for Python tests)
- API keys for AI services (OpenAI, Anthropic, etc.)
- Sentry project DSN (for E2E tests)

### Setup

1. Clone the repository:

```bash
git clone <repository-url>
cd ai-sdks-test
```

2. Copy and configure environment variables:

```bash
cp .env.example .env
# Edit .env with your API keys and Sentry DSN
```

3. Install orchestration dependencies:

```bash
cd shared/orchestration
npm install
cd ../..
```

4. Set up all SDK dependencies:

```bash
npm run cli setup
```

5. Run all tests:

```bash
npm run cli run -- --all
```

6. Run tests with filters:

```bash
# All JavaScript SDKs
npm run cli run js

# All Python SDKs
npm run cli run py

# All SDKs matching "lang" (langchain + langgraph in both JS and Python)
npm run cli run lang

# Specific SDK name across languages (js/langchain + py/langchain)
npm run cli run langchain

# Specific SDK with exact path
npm run cli run js/langgraph

# SDK that only exists in one language
npm run cli run pydantic-ai

# Specific test case across all SDKs
npm run cli run -- --case 1-simple

# Combine filters (langchain SDKs running 1-simple test only)
npm run cli run langchain -- --case 1-simple
```

### CLI Filter Syntax

The CLI supports flexible filtering to run exactly the tests you need:

**Filter Types:**

- **Language filter**: `js` or `py` - Runs all SDKs in that language
- **Exact path**: `js/openai` - Runs a specific SDK
- **Partial name match**: Any string that matches SDK names (uses `contains`)
  - `lang` → matches `langchain`, `langgraph` (in both JS and Python)
  - `langchain` → matches only `langchain` (in both JS and Python)
  - `pydantic` → matches only `pydantic-ai` (Python only)
  - `openai` → matches `openai`, `openai-agents` (in all languages)

**Additional Options:**

- `--case <case-id>` - Filter to specific test case (e.g., `1-simple`)
- `--all` - Run all tests across all SDKs
- `--verbose` - Show detailed output including LLM responses
- `--reports <formats>` - Generate reports (ctrf, html, or all)

**Examples:**

```bash
# Quick language-wide tests
npm run cli run js              # All JS SDKs
npm run cli run py              # All Python SDKs

# Partial matching for related SDKs
npm run cli run lang            # langchain + langgraph (both languages)
npm run cli run openai          # openai + openai-agents (all languages)

# Exact SDK selection
npm run cli run langchain       # js/langchain + py/langchain
npm run cli run js/langgraph    # Only js/langgraph

# Test case filtering
npm run cli run -- --case 1-simple              # Run 1-simple across all SDKs
npm run cli run lang -- --case 1-simple         # Run 1-simple on lang* SDKs

# List available SDKs
npm run cli list
```

## Test Scenarios

Each SDK implementation includes these scenarios (where supported by the SDK):

1. **Simple Chat** - Basic request-response completion
2. **Streaming** - Streaming response handling
3. **Function Calling** - Tool/function calling capabilities
4. **Error Handling** - Application errors and invalid inputs
