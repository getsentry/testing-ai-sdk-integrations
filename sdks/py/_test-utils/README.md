# Python Test Utilities

This directory contains Python testing utilities for SDK implementations.

## Directory Structure

```
sdks/py/_test-utils/
├── test_runner.py          # Orchestrates test execution (main helper)
├── fixture_loader.py       # Loads JSON fixtures with config overrides
├── validator.py            # Validates captured data against fixtures
├── validator.test.py       # Tests for validator logic
├── mock_transport.py       # Captures Sentry data in-memory
└── README.md              # This file
```

**Note:** All files use `.py` extension with snake_case naming. No requirements.txt - dependencies come from each SDK's requirements.txt.

## 🚨 CRITICAL: JavaScript/Python Parity Rule

**The utilities in `sdks/py/_test-utils/` MUST be kept synchronized with `sdks/js/_test-utils/`.**

### Why This Matters

- Same fixtures (JSON) used by both languages
- Same validation logic = consistent behavior
- Same error messages = easier debugging
- Changes to one MUST be mirrored in the other

### When You Change Test Utils

**ALWAYS update both JS and Python versions together:**

1. **If you modify `validator.py`:**
   - Update `sdks/js/_test-utils/validator.cjs` with equivalent logic
   - **Update `validator.test.py` and `validator.test.cjs` with test cases for the new feature**
   - Run both test files: `python3 validator.test.py && node validator.test.cjs`
   - Run same fixture through both validators
   - Confirm identical error output

2. **If you modify `test_runner.py`:**
   - Update `sdks/js/_test-utils/test-runner.cjs` with equivalent logic
   - Test both implementations
   - Verify error messages match

3. **If you add a new helper function:**
   - Implement in both languages
   - Keep function signatures equivalent (account for camelCase vs snake_case)
   - Document any language-specific differences

## Core Components

### test_runner.py

The main helper that orchestrates test execution. Provides:

- **`run_test_case(testCaseId, testLogic)`** - Main test orchestration function
  - Loads SDK config from environment (`SDK_CONFIG`)
  - Loads fixture with `$ref` resolution and config overrides applied
  - Displays test name from `fixture["name"]` (no hardcoded descriptions)
  - Wraps test logic in Sentry span
  - Validates captured data against fixture
  - Shows SDK path in output: `[py/openai]`
  - Returns dict with `main()` and `assert_sentry()` functions

### fixture_loader.py

Loads JSON fixtures from `shared/specs/` with SDK-specific overrides:

- **`load_fixture(test_case_id, framework_type, config_overrides)`**
  - Reads fixture from `shared/specs/{test_case_id}/fixture-{framework_type}.json`
  - Resolves `$ref` references to shared span definitions (`common-spans.json`)
  - Applies config overrides (model names, span attributes)
  - Returns fixture with all overrides applied

**Features:**
- `$ref` syntax: `{ "$ref": "common-spans#/llm_call", "parent": "agent" }`
- Cached common spans for performance
- Override properties merge with referenced spans

### validator.py

Validates captured Sentry data against fixture expectations:

- **`validate_fixture(test_case_id, spans, transactions, events, framework_type, config_overrides)`**
  - Main validation function that orchestrates all validation steps
  - Checks transactions, spans, attributes, hierarchy, events
  - Returns validation result with detailed error messages

**Internal validation functions (not exported):**
- `validate_transactions()`, `validate_span_counts()`, `validate_events()` - Count validations
- `validate_span_items()` - Matches and validates individual spans
- `validate_span_relationships()` - Validates parent-child hierarchy
- `validate_span_attributes()` - Validates attributes with schema support
- `normalize_op_to_list()`, `format_op_description()` - Helper utilities

**Supported validation features:**
- Wildcard patterns: `"gpt-4*"`, `"*-mini"`, `"*anthropic*"`
- Pattern-based op matching: `{ "pattern": "gen_ai.*", "not": [...] }`
- Schema validation: `{ "type": "json_array", "min_length": 2, "items_have": [...] }`, `{ "type": "plain_string" }`
- Presence checks: `True` (attribute must exist)
- Order-based span matching: Multiple spans with same op matched in fixture order
- `None` treated as missing (not mismatch)

**Exports:** Only `validate_fixture` and `attribute_matches` (via `__all__`)

**Test file:** `validator.test.py` - Run with `python3 validator.test.py` to verify validator logic

### mock_transport.py

In-memory Sentry transport for testing:

- **`create_mock_transport(options)`** - Factory for mock transport
- **`get_mock_transport()`** - Get current transport instance
- **`clear_mock_transport()`** - Clear captured data

## Usage

### In SDK Setup Files (setup.py)

```python
import os
import sys
import sentry_sdk
from pathlib import Path
from dotenv import load_dotenv

# Add test utils to path (CRITICAL - DO NOT FORGET)
test_utils_path = Path(__file__).parent.parent / "_test-utils"
sys.path.insert(0, str(test_utils_path))

from mock_transport import create_mock_transport, get_mock_transport, clear_mock_transport


def before_all():
    """Initialize Sentry with mock transport"""
    print("🔧 Setting up {Your SDK} tests...")

    # Load environment variables
    env_path = Path(__file__).parent.parent.parent.parent / ".env"
    load_dotenv(dotenv_path=env_path)

    # Pre-initialize mock transport
    from mock_transport import MockTransportCapture
    import mock_transport as mt
    mt._mock_transport_capture = MockTransportCapture()

    mock_transport_instance = create_mock_transport(
        options={"dsn": os.getenv("SENTRY_DSN", "https://public@127.0.0.1/1")}
    )

    # Initialize Sentry
    sentry_sdk.init(
        traces_sample_rate=1.0,
        transport=mock_transport_instance,
        integrations=[
            # Your SDK's Sentry integration here
        ],
    )

    print("  ✓ Sentry initialized with mock transport")


def before_each():
    """Reset test state"""
    print("  ↻ Resetting test state...")
    clear_mock_transport()


def after_each():
    """Clean up after test"""
    print("  ✓ Cleaning up...")


def after_all():
    """Teardown Sentry"""
    print("🧹 Tearing down {Your SDK} tests...")
    sentry_sdk.flush(timeout=2.0)


def get_mock_sentry_transport():
    """Helper to get mock transport for assertions"""
    return get_mock_transport()
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

### In Test Case Files (cases/1-simple.py)

```python
import os
from your_sdk import YourClient
from test_runner import run_test_case


async def test_logic(inputs):
    """The actual test logic"""
    model = inputs["model"]
    system = inputs["system"]
    prompt = inputs["prompt"]

    # Your SDK-specific test logic here
    client = YourClient(api_key=os.getenv("YOUR_API_KEY"))
    response = client.generate(model=model, system=system, prompt=prompt)

    if not response.text:
        raise Exception("No output returned")

    if os.getenv("SENTRY_AI_TEST_VERBOSE") == "true":
        print(f"    Response: {response.text}")

    return response.text


# Framework type is loaded from config.json automatically
test_case = run_test_case("1-simple", test_logic)
main = test_case["main"]
assert_sentry = test_case["assert_sentry"]
```

## Important Notes

### sys.path Setup

Every Python SDK's `setup.py` MUST include this code to make test utils importable:

```python
import sys
from pathlib import Path

test_utils_path = Path(__file__).parent.parent / "_test-utils"
sys.path.insert(0, str(test_utils_path))
```

Test case files will automatically inherit this path setup.

## Parity Status

| Component | Python | JavaScript | Status | Notes |
|-----------|--------|------------|--------|-------|
| Test Runner | `test_runner.py` | `test-runner.cjs` | ✅ Synced | Both orchestrate tests correctly |
| Mock Transport | `mock_transport.py` | `mock-transport.cjs` | ✅ Synced | Both capture envelopes correctly |
| Fixture Loader | `fixture_loader.py` | `fixture-loader.cjs` | ✅ Synced | Both support config overrides |
| Fixture Validator | `validator.py` | `validator.cjs` | ✅ Synced | Schema validation, pattern ops, wildcards |
| Validator Tests | `validator.test.py` | `validator.test.cjs` | ✅ Synced | Both test schema validation |

## See Also

- [JavaScript Test Utilities](../../js/_test-utils/README.md) - JavaScript equivalent of these utilities
- [Adding SDKs Guide](../README.md) - Step-by-step SDK implementation guide
- [Test Specifications](../../../shared/specs/README.md) - Fixture format & framework types
- [Main Documentation](../../../CLAUDE.md) - Project overview & critical rules
