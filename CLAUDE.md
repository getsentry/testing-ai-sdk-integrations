# Claude Context: Sentry AI SDK Integration Testing

## Project Purpose

This repository contains a comprehensive testing framework for Sentry's AI SDK integrations. Sentry SDKs (JavaScript and Python) have auto-enabled integrations for popular AI SDKs. This project ensures those integrations work correctly across all supported AI SDKs and captures breakages when new AI SDK versions are released.

## Goals

1. **Catch integration breakages early** - Detect when new AI SDK versions break Sentry instrumentation
2. **Comprehensive coverage** - Test all popular AI SDKs that Sentry supports
3. **Language parity** - Identical test behavior across JavaScript and Python
4. **Clear error messages** - When tests fail, show exactly what's wrong
5. **Formal specification** - Language-agnostic JSON fixtures define expected behavior

## Architecture Overview

### Project Structure

```
ai-sdks-test/
├── sdks/
│   ├── js/                    # JavaScript SDK implementations
│   │   ├── _test-utils/      # JS test utilities (CRITICAL: Keep in sync with py/)
│   │   │   ├── sdk-helpers.cjs     # Setup factory, test orchestration
│   │   │   ├── assertions.cjs      # Span query helpers
│   │   │   ├── mock-transport.cjs  # Captures Sentry data in-memory
│   │   │   └── fixtures/
│   │   │       ├── fixture-loader.cjs  # Loads JSON fixtures
│   │   │       └── validator.cjs       # Validates captured data
│   │   ├── openai/           # Each SDK has its own directory
│   │   │   ├── setup.js      # SDK-specific setup with lifecycle hooks
│   │   │   └── cases/        # Test cases (1-simple.js, 2-simple-with-error.js, etc.)
│   │   └── vercel/
│   └── py/                    # Python SDK implementations
│       ├── _test-utils/      # Python test utilities (CRITICAL: Keep in sync with js/)
│       │   ├── sdk_helpers.py      # Setup factory, test orchestration
│       │   ├── assertions.py       # MUST match js/assertions.cjs
│       │   ├── mock_transport.py   # MUST match js/mock-transport.cjs
│       │   └── fixtures/
│       │       ├── fixture_loader.py  # MUST match js/fixture-loader.cjs
│       │       └── validator.py       # MUST match js/validator.cjs
│       ├── openai-agents/
│       │   ├── setup.py      # SDK-specific setup with lifecycle hooks
│       │   └── cases/        # Test cases (1-simple.py, 2-simple-with-error.py, etc.)
│       └── google-genai/
├── shared/
│   ├── specs/                # Test specifications and expectations
│   │   └── 1-simple/        # Each spec in its own folder
│   │       ├── spec.md              # Test specification document
│   │       ├── fixture-agentic.json # Expected spans for agentic frameworks
│   │       └── fixture-low-level.json # Expected spans for low-level frameworks
│   └── orchestration/        # Test runner (TypeScript)
│       ├── python-test-runner.py  # Wrapper for Python tests
│       └── src/
│           ├── cli.ts         # Main CLI entry point
│           ├── runner.ts      # Runs tests for both JS and Python
│           └── discovery.ts   # Discovers SDKs and test cases
```

## 📚 Documentation Navigation

This is the main context file. For detailed guides, see:

| Documentation | Purpose | Link |
|---------------|---------|------|
| **🔧 Adding SDKs** | Step-by-step guide for implementing new SDK tests with copy-paste templates | [sdks/README.md](sdks/README.md) |
| **📋 Test Specifications** | Fixture format, framework types, and spec system | [shared/specs/README.md](shared/specs/README.md) |
| **🧪 Test Utilities (JS)** | Mock transport, fixture validation, SDK helpers | [sdks/js/_test-utils/README.md](sdks/js/_test-utils/README.md) |
| **🧪 Test Utilities (Python)** | Mock transport, fixture validation, SDK helpers | [sdks/py/_test-utils/README.md](sdks/py/_test-utils/README.md) |
| **⚙️ CLI & Orchestration** | Running tests, test discovery, and debugging execution | [shared/orchestration/README.md](shared/orchestration/README.md) |
| **🐛 Troubleshooting** | Common pitfalls, error messages, and debugging tips | [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) |

**Quick links:**
- 🚀 Run all tests: `cd shared/orchestration && npm run cli run -- --all`
- 📝 List available SDKs: `npm run cli list`
- 🔍 Run specific SDK: `npm run cli run -- --sdk js/vercel`

## Coding Standards & File Types

### File Type Rules

**JavaScript SDKs: Always use .js, NEVER .ts**

- SDK implementations (`sdks/js/*/`) **must** use plain JavaScript files with `.js` extension
- Use CommonJS module system (`require()` and `module.exports`)
- **Reason:** Simplicity, compatibility, and to avoid TypeScript compilation complexity for SDK tests
- **Note:** The orchestrator uses TypeScript, but SDK implementations do not

**Python SDKs: Always use .py**

- SDK implementations (`sdks/py/*/`) use standard Python files with `.py` extension
- No type hints required (keep it simple)
- Use snake_case for all functions and variables (Python convention)

### Module System Rules

**Which module system to use where:**

| Location                      | Module System | Syntax                                    | File Extension |
| ----------------------------- | ------------- | ----------------------------------------- | -------------- |
| SDK test files (`sdks/*/`)    | **CommonJS**  | `const X = require('...')`, `module.exports` | `.js`          |
| Orchestration (`shared/orchestration/`) | **ES Modules** | `import X from '...'`, `export`          | `.ts`          |
| Test utilities (`sdks/js/_test-utils/`) | **CommonJS**  | `const X = require('...')`, `module.exports` | `.cjs`          |
| Python files                  | **Standard**  | `import X`, `from X import Y`             | `.py`          |

**Why these conventions?**

- **CommonJS in SDKs:** Maximum compatibility and simplicity for contributors. No build step required, works directly with Node.js
- **TypeScript only in orchestration:** Type safety where complexity lives (test discovery, running, reporting). SDK tests are simple enough to not need TypeScript
- **Consistent patterns:** Makes copy-pasting templates easier and reduces cognitive load

### File Naming Quick Reference

| File Type          | Pattern                  | Example                | Location                        |
| ------------------ | ------------------------ | ---------------------- | ------------------------------- |
| Test spec          | `{number}-{description}` | `1-simple`             | `shared/specs/1-simple/`        |
| JS test case       | `{spec-id}.js`           | `1-simple.js`          | `sdks/js/vercel/cases/`         |
| Python test case   | `{spec-id}.py`           | `1-simple.py`          | `sdks/py/openai-agents/cases/`  |
| JS SDK setup       | `setup.js`               | `setup.js`             | `sdks/js/vercel/`               |
| Python SDK setup   | `setup.py`               | `setup.py`             | `sdks/py/openai-agents/`        |
| Agentic fixture    | `fixture-agentic.json`   | `fixture-agentic.json` | `shared/specs/1-simple/`        |
| Low-level fixture  | `fixture-low-level.json` | `fixture-low-level.json` | `shared/specs/1-simple/`      |

### Import Paths & Module Resolution

**JavaScript: Relative Paths**

JavaScript test files use relative paths to import test utilities. **Count directory levels carefully:**

```javascript
// From: sdks/js/vercel/cases/1-simple.js
// To:   sdks/js/_test-utils/

const { runTestCase } = require("../../_test-utils/sdk-helpers.cjs");
//                                  ^^
//                                  2 levels up: cases/ -> vercel/ -> js/_test-utils/
```

**Path counting formula:**
1. Start at your test file location
2. Count `../` for each directory level up
3. Then add the path to the target

**Common paths from SDK files:**

| From                                  | To                                  | Path                                         |
| ------------------------------------- | ----------------------------------- | -------------------------------------------- |
| `sdks/js/{sdk}/cases/{test}.js`       | `sdks/js/_test-utils/`              | `../../_test-utils/sdk-helpers.cjs`          |
| `sdks/js/{sdk}/setup.js`              | `sdks/js/_test-utils/`              | `../_test-utils/sdk-helpers.cjs`             |
| `sdks/py/{sdk}/cases/{test}.py`       | (uses sys.path, see below)          | N/A - import directly after sys.path setup   |

**Python: sys.path Manipulation**

Python SDKs must manually add the test utilities to `sys.path` because Python doesn't have a project-wide module resolution like Node.js.

**Every Python SDK's `setup.py` MUST include this code:**

```python
import sys
from pathlib import Path

# Add test utils to path
test_utils_path = Path(__file__).parent.parent / "_test-utils"
sys.path.insert(0, str(test_utils_path))

# Now you can import directly
from sdk_helpers import create_sdk_setup
from mock_transport import create_mock_transport, get_mock_transport, clear_mock_transport
```

**Why this is needed:**
- Python's import system doesn't traverse up directories by default
- This adds the test utilities to the beginning of the module search path
- Must be done in `setup.py` before any test imports
- Test case files will inherit this path setup

**When adding a new SDK:**
- Copy the sys.path block from an existing Python SDK's `setup.py`
- Path is always `Path(__file__).parent.parent / "_test-utils"` (2 levels up)
- Test by running `python -c "from fixtures import load_fixture"` in your SDK directory

## 🚨 CRITICAL: JavaScript/Python Parity Rule

**The files in `sdks/js/_test-utils/` and `sdks/py/_test-utils/` MUST be kept perfectly synchronized.**

### Why This Matters

- Same fixtures (JSON) used by both languages
- Same validation logic = consistent behavior
- Same error messages = easier debugging
- Changes to one MUST be mirrored in the other

### When You Change test-utils

**ALWAYS update both JS and Python versions together:**

1. **If you modify `js/assertions.js`:**

   - Update `py/assertions.py` with equivalent logic
   - Test both implementations
   - Verify error messages match

2. **If you modify `js/fixtures/validator.js`:**

   - Update `py/fixtures/validator.py` with equivalent logic
   - Run same fixture through both validators
   - Confirm identical error output

3. **If you add a new helper function:**
   - Implement in both languages
   - Keep function signatures equivalent
   - Document any language-specific differences

### Files That Must Stay in Sync

| JavaScript                                | Python                                  | Purpose                                 |
| ----------------------------------------- | --------------------------------------- | --------------------------------------- |
| `sdks/js/_test-utils/sdk-helpers.cjs`    | `sdks/py/_test-utils/sdk_helpers.py`   | Setup factory, test orchestration       |
| `sdks/js/_test-utils/assertions.cjs`     | `sdks/py/_test-utils/assertions.py`    | Span query and assertion helpers        |
| `sdks/js/_test-utils/mock-transport.cjs` | `sdks/py/_test-utils/mock_transport.py`| Capture Sentry events in-memory         |
| `sdks/js/_test-utils/fixtures/fixture-loader.cjs` | `sdks/py/_test-utils/fixtures/fixture_loader.py` | Load JSON fixtures     |
| `sdks/js/_test-utils/fixtures/validator.cjs` | `sdks/py/_test-utils/fixtures/validator.py` | Validate captured data against fixtures |

### Test Parity Checklist

When adding or modifying test-utils, verify:

- [ ] Same function exists in both JS and Python
- [ ] Same parameters (accounting for language differences: camelCase vs snake_case)
- [ ] Same error messages (word-for-word when possible)
- [ ] Same return values/behavior
- [ ] Both implementations tested and working
- [ ] Same validation logic produces identical results
- [ ] Test with same fixture through both validators to confirm identical output

### Current Parity Status

| Component | JavaScript | Python | Status | Notes |
| --------- | ---------- | ------ | ------ | ----- |
| Mock Transport | `mock-transport.js` | `mock_transport.py` | ✅ Synced | Both capture envelopes correctly |
| Fixture Loader | `fixtures/fixture-loader.js` | `fixtures/fixture_loader.py` | ✅ Synced | Support variant parameter |
| Fixture Validator | `fixtures/validator.js` | `fixtures/validator.py` | ✅ Synced | Support variant parameter |
| Assertions | `assertions.js` | `assertions.py` | ⚠️ **Partial** | Python missing some helpers |

**Action Required:** Implement missing assertion helpers in Python to achieve full parity.

## Test Scenarios

### Current Test Cases

Test cases are identified by spec ID (e.g., "1-simple", "2-simple-with-error"). Each has:

- **JSON fixture(s)** in `shared/specs/{spec-id}/` defining expectations
- **JS implementation(s)** in `sdks/js/*/cases/`
- **Python implementation(s)** in `sdks/py/*/cases/`

**Implemented:**

- **1-simple**: Basic Completion - Single prompt with system message

**Planned:**

- **2-simple-with-error**: Basic completion with application error
- **3-multi-turn**: Multi-turn conversation
- **4-streaming**: Basic streaming
- **5-streaming-with-error**: Streaming with application error
- **6-agent-success**: Agentic workflow - success path
- **7-agent-llm-error**: Agentic workflow - error during LLM call
- **8-agent-tool-error**: Agentic workflow - error during tool execution

### Sentry Features to Verify

Each test must verify that Sentry captures:

1. **Performance tracing** - Spans and transactions with proper timing
2. **AI monitoring data** - Model name, token counts, prompts, completions
3. **Error tracking** - Exceptions with context and stack traces (for error tests)

### Framework Types & Fixture Variants

AI SDKs fall into two categories based on the span hierarchy they produce:

#### Agentic Frameworks

Frameworks that wrap LLM calls in agent abstraction spans:

- **Vercel AI SDK** (`js/vercel`) - Produces `gen_ai.invoke_agent` parent spans
- **OpenAI Agents SDK** (`py/openai-agents`) - Produces agent workflow spans

**Span hierarchy example:**
```
gen_ai.invoke_agent (parent)
  └─ gen_ai.chat or gen_ai.generate_text (child)
```

#### Low-Level Frameworks

Frameworks that directly produce LLM call spans without agent wrappers:

- **OpenAI SDK** (both JS and Python) - Direct `gen_ai.chat` spans only
- **Anthropic SDK** (both JS and Python) - Direct LLM call spans

**Span hierarchy example:**
```
gen_ai.chat (no parent)
```

#### Using Fixture Variants

Each test case folder contains multiple fixture files to handle both framework types:

- `fixture-agentic.json` - Expects agent parent spans + LLM child spans
- `fixture-low-level.json` - Expects only direct LLM call spans

Test cases specify which variant to use via the `FRAMEWORK_TYPE` constant:

**JavaScript:**
```javascript
// At top of test file
const FRAMEWORK_TYPE = "agentic"; // or "low-level"

// Load fixture with variant
const fixture = loadFixture("1-simple", FRAMEWORK_TYPE);

// Validate with same variant
validateFixture("1-simple", spans, transactions, events, FRAMEWORK_TYPE);
```

**Python:**
```python
# At top of test file
FRAMEWORK_TYPE = "agentic"  # or "low-level"

# Load fixture with variant
fixture = load_fixture("1-simple", FRAMEWORK_TYPE)

# Validate with same variant
validate_fixture("1-simple", spans, transactions, events, FRAMEWORK_TYPE)
```

**Important:** Each SDK's test cases should all use the same `FRAMEWORK_TYPE` value. The framework type is determined by the SDK's architecture, not by individual test cases.

#### SDK Framework Type Mapping

**When adding a new SDK, determine its framework type first, then use the same type across all test cases for that SDK.**

| SDK Path              | Framework Type | Reason                                      |
| --------------------- | -------------- | ------------------------------------------- |
| `js/vercel`           | `agentic`      | Produces `gen_ai.invoke_agent` parent spans |
| `py/openai-agents`    | `agentic`      | Produces agent workflow spans               |
| `js/openai` (future)  | `low-level`    | Direct `gen_ai.chat` spans only             |
| `py/openai` (future)  | `low-level`    | Direct LLM call spans only                  |
| `js/anthropic` (future) | `low-level`  | Direct LLM call spans only                  |
| `py/anthropic` (future) | `low-level`  | Direct LLM call spans only                  |

**How to determine framework type for a new SDK:**

1. Run a simple test case with the SDK
2. Examine the captured spans
3. If you see agent/workflow wrapper spans → `agentic`
4. If you only see direct LLM call spans → `low-level`


## How Tests Work

**Overview:** Tests run AI SDK code instrumented with Sentry, capture events in-memory, and validate against JSON fixtures.

**Test flow:**
1. Load fixture defining expected behavior
2. Run AI SDK code within Sentry transaction
3. Mock transport captures spans/events
4. Validator compares captured data vs fixture expectations
5. Clear error messages show exactly what's missing

**Key components:**
- **Fixtures** (`shared/specs/*/fixture-*.json`) - Define expected spans and attributes
- **Mock transport** - Captures Sentry data in-memory instead of sending to server
- **Validator** - Compares actual vs expected, shows clear diffs

For details, see:
- [shared/specs/README.md](shared/specs/README.md) - Fixture format
- [shared/test-utils/README.md](shared/test-utils/README.md) - Mock transport and validation

## Supported AI SDKs

### Currently Implemented

| Language | SDK               | Status     | Notes                              |
| -------- | ----------------- | ---------- | ---------------------------------- |
| JS       | `vercel` (AI SDK) | ✅ Working | 1-simple test passing              |
| Python   | `openai-agents`   | ⚠️ Partial | 1-simple test exists but may fail  |

### Planned SDKs

- JavaScript: OpenAI SDK, Anthropic, LangChain, LlamaIndex
- Python: LangChain, Anthropic, OpenAI, LlamaIndex

**Note:** Not all SDKs support all features (streaming, function calling, etc.)


## Adding a New SDK

For detailed step-by-step guides on implementing new SDK tests, see:
- **[sdks/README.md](sdks/README.md)** - Complete templates and instructions for JavaScript and Python SDKs

**Quick start:**
1. Determine framework type (agentic vs low-level)
2. Copy template from sdks/README.md
3. Implement test cases
4. Run: `npm run cli run -- --sdk {language}/{your-sdk}`


## Current Status

**Status:** Foundation complete, initial SDKs implemented but tests failing

**What's Working:**

- ✅ Test orchestration (CLI, discovery, runner)
- ✅ Mock transports (JS and Python)
- ✅ Fixture validation (JS and Python in sync)
- ✅ Clear error messages showing missing attributes
- ✅ Lifecycle hooks (beforeAll, afterEach, etc.)
- ✅ Centralized configuration (root .env, fixture inputs)


## Implementation Guidelines

### Centralized Configuration

**Environment variables:** All API keys in root `.env` file (gitignored):
```bash
# .env (at repository root)
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
SENTRY_DSN=https://...
```

**Test inputs:** Defined in fixture JSON files (`shared/specs/*/fixture-*.json`):
```json
{
  "spec_id": "1-simple",
  "inputs": {
    "model": "gpt-4o-mini",
    "system": "You are a helpful assistant.",
    "prompt": "What is 2+2?"
  }
}
```

This keeps tests language-agnostic - same fixtures work for JS and Python.

### Success Criteria

A test passes when:
1. ✅ Test code runs without exceptions
2. ✅ Sentry captures all expected spans (minimum count met)
3. ✅ Required attributes present on each span
4. ✅ Span hierarchy correct (parent-child relationships)
5. ✅ Expected number of errors/events captured

## Debugging & Troubleshooting

For common issues, error messages, and debugging tips, see:
- **[docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md)** - Complete troubleshooting guide with solutions to 8 common pitfalls

**Quick diagnostic checklist:**
- Did you create a `.venv` and install requirements (Python)?
- Are relative import paths correct? (count `../` carefully)
- Is `sys.path.insert(0, ...)` present in Python setup.py?
- Are you using `.js` files (not `.ts`) for SDK tests?
- Is `FRAMEWORK_TYPE` set correctly for your SDK?

## References

- **Sentry JavaScript SDK:** https://github.com/getsentry/sentry-javascript
- **Sentry Python SDK:** https://github.com/getsentry/sentry-python
- **Vercel AI SDK:** https://sdk.vercel.ai/docs
- **OpenAI Python Agents:** https://github.com/openai/swarm (inspiration)

## Development Workflow Summary

1. **Adding a feature to test-utils?**

   - Implement in JS
   - Implement equivalent in Python
   - Test both
   - Verify error messages match

2. **Adding a new test case?**

   - Create folder in `shared/specs/{number}-{description}/`
   - Add `spec.md` (specification) and `fixture.json` (inputs + expectations)
   - Implement in at least one JS SDK
   - Implement in at least one Python SDK
   - Run: `npm run cli run -- --case {number}-{description}`

3. **Adding a new SDK?**

   - Create directory structure
   - Implement setup with lifecycle hooks
   - Implement test cases (start with G1)
   - Run: `npm run cli run -- --sdk {js|py}/your-sdk`

4. **Debugging test failures?**
   - Look at "Span's actual attributes" in error message
   - Compare with "Required attributes"
   - Adjust fixture or fix SDK instrumentation
