# JavaScript Test Utilities

This directory contains JavaScript testing utilities for SDK implementations.

## Directory Structure

```
sdks/js/_test-utils/
├── test-runner.cjs         # Orchestrates test execution (main helper)
├── fixture-loader.cjs      # Loads JSON fixtures with config overrides
├── validator.cjs           # Validates captured data against fixtures
├── validator.test.cjs      # Tests for validator logic
├── mock-transport.cjs      # Captures Sentry data in-memory
└── README.md              # This file
```

**Note:** All files use `.cjs` extension (CommonJS) for compatibility. No package.json - dependencies come from each SDK's package.json.

## 🚨 CRITICAL: JavaScript/Python Parity Rule

**The utilities in `sdks/js/_test-utils/` MUST be kept synchronized with `sdks/py/_test-utils/`.**

### Why This Matters

- Same fixtures (JSON) used by both languages
- Same validation logic = consistent behavior
- Same error messages = easier debugging
- Changes to one MUST be mirrored in the other

### When You Change Test Utils

**ALWAYS update both JS and Python versions together:**

1. **If you modify `validator.cjs`:**
   - Update `sdks/py/_test-utils/validator.py` with equivalent logic
   - **Update `validator.test.cjs` and `validator.test.py` with test cases for the new feature**
   - Run both test files: `node validator.test.cjs && python3 validator.test.py`
   - Run same fixture through both validators
   - Confirm identical error output

2. **If you modify `test-runner.cjs`:**
   - Update `sdks/py/_test-utils/test_runner.py` with equivalent logic
   - Test both implementations
   - Verify error messages match

3. **If you add a new helper function:**
   - Implement in both languages
   - Keep function signatures equivalent
   - Document any language-specific differences

## Core Components

### test-runner.cjs

The main helper that orchestrates test execution. Provides:

- **`runTestCase(testCaseId, testLogic, Sentry)`** - Main test orchestration function
  - Loads SDK config from environment (`SDK_CONFIG`)
  - Loads fixture with `$ref` resolution and config overrides applied
  - Displays test name from `fixture.name` (no hardcoded descriptions)
  - Wraps test logic in Sentry span
  - Validates captured data against fixture
  - Shows SDK path in output: `[js/langchain]`
  - Returns async function compatible with orchestration runner

### fixture-loader.cjs

Loads JSON fixtures from `shared/specs/` with SDK-specific overrides:

- **`loadFixture(testCaseId, frameworkType, configOverrides)`**
  - Reads fixture from `shared/specs/{testCaseId}/fixture-{frameworkType}.json`
  - Resolves `$ref` references to shared span definitions (`common-spans.json`)
  - Applies config overrides (model names, span attributes)
  - Returns fixture with all overrides applied

**Features:**
- `$ref` syntax: `{ "$ref": "common-spans#/llm_call", "parent": "agent" }`
- Cached common spans for performance
- Override properties merge with referenced spans

### validator.cjs

Validates captured Sentry data against fixture expectations:

- **`validateFixture(testCaseId, spans, transactions, events, frameworkType, configOverrides)`**
  - Main validation function that orchestrates all validation steps
  - Checks transactions, spans, attributes, hierarchy, events
  - Returns validation result with detailed error messages

**Internal validation functions (not exported):**
- `validateTransactions()`, `validateSpanCounts()`, `validateEvents()` - Count validations
- `validateSpanItems()` - Matches and validates individual spans
- `validateSpanRelationships()` - Validates parent-child hierarchy
- `validateSpanAttributes()` - Validates attributes with schema support
- `normalizeOpToList()`, `formatOpDescription()` - Helper utilities

**Supported validation features:**
- Wildcard patterns: `"gpt-4*"`, `"*-mini"`, `"*anthropic*"`
- Pattern-based op matching: `{ "pattern": "gen_ai.*", "not": [...] }`
- Schema validation: `{ "type": "json_array", "min_length": 2, "items_have": [...] }`, `{ "type": "plain_string" }`
- Presence checks: `true` (attribute must exist)
- Order-based span matching: Multiple spans with same op matched in fixture order
- `null`/`undefined` treated as missing (not mismatch)

**Exports:** Only `validateFixture` and `attributeMatches` (for tests)

**Test file:** `validator.test.cjs` - Run with `node validator.test.cjs` to verify validator logic

### mock-transport.cjs

In-memory Sentry transport for testing:

- **`createMockTransport(options)`** - Factory for mock transport
- **`getMockTransport()`** - Get current transport instance
- **`clearMockTransport()`** - Clear captured data

## Usage

### In SDK Setup Files (setup.js)

```javascript
const Sentry = require("@sentry/node");
const { config } = require("dotenv");
const { resolve } = require("path");
const { createMockTransport } = require("../_test-utils/mock-transport.cjs");

// Load environment variables
config({ path: resolve(__dirname, "../../../.env") });

// Initialize Sentry with mock transport
Sentry.init({
  dsn: process.env.SENTRY_DSN || "https://public@127.0.0.1/1",
  tracesSampleRate: 1.0,
  transport: createMockTransport,
  sendDefaultPii: true,
  integrations: [
    // Your SDK's Sentry integration here
    // Example: Sentry.openaiIntegration({ recordInputs: true, recordOutputs: true })
  ],
});

module.exports = { Sentry };
```

### In SDK Config Files (config.json)

```json
{
  "sdk_name": "your-sdk",
  "framework_type": "low-level",
  "overrides": {
    "1-simple": {
      "model": "your-model-name",
      "gen_ai.request.model": "your-model-name",
      "gen_ai.response.model": "your-model-name"
    }
  }
}
```

### In Test Case Files (cases/1-simple.js)

```javascript
const { Sentry } = require("../setup");
const YourSDK = require("your-sdk-package");
const { runTestCase } = require("../../_test-utils/test-runner.cjs");

async function testLogic(inputs) {
  const { model, system, prompt } = inputs;

  // Your SDK-specific test logic here
  const client = new YourSDK({ apiKey: process.env.YOUR_API_KEY });
  const response = await client.generate({ model, system, prompt });

  if (!response) {
    throw new Error("No completion returned");
  }
}

// Framework type is loaded from config.json automatically
module.exports = runTestCase("1-simple", testLogic, Sentry);
```

## Parity Status

| Component | JavaScript | Python | Status | Notes |
|-----------|------------|--------|--------|-------|
| Test Runner | `test-runner.cjs` | `test_runner.py` | ✅ Synced | Both orchestrate tests correctly |
| Mock Transport | `mock-transport.cjs` | `mock_transport.py` | ✅ Synced | Both capture envelopes correctly |
| Fixture Loader | `fixture-loader.cjs` | `fixture_loader.py` | ✅ Synced | Both support config overrides |
| Fixture Validator | `validator.cjs` | `validator.py` | ✅ Synced | Schema validation, pattern ops, wildcards |
| Validator Tests | `validator.test.cjs` | `validator.test.py` | ✅ Synced | Both test schema validation |

## See Also

- [Python Test Utilities](../../py/_test-utils/README.md) - Python equivalent of these utilities
- [Adding SDKs Guide](../README.md) - Step-by-step SDK implementation guide
- [Test Specifications](../../../shared/specs/README.md) - Fixture format & framework types
- [Main Documentation](../../../CLAUDE.md) - Project overview & critical rules
