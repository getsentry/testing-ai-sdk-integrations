# Python Test Utilities

This directory contains Python testing utilities for SDK implementations.

## Directory Structure

```
sdks/py/_test-utils/
├── sdk_helpers.py          # Consolidated SDK test helpers (setup, orchestration)
├── assertions.py           # Span query helpers
├── mock_transport.py       # Captures Sentry data in-memory
└── fixtures/
    ├── __init__.py         # Fixture exports
    ├── fixture_loader.py   # Loads JSON fixtures from shared/specs/
    └── validator.py        # Validates captured data against fixtures
```

## 🚨 CRITICAL: JavaScript/Python Parity Rule

**The utilities in `sdks/py/_test-utils/` MUST be kept synchronized with `sdks/js/_test-utils/`.**

### Why This Matters

- Same fixtures (JSON) used by both languages
- Same validation logic = consistent behavior
- Same error messages = easier debugging
- Changes to one MUST be mirrored in the other

### When You Change Test Utils

**ALWAYS update both JS and Python versions together:**

1. **If you modify `assertions.py`:**
   - Update `sdks/js/_test-utils/assertions.cjs` with equivalent logic
   - Test both implementations
   - Verify error messages match

2. **If you modify `fixtures/validator.py`:**
   - Update `sdks/js/_test-utils/fixtures/validator.cjs` with equivalent logic
   - Run same fixture through both validators
   - Confirm identical error output

3. **If you add a new helper function:**
   - Implement in both languages
   - Keep function signatures equivalent (account for camelCase vs snake_case)
   - Document any language-specific differences

## SDK Helpers

The `sdk_helpers.py` module provides utilities to eliminate boilerplate:

- **`create_sdk_setup()`** - Factory for lifecycle hooks (before_all, after_each, etc.)
- **`run_test_case()`** - Orchestrates test execution with validation
- **`load_config_override()`** - Reads config overrides from environment
- **`assert_sentry_fixture()`** - Validates captured Sentry data

See the file for detailed documentation and examples.

## Usage

### In SDK Setup Files

```python
import sys
from pathlib import Path
from sentry_sdk.integrations.your_integration import YourIntegration

# Add test utils to path (CRITICAL - DO NOT FORGET)
test_utils_path = Path(__file__).parent.parent / "_test-utils"
sys.path.insert(0, str(test_utils_path))

from sdk_helpers import create_sdk_setup

module_exports = create_sdk_setup(
    sdk_name="Your SDK",
    env_path="../../../../.env",
    sentry_options={
        'integrations': [
            YourIntegration(include_prompts=True),
        ],
    }
)

# Export functions for test runner
before_all = module_exports['before_all']
before_each = module_exports['before_each']
after_each = module_exports['after_each']
after_all = module_exports['after_all']
get_mock_sentry_transport = module_exports['get_mock_sentry_transport']
```

### In Test Case Files

```python
import os
from your_sdk import YourClient
from sdk_helpers import run_test_case
from setup import get_mock_sentry_transport

FRAMEWORK_TYPE = "low-level"  # or "agentic"

async def test_logic(inputs):
    """The actual test logic"""
    model = inputs["model"]
    system = inputs["system"]
    prompt = inputs["prompt"]

    # Your SDK-specific test logic here
    client = YourClient(api_key=os.getenv("YOUR_API_KEY"))
    response = client.generate(model=model, system=system, prompt=prompt)

    return response.text

# Export test case functions
test_case = run_test_case("1-simple", FRAMEWORK_TYPE, test_logic, get_mock_sentry_transport)
main = test_case['main']
assert_sentry = test_case['assert_sentry']
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

| Component | Python | JavaScript | Status |
|-----------|--------|------------|--------|
| SDK Helpers | `sdk_helpers.py` | `sdk-helpers.cjs` | ✅ Synced |
| Mock Transport | `mock_transport.py` | `mock-transport.cjs` | ✅ Synced |
| Fixture Loader | `fixtures/fixture_loader.py` | `fixtures/fixture-loader.cjs` | ✅ Synced |
| Fixture Validator | `fixtures/validator.py` | `fixtures/validator.cjs` | ✅ Synced |
| Assertions | `assertions.py` | `assertions.cjs` | ⚠️ Partial |

**Action Required:** Implement missing assertion helpers in Python to achieve full parity with JavaScript.
