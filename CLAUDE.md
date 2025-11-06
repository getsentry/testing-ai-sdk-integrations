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
│   │   ├── openai/           # Each SDK has its own directory
│   │   │   ├── setup.js      # SDK-specific setup with lifecycle hooks
│   │   │   └── cases/        # Test cases (G1.js, G2.js, etc.)
│   │   └── vercel/
│   └── py/                    # Python SDK implementations
│       └── openai-agents/
│           ├── setup.py      # SDK-specific setup with lifecycle hooks
│           └── cases/        # Test cases (G1.py, G2.py, etc.)
├── shared/
│   ├── fixtures/             # Language-agnostic test expectations (JSON)
│   │   └── G1.json          # Defines what spans/events we expect
│   ├── test-utils/           # CRITICAL: Must stay in sync between JS/Python
│   │   ├── js/
│   │   │   ├── assertions.js      # Span query helpers
│   │   │   ├── mock-transport.js  # Captures Sentry data in-memory
│   │   │   └── fixtures/
│   │   │       ├── fixture-loader.js  # Loads JSON fixtures
│   │   │       └── validator.js       # Validates captured data against fixtures
│   │   └── py/
│   │       ├── assertions.py      # MUST match js/assertions.js
│   │       ├── mock_transport.py  # MUST match js/mock-transport.js
│   │       └── fixtures/
│   │           ├── fixture_loader.py  # MUST match js/fixture-loader.js
│   │           └── validator.py       # MUST match js/validator.js
│   └── orchestration/        # Test runner (TypeScript)
│       ├── python-test-runner.py  # Wrapper for Python tests
│       └── src/
│           ├── cli.ts         # Main CLI entry point
│           ├── runner.ts      # Runs tests for both JS and Python
│           └── discovery.ts   # Discovers SDKs and test cases
└── spec/                      # Documentation (not implemented yet)
```

## 🚨 CRITICAL: JavaScript/Python Parity Rule

**The files in `shared/test-utils/` MUST be kept perfectly synchronized between JavaScript and Python.**

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

| JavaScript                      | Python                          | Purpose                                 |
| ------------------------------- | ------------------------------- | --------------------------------------- |
| `js/assertions.js`              | `py/assertions.py`              | Span query and assertion helpers        |
| `js/mock-transport.js`          | `py/mock_transport.py`          | Capture Sentry events in-memory         |
| `js/fixtures/fixture-loader.js` | `py/fixtures/fixture_loader.py` | Load JSON fixtures                      |
| `js/fixtures/validator.js`      | `py/fixtures/validator.py`      | Validate captured data against fixtures |

### Test Parity Checklist

- [ ] Same function exists in both JS and Python
- [ ] Same parameters (accounting for language differences)
- [ ] Same error messages (word-for-word when possible)
- [ ] Same return values/behavior
- [ ] Both tested and working

## Test Scenarios

### Current Test Cases

Test cases are identified by spec ID (e.g., "G1", "G2"). Each has:

- **JSON fixture** in `shared/fixtures/` defining expectations
- **JS implementation(s)** in `sdks/js/*/cases/`
- **Python implementation(s)** in `sdks/py/*/cases/`

**Implemented:**

- **G1**: Basic Completion - Single prompt with system message

**Planned:**

- **G2**: Streaming responses
- **G3**: Function/tool calling
- **G4**: Error scenarios (application errors, invalid inputs)

### Sentry Features to Verify

Each test must verify that Sentry captures:

1. **Performance tracing** - Spans and transactions with proper timing
2. **AI monitoring data** - Model name, token counts, prompts, completions
3. **Error tracking** - Exceptions with context and stack traces (for error tests)

## How Tests Work

### 1. Fixture Format (JSON)

Fixtures define expected spans, transactions, and events in a language-agnostic way:

```json
{
  "spec_id": "G1",
  "name": "Basic Completion",
  "expectations": {
    "spans": {
      "min_count": 3,
      "items": [
        {
          "id": "invoke_agent",
          "op": "gen_ai.invoke_agent",
          "required_attributes": {
            "gen_ai.response.model": "gpt-4o-mini",
            "gen_ai.response.text": true,
            "gen_ai.usage.input_tokens": true
          }
        },
        {
          "id": "generate_text",
          "op": ["gen_ai.chat", "gen_ai.generate_text"],
          "parent": "invoke_agent",
          "required_attributes": {
            "gen_ai.request.model": "gpt-4o-mini"
          }
        }
      ]
    },
    "events": {
      "error_count": 0
    }
  }
}
```

**Key features:**

- `op` can be string or array (matches any of the ops)
- `required_attributes` with `true` = just check presence
- `required_attributes` with value = check exact match
- `parent` = verifies span hierarchy
- `min_count` = minimum spans (allows extra spans from SDK)

### 2. Validation Flow

1. Test runs AI SDK code within Sentry instrumentation
2. Mock transport captures spans/transactions/events
3. Validator compares captured data against fixture
4. Clear error messages show exactly what's missing

### 3. Error Message Format

When validation fails, show:

- **No span found:** List available span ops
- **Span found but missing attributes:** Show required vs actual attributes
- **Multiple spans found:** List matching spans with IDs

**Example error message:**

```
Found span with op="gen_ai.chat or gen_ai.generate_text" but missing required attributes
  Required attributes:
    - gen_ai.operation.type: "ai_client"
    - gen_ai.request.model: "gpt-4o-mini"
    - gen_ai.response.text: (any value)
  Span's actual attributes:
    - gen_ai.request.model: "gpt-4o-mini"
    - gen_ai.system: "openai"
```

## Supported AI SDKs

### Currently Implemented

| Language | SDK               | Status     | Notes                      |
| -------- | ----------------- | ---------- | -------------------------- |
| JS       | `openai`          | ⚠️ Partial | G1 test exists but failing |
| JS       | `vercel` (AI SDK) | ⚠️ Partial | G1 test exists but failing |
| Python   | `openai-agents`   | ⚠️ Partial | G1 test exists but failing |

### Planned SDKs

- JavaScript: OpenAI SDK, Anthropic, LangChain, LlamaIndex
- Python: LangChain, Anthropic, OpenAI, LlamaIndex

**Note:** Not all SDKs support all features (streaming, function calling, etc.)

## Adding a New SDK

### 1. Create SDK Directory Structure

```bash
sdks/{js|py}/{sdk-name}/
  ├── setup.{js|py}      # Lifecycle hooks
  ├── cases/             # Test case implementations
  │   ├── G1.{js|py}
  │   └── G2.{js|py}
  └── .env               # API keys (gitignored)
```

### 2. Implement setup.{js|py}

Must export these lifecycle hooks:

- `beforeAll()` - Initialize Sentry with mock transport
- `beforeEach()` - Reset test state
- `afterEach()` - Clean up after test
- `afterAll()` - Tear down Sentry

### 3. Implement Test Cases

Each test case (e.g., G1.js, G1.py):

1. Imports fixture validator
2. Runs AI SDK code within Sentry transaction
3. Captures spans/transactions/events from mock transport
4. Validates against fixture using `validateFixture(specId, spans, transactions, events)`
5. Throws error if validation fails

### 4. Test Your Implementation

```bash
# Run specific SDK and case
npm run cli run -- --sdk js/your-sdk --case G1

# Run all cases for an SDK
npm run cli run -- --sdk js/your-sdk

# Run specific case across all SDKs
npm run cli run -- --case G1
```

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

### File Naming Conventions

- **Test cases:** `G1.{js|py}`, `G2.{js|py}`, etc. (matches spec ID)
- **Fixtures:** `G1.json`, `G2.json`, etc. in `shared/fixtures/`
- **Setup:** `setup.{js|py}` in each SDK directory

### Environment Variables

**Centralized Configuration:** All API keys are stored in a single root `.env` file.

```bash
# .env (at repository root)
OPENAI_API_KEY=sk-...
# ANTHROPIC_API_KEY=sk-ant-...
# SENTRY_DSN=https://...
```

**How it works:**
- Orchestrator loads root `.env` on startup
- JS tests inherit via `process.env`
- Python tests inherit via subprocess environment
- **No per-SDK .env files needed** ✅

**Note:** `.env` is gitignored - never commit API keys

### Test Inputs (Prompts, Models)

**Centralized in Fixtures:** Test inputs are defined in fixture JSON files.

```json
// shared/fixtures/G1.json
{
  "spec_id": "G1",
  "inputs": {
    "model": "gpt-4o-mini",
    "system": "You are a helpful math assistant.",
    "prompt": "What is 69 + 96?"
  },
  "expectations": { ... }
}
```

**Test cases load inputs from fixtures:**

**JavaScript:**
```javascript
const { loadFixture } = require("../../../../shared/test-utils/js/fixtures");

const fixture = loadFixture("G1");
const { model, system, prompt } = fixture.inputs;
```

**Python:**
```python
from fixtures import load_fixture

fixture = load_fixture("G1")
model = fixture["inputs"]["model"]
system = fixture["inputs"]["system"]
prompt = fixture["inputs"]["prompt"]
```

**Benefits:**
- Change model/prompt once → all SDKs update
- Clear contract: G1 always uses same inputs
- Easy to add G2, G3 with different inputs

### Mock Transport Usage

**JavaScript:**

```javascript
const { getMockSentryTransport } = require("../setup");

// After test runs
const transport = getMockSentryTransport();
const spans = transport.getSpans();
const transactions = transport.getTransactions();
const events = transport.getEvents();
```

**Python:**

```python
from setup import get_mock_sentry_transport

# After test runs
transport = get_mock_sentry_transport()
spans = transport.get_spans()
transactions = transport.get_transactions()
events = transport.get_events()
```

### Fixture Validation

**JavaScript:**

```javascript
const {
  validateFixture,
} = require("../../../../shared/test-utils/js/fixtures");

const result = validateFixture("G1", spans, transactions, events);
if (!result.passed) {
  console.log("Validation failed:");
  result.errors.forEach((error) => console.log(`  - ${error}`));
  throw new Error(`Fixture validation failed`);
}
```

**Python:**

```python
from shared.test_utils.py.fixtures.validator import validate_fixture

result = validate_fixture("G1", spans, transactions, events)
if not result["passed"]:
    print("Validation failed:")
    for error in result["errors"]:
        print(f"  - {error}")
    raise Exception(f"Fixture validation failed")
```

### Test Success Criteria

A test passes when:

1. ✅ Test code runs without exceptions
2. ✅ Sentry captures all expected spans (minimum count met)
3. ✅ Required attributes present on each span
4. ✅ Span hierarchy correct (parent-child relationships)
5. ✅ Expected number of errors/events captured

## Debugging Tips

### View Captured Spans

Both JS and Python tests print debug output showing captured spans:

```
Captured: 12 spans, 1 transactions, 0 events
DEBUG: Spans:
  1. op="gen_ai.invoke_agent"
     data: { "gen_ai.system": "openai", ... }
  2. op="gen_ai.chat"
     data: { "gen_ai.request.model": "gpt-4o-mini", ... }
```

### Common Issues

**1. "No span found with op=..."**

- SDK didn't create expected span
- Check if Sentry integration is enabled
- Verify SDK version is supported

**2. "Found span but missing required attributes"**

- Sentry captured span but without expected data
- Check SDK instrumentation code
- May need to adjust fixture expectations

**3. "Found 2 spans matching op=..., expected exactly 1"**

- Multiple spans with same operation name
- Add `required_attributes` to distinguish them
- Or fixture may be incorrect

**4. "Python test exited with code 1"**

- Old error - should now show actual error message
- If you see this, rebuild orchestration: `cd shared/orchestration && npm run build`

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

   - Create JSON fixture in `shared/fixtures/`
   - Implement in at least one JS SDK
   - Implement in at least one Python SDK
   - Run: `npm run cli run -- --case G<N>`

3. **Adding a new SDK?**

   - Create directory structure
   - Implement setup with lifecycle hooks
   - Implement test cases (start with G1)
   - Run: `npm run cli run -- --sdk {js|py}/your-sdk`

4. **Debugging test failures?**
   - Look at "Span's actual attributes" in error message
   - Compare with "Required attributes"
   - Adjust fixture or fix SDK instrumentation
