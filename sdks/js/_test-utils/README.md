# JavaScript Test Utilities

This directory contains JavaScript testing utilities for SDK implementations.

## Directory Structure

```
sdks/js/_test-utils/
├── sdk-helpers.cjs         # Consolidated SDK test helpers (setup, orchestration)
├── assertions.cjs          # Span query helpers
├── mock-transport.cjs      # Captures Sentry data in-memory
└── fixtures/
    ├── index.cjs           # Fixture exports
    ├── fixture-loader.cjs  # Loads JSON fixtures from shared/specs/
    └── validator.cjs       # Validates captured data against fixtures
```

## 🚨 CRITICAL: JavaScript/Python Parity Rule

**The utilities in `sdks/js/_test-utils/` MUST be kept synchronized with `sdks/py/_test-utils/`.**

### Why This Matters

- Same fixtures (JSON) used by both languages
- Same validation logic = consistent behavior
- Same error messages = easier debugging
- Changes to one MUST be mirrored in the other

### When You Change Test Utils

**ALWAYS update both JS and Python versions together:**

1. **If you modify `assertions.cjs`:**
   - Update `sdks/py/_test-utils/assertions.py` with equivalent logic
   - Test both implementations
   - Verify error messages match

2. **If you modify `fixtures/validator.cjs`:**
   - Update `sdks/py/_test-utils/fixtures/validator.py` with equivalent logic
   - Run same fixture through both validators
   - Confirm identical error output

3. **If you add a new helper function:**
   - Implement in both languages
   - Keep function signatures equivalent
   - Document any language-specific differences

## SDK Helpers

The `sdk-helpers.cjs` module provides utilities to eliminate boilerplate:

- **`createSDKSetup()`** - Factory for lifecycle hooks (beforeAll, afterEach, etc.)
- **`runTestCase()`** - Orchestrates test execution with validation
- **`loadConfigOverride()`** - Reads config overrides from environment
- **`assertSentryFixture()`** - Validates captured Sentry data

See the file for detailed documentation and examples.

## Usage

### In SDK Setup Files

```javascript
const Sentry = require("@sentry/node");
const { config } = require("dotenv");
const { resolve } = require("path");
const { createSDKSetup } = require("../_test-utils/sdk-helpers.cjs");

module.exports = createSDKSetup({
  sdkName: "Your SDK",
  initSentry: (createMockTransport) => {
    config({ path: resolve(__dirname, "../../../.env") });
    Sentry.init({
      dsn: process.env.SENTRY_DSN || "https://public@127.0.0.1/1",
      tracesSampleRate: 1.0,
      transport: createMockTransport,
      sendDefaultPii: true,
      integrations: [/* your integrations */],
    });
  },
  closeSentry: () => Sentry.close(),
});
```

### In Test Case Files

```javascript
const Sentry = require("@sentry/node");
const { getMockSentryTransport } = require("../setup");
const { runTestCase } = require("../../_test-utils/sdk-helpers.cjs");

const FRAMEWORK_TYPE = "low-level"; // or "agentic"

async function testLogic(inputs) {
  const { model, system, prompt } = inputs;
  // Your SDK-specific test logic here
}

module.exports = runTestCase(
  "1-simple",
  FRAMEWORK_TYPE,
  testLogic,
  getMockSentryTransport,
  (spanOptions, callback) => Sentry.startSpan(spanOptions, callback),
  (timeout) => Sentry.flush(timeout)
);
```

## Parity Status

| Component | JavaScript | Python | Status |
|-----------|------------|--------|--------|
| SDK Helpers | `sdk-helpers.cjs` | `sdk_helpers.py` | ✅ Synced |
| Mock Transport | `mock-transport.cjs` | `mock_transport.py` | ✅ Synced |
| Fixture Loader | `fixtures/fixture-loader.cjs` | `fixtures/fixture_loader.py` | ✅ Synced |
| Fixture Validator | `fixtures/validator.cjs` | `fixtures/validator.py` | ✅ Synced |
| Assertions | `assertions.cjs` | `assertions.py` | ⚠️ Partial |

**Action Required:** Implement missing assertion helpers in Python to achieve full parity.
