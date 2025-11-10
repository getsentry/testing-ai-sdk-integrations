# Test Utilities & Framework

This directory contains shared testing utilities that must remain synchronized between JavaScript and Python.

## Directory Structure

```
shared/test-utils/
├── js/
│   ├── assertions.js           # Span query helpers
│   ├── mock-transport.js       # Captures Sentry data in-memory
│   └── fixtures/
│       ├── fixture-loader.js   # Loads JSON fixtures
│       └── validator.js        # Validates captured data
└── py/
    ├── assertions.py           # MUST match js/assertions.js
    ├── mock_transport.py       # MUST match js/mock-transport.js
    └── fixtures/
        ├── fixture_loader.py   # MUST match js/fixture-loader.js
        └── validator.py        # MUST match js/validator.js
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

## Test Case Structure

### JavaScript Test Cases

JavaScript test cases export a single async function that runs the entire test:

```javascript
// sdks/js/vercel/cases/1-simple.js
const FRAMEWORK_TYPE = "agentic";

module.exports = async function () {
  console.log("    Running 1-simple: Basic Completion");

  // Create test span
  await Sentry.startSpan({ name: "1-simple-basic-completion", op: "test" }, async () => {
    await runTest();
  });

  // Flush and validate
  await Sentry.flush(2000);
  await new Promise((resolve) => setTimeout(resolve, 50));
  await assertSentryCaptured();

  console.log("    ✓ 1-simple completed");
};

async function runTest() {
  // Load fixture and run AI SDK code
  const fixture = loadFixture("1-simple", FRAMEWORK_TYPE);
  // ... test implementation
}

async function assertSentryCaptured() {
  // Validate captured Sentry data
  const transport = getMockSentryTransport();
  const result = validateFixture("1-simple", spans, transactions, events, FRAMEWORK_TYPE);
  // ... validation logic
}
```

### Python Test Cases

Python test cases have a **three-function structure** because the orchestrator calls them separately:

```python
# sdks/py/openai-agents/cases/1-simple.py

# At module level
FRAMEWORK_TYPE = "agentic"

async def main():
    """
    Entry point - runs ONLY the test logic
    Called by orchestrator first
    """
    print("    Running 1-simple: Basic Completion")
    await run_test()
    print("    ✓ Test logic completed")

async def assert_sentry():
    """
    Validation - checks ONLY Sentry captured data
    Called by orchestrator AFTER main() completes and Sentry flushes
    """
    await asyncio.sleep(0.1)  # Buffer for transport
    await assert_sentry_captured()
    print("    ✓ 1-simple validation passed")

async def run_test():
    """The actual test implementation"""
    from fixtures import load_fixture

    fixture = load_fixture("1-simple", FRAMEWORK_TYPE)
    # ... test implementation

async def assert_sentry_captured():
    """Verify Sentry captured the expected data"""
    from fixtures import validate_fixture
    from setup import get_mock_sentry_transport

    transport = get_mock_sentry_transport()
    result = validate_fixture("1-simple", spans, transactions, events, FRAMEWORK_TYPE)
    # ... validation logic
```

**Why Python uses three functions:**

1. `main()` - Test execution phase (orchestrator calls this first)
2. `assert_sentry()` - Validation phase (orchestrator calls this after Sentry flush)
3. Helper functions - Internal organization

This split allows the orchestrator to:
- Run the test
- Flush Sentry
- Then validate captured data

**Critical:** Python test cases must NOT call `assert_sentry()` from within `main()`. The orchestrator handles the timing.

## Mock Transport

The mock transport captures all Sentry events in-memory instead of sending them to Sentry servers.

**Features:**
- Captures envelopes (spans, transactions, events)
- Provides query methods to extract captured data
- Can be cleared between tests
- Works identically in JS and Python

**Usage in setup files:**

```javascript
// JavaScript
const { createMockTransport, getMockTransport, clearMockTransport } = require("../../../shared/test-utils/js/mock-transport.js");

Sentry.init({
  transport: createMockTransport,
  // ...
});
```

```python
# Python
from mock_transport import create_mock_transport, get_mock_transport, clear_mock_transport

mock_transport_instance = create_mock_transport(options={"dsn": "..."})

sentry_sdk.init(
    transport=mock_transport_instance,
    # ...
)
```

## Fixture Validation

The validation system compares captured Sentry data against JSON fixtures.

**Validation Flow:**

1. Test runs AI SDK code within Sentry instrumentation
2. Mock transport captures spans/transactions/events
3. Validator compares captured data against fixture
4. Clear error messages show exactly what's missing

**Error Message Format:**

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

## Fixture Loader

The fixture loader reads JSON fixtures from `shared/specs/{spec-id}/`.

**JavaScript:**
```javascript
const { loadFixture } = require("../../../../shared/test-utils/js/fixtures");

const fixture = loadFixture("1-simple", "agentic");
// Returns parsed JSON object
```

**Python:**
```python
from fixtures import load_fixture

fixture = load_fixture("1-simple", "agentic")
# Returns dict
```

**Parameters:**
- `spec_id` (string): Test specification ID (e.g., "1-simple")
- `variant` (string, optional): Fixture variant ("agentic" or "low-level"), defaults to "agentic"

## Validator

The validator checks that captured Sentry data matches fixture expectations.

**JavaScript:**
```javascript
const { validateFixture } = require("../../../../shared/test-utils/js/fixtures");

const result = validateFixture("1-simple", spans, transactions, events, "agentic");

if (!result.passed) {
  console.log("Validation failed:");
  result.errors.forEach((error) => console.log(`  - ${error}`));
  throw new Error("Fixture validation failed");
}
```

**Python:**
```python
from fixtures import validate_fixture

result = validate_fixture("1-simple", spans, transactions, events, "agentic")

if not result["passed"]:
    print("Validation failed:")
    for error in result["errors"]:
        print(f"  - {error}")
    raise Exception("Fixture validation failed")
```

**Parameters:**
- `spec_id` (string): Test specification ID
- `spans` (array): Captured spans from mock transport
- `transactions` (array): Captured transactions from mock transport
- `events` (array): Captured events from mock transport
- `variant` (string, optional): Fixture variant, defaults to "agentic"

**Returns:**
- Object/dict with `passed` (boolean) and `errors` (array of strings)

## See Also

- [Test Specifications](../specs/README.md) - Fixture format details
- [Adding SDKs](../../sdks/README.md) - How to use test utilities in SDKs
- [Troubleshooting](../../docs/TROUBLESHOOTING.md) - Common issues
- [Main Documentation](../../CLAUDE.md) - Project overview
