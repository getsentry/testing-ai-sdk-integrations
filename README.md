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
├── spec/                          # Formal specifications
│   ├── test-scenarios.md          # Test scenarios each SDK must implement
│   ├── expected-sentry-data.md    # What Sentry should capture
│   ├── implementation-guide.md    # How to implement for each SDK
│   └── success-criteria.md        # How to verify success
├── sdks/
│   ├── js/                        # JavaScript implementations
│   │   ├── openai/
│   │   ├── anthropic/
│   │   ├── langchain/
│   │   └── llamaindex/
│   └── py/                        # Python implementations
│       ├── openai/
│       ├── anthropic/
│       ├── langchain/
│       └── llamaindex/
├── sdks/
│   ├── js/
│   │   ├── _test-utils/           # JS test utilities (mock transport, fixtures, SDK helpers)
│   │   ├── openai/
│   │   └── vercel/
│   └── py/
│       ├── _test-utils/           # Python test utilities (mock transport, fixtures, SDK helpers)
│       ├── google-genai/
│       └── openai-agents/
├── shared/
│   ├── specs/                     # Test specifications and fixtures
│   └── orchestration/             # Test runner
│       └── src/                   # CLI for running tests
└── .env.example                   # Template for required credentials
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

3. Run tests for a specific SDK:
```bash
# JavaScript OpenAI
cd sdks/js/openai
npm install
npm test

# Python LangChain
cd sdks/py/langchain
pip install -r requirements.txt
pytest
```

4. Run all tests:
```bash
./shared/orchestration/run-tests.sh
```

## Test Scenarios

Each SDK implementation includes these scenarios (where supported by the SDK):

1. **Simple Chat** - Basic request-response completion
2. **Streaming** - Streaming response handling
3. **Function Calling** - Tool/function calling capabilities
4. **Error Handling** - Application errors and invalid inputs

## Testing Approach

### Fast Tests (Unit)
- Mock Sentry transport
- Verify events in-memory
- Fast feedback loop
- Run in CI/CD

### E2E Tests
- Send to real Sentry project
- Query Sentry API to verify data
- Catch real-world issues
- Run periodically or on releases

### Manual Verification
- Runnable scripts for manual testing
- Check Sentry UI directly
- Useful for debugging and validation

## Contributing

See the [implementation guide](spec/implementation-guide.md) for details on adding new SDK integrations.

## SDK Support Status

| SDK | JavaScript | Python |
|-----|------------|--------|
| OpenAI | 🚧 In Progress | ⏳ Planned |
| Anthropic | ⏳ Planned | ⏳ Planned |
| LangChain | ⏳ Planned | 🚧 In Progress |
| LlamaIndex | ⏳ Planned | ⏳ Planned |

## License

[Add license information]
