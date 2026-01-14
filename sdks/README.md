# Adding & Implementing SDKs

This guide covers how to add new SDK implementations to the testing framework.

## Quick Reference Checklist

When adding a new SDK, ensure you:

- [ ] Create `config.json` with framework type and model overrides
- [ ] Pin **exact versions** in `package.json` or `requirements.txt` (no `^`, `~`, or `>=`)
- [ ] Use `runTestCase` helper from `test-runner.cjs` (JS) or `test_runner.py` (Python)
- [ ] **Never hardcode model mappings** - use config.json overrides
- [ ] Follow existing SDK patterns (`vercel`, `anthropic` for JS; `google-genai` for Python)
- [ ] Test with `npm run cli run {language}/{sdk-name}`

## Currently Implemented

| Language   | SDK             | Framework Type | Test Cases |
| ---------- | --------------- | -------------- | ---------- |
| JavaScript | `vercel`        | agentic        | 1-simple   |
| JavaScript | `openai`        | low-level      | 1-simple   |
| JavaScript | `anthropic`     | low-level      | 1-simple   |
| JavaScript | `langchain`     | low-level      | 1-simple   |
| JavaScript | `langgraph`     | agentic        | 1-simple   |
| JavaScript | `google-genai`  | low-level      | 1-simple   |
| Python     | `openai`        | low-level      | 1-simple   |
| Python     | `openai-agents` | agentic        | 1-simple   |
| Python     | `anthropic`     | low-level      | 1-simple   |
| Python     | `langchain`     | low-level      | 1-simple   |
| Python     | `langgraph`     | agentic        | 1-simple   |
| Python     | `google-genai`  | low-level      | 1-simple   |
| Python     | `litellm`       | low-level      | 1-simple   |
| Python     | `pydantic-ai`   | agentic        | 1-simple   |

## Adding a New JavaScript SDK

### Step 1: Determine Framework Type

First, determine if your SDK is "agentic" or "low-level":

- Run a simple test and examine spans
- Agent/workflow wrappers → `agentic`
- Direct LLM calls only → `low-level`

See [../shared/specs/README.md](../shared/specs/README.md) for framework type definitions.

### Step 2: Create SDK Configuration

**IMPORTANT:** Every SDK must have a `config.json` file to define its framework type and any fixture overrides.

#### Why Config Files Are Required

The test framework uses JSON fixtures to define expected behavior. However, different SDKs have different requirements:

- **Model names**: OpenAI SDKs use `gpt-5-nano`, Google GenAI uses `gemini-2.5-flash-lite`, Anthropic uses `claude-3-5-sonnet-20241022`
- **Span attributes**: Some SDKs may capture different attributes or use different attribute names
- **Per-test-case variation**: Some tests may need different models (e.g., use a more capable model for complex agentic workflows)

The config.json file allows per-SDK parametrization of test fixtures without duplicating fixture files.

#### Config File Format

Create `sdks/{language}/{sdk-name}/config.json`:

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

**Schema:**

- `sdk_name` (required): Unique identifier for your SDK
- `framework_type` (required): Either `"agentic"` or `"low-level"`
- `overrides` (optional): Per-test-case overrides for fixture values

**Overrides Format:**

- Key = test case ID (e.g., `"1-simple"`, `"2-simple-with-error"`)
- Value = object with attribute overrides
- Special key `"model"` automatically overrides `inputs.model`
- Other keys override `expectations.spans[].required_attributes` with matching keys

#### Examples

**OpenAI SDK (no overrides needed):**

```json
{
  "sdk_name": "openai",
  "framework_type": "low-level",
  "overrides": {}
}
```

**Google GenAI SDK (different model):**

```json
{
  "sdk_name": "google-genai",
  "framework_type": "low-level",
  "overrides": {
    "1-simple": {
      "model": "gemini-2.5-flash-lite",
      "gen_ai.request.model": "gemini-2.5-flash-lite",
      "gen_ai.response.model": "gemini-2.5-flash-lite"
    }
  }
}
```

**Anthropic SDK (different model):**

```json
{
  "sdk_name": "anthropic",
  "framework_type": "low-level",
  "overrides": {
    "1-simple": {
      "model": "claude-3-5-sonnet-20241022",
      "gen_ai.request.model": "claude-3-5-sonnet-20241022",
      "gen_ai.response.model": "claude-3-5-sonnet-20241022"
    }
  }
}
```

**Per-Test-Case Variation:**

```json
{
  "sdk_name": "openai",
  "framework_type": "low-level",
  "overrides": {
    "1-simple": {
      "model": "gpt-5-nano"
    },
    "2-multi-step": {
      "model": "gpt-5-nano"
    }
  }
}
```

See [../shared/specs/sdk-config-schema.json](../shared/specs/sdk-config-schema.json) for the complete JSON schema.

### Step 3: Create Directory Structure

```bash
mkdir -p sdks/js/{sdk-name}/cases
touch sdks/js/{sdk-name}/setup.js
touch sdks/js/{sdk-name}/package.json
```

### Step 3: Create package.json

**IMPORTANT: Always use exact latest versions (no ^ or ~)**

To get the latest versions, run:

```bash
npm view @sentry/node version
npm view {your-ai-sdk} version
npm view dotenv version
```

Create `package.json` with **exact versions** (no semver ranges):

```json
{
  "name": "@sentry-ai-sdks/{sdk-name}",
  "version": "1.0.0",
  "description": "{SDK Name} integration tests for Sentry",
  "dependencies": {
    "@sentry/node": "10.24.0",
    "{your-ai-sdk}": "x.x.x",
    "dotenv": "16.4.7"
  }
}
```

**Why exact versions?**

- Ensures reproducible builds
- Makes it clear when dependencies need updating
- Prevents unexpected breaking changes
- Easier to track which versions are being tested

Run `npm install` in the SDK directory.

### Step 4: Implement setup.js (Copy-Paste Template)

**CRITICAL: Follow this exact pattern - check existing SDKs like `vercel` or `anthropic` for current examples**

```javascript
/**
 * Setup file for {SDK Name} tests
 *
 * Initializes Sentry with {SDK Name}-specific integrations.
 */

const Sentry = require("@sentry/node");
const { config } = require("dotenv");
const { resolve } = require("path");
const { createMockTransport } = require("../_test-utils/mock-transport.cjs");

// Load environment variables
config({ path: resolve(__dirname, ".env") });

// Initialize Sentry
// Note: This template uses @sentry/node where AI integrations are auto-enabled.
// If using a different Sentry package (e.g., @sentry/browser), you'll need to manually add integrations.
Sentry.init({
  dsn: process.env.SENTRY_DSN || "https://public@127.0.0.1/1",
  tracesSampleRate: 1.0,
  transport: createMockTransport,
  sendDefaultPii: true,
});

module.exports = { Sentry };
```

### Step 5: Implement Test Case (e.g., 1-simple.js)

**CRITICAL: Use the `runTestCase` helper from test-runner.cjs**

The framework type is loaded automatically from `config.json`, so you don't need to specify it in test cases.

```javascript
/**
 * 1-simple: Basic Completion
 *
 * Tests a simple chat completion request with {Your SDK}
 * and verifies that Sentry captures the appropriate spans and AI monitoring data.
 */

const { Sentry } = require("../setup");
const YourSDK = require("your-sdk-package");
const { runTestCase } = require("../../_test-utils/test-runner.cjs");

async function testLogic(inputs) {
  const { model, system, prompt } = inputs;

  // Your SDK-specific code here
  // Example for Anthropic:
  const client = new YourSDK({
    apiKey: process.env.YOUR_API_KEY,
  });

  const response = await client.yourMethod({
    model: model, // model is already overridden via config.json
    system: system,
    messages: [{ role: "user", content: prompt }],
  });

  // Validate response
  if (!response) {
    throw new Error("No completion returned");
  }

  // Optional: Log for debugging
  if (process.env.SENTRY_AI_TEST_VERBOSE === "true") {
    console.log(`    Response: ${JSON.stringify(response)}`);
  }
}

// Framework type is loaded from config.json automatically
module.exports = runTestCase("1-simple", testLogic, Sentry);
```

**IMPORTANT: Key Points**

1. **Never hardcode model mappings** in test files - always use config.json overrides
2. **Pin exact versions** in package.json (no `^` or `~`)
3. **Use the runTestCase helper** - don't manually handle fixtures/validation
4. **Check existing SDKs** (`vercel`, `anthropic`) for current patterns before implementing

### Step 6: Test Your Implementation

```bash
# Run your SDK's tests
cd shared/orchestration
npm run cli run -- --sdk js/{your-sdk}

# Run all tests to see your SDK in the matrix
npm run cli run -- --all
```

## Adding a New Python SDK

### Step 1: Determine Framework Type

Same as JavaScript - determine if "agentic" or "low-level".

### Step 2: Create SDK Configuration

**Same as JavaScript Step 2** - Create `config.json` with framework type and overrides.

See examples in the JavaScript section above.

### Step 3: Create Directory Structure

```bash
mkdir -p sdks/py/{sdk-name}/cases
touch sdks/py/{sdk-name}/setup.py
touch sdks/py/{sdk-name}/requirements.txt
```

### Step 3: Create requirements.txt

**IMPORTANT: Always use exact latest versions (use == not >=)**

To get the latest versions, run:

```bash
pip index versions sentry-sdk
pip index versions {your-ai-sdk}
pip index versions python-dotenv
```

Create `requirements.txt` with **exact versions**:

```
sentry-sdk==2.x.x
{your-ai-sdk}==x.x.x
python-dotenv==1.x.x
```

**Why exact versions?**

- Ensures reproducible builds
- Makes it clear when dependencies need updating
- Prevents unexpected breaking changes
- Easier to track which versions are being tested

Create virtual environment and install:

```bash
cd sdks/py/{sdk-name}
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### Step 4: Implement setup.py (Copy-Paste Template)

```python
"""
Setup file for {SDK Name} tests
"""

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
    print("🔧 Setting up {SDK Name} tests...")

    # Load environment variables
    env_path = Path(__file__).parent / ".env"
    load_dotenv(dotenv_path=env_path)

    # Pre-initialize mock transport
    from mock_transport import MockTransportCapture, _mock_transport_capture
    import mock_transport as mt
    mt._mock_transport_capture = MockTransportCapture()

    mock_transport_instance = create_mock_transport(
        options={"dsn": os.getenv("SENTRY_DSN", "https://public@127.0.0.1/1")}
    )

    # Initialize Sentry
    # Note: AI integrations are auto-enabled in Python - no need to manually add them
    sentry_sdk.init(
        traces_sample_rate=1.0,
        transport=mock_transport_instance,
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
    print("🧹 Tearing down {SDK Name} tests...")
    sentry_sdk.flush(timeout=2.0)


def get_mock_sentry_transport():
    """Helper to get mock transport for assertions"""
    return get_mock_transport()
```

### Step 5: Implement Test Case (e.g., 1-simple.py)

**CRITICAL: Use the `run_test_case` helper from test_runner.py**

The framework type is loaded automatically from `config.json`, so you don't need to specify it in test cases.

```python
"""
1-simple: Basic Completion

Tests a simple chat completion request with {Your SDK}
and verifies that Sentry captures the appropriate spans and AI monitoring data.
"""

import os
from your_sdk import YourSDKClient
from test_runner import run_test_case


async def test_logic(inputs):
    """The actual test logic"""
    model = inputs["model"]
    system = inputs["system"]
    prompt = inputs["prompt"]

    # Your SDK-specific code here
    client = YourSDKClient(api_key=os.getenv("YOUR_API_KEY"))

    response = client.generate(
        model=model,  # model is already overridden via config.json
        system=system,
        prompt=prompt,
    )

    if not response.text:
        raise Exception("No output returned from {Your SDK}")

    # Optional: Log for debugging
    if os.getenv("SENTRY_AI_TEST_VERBOSE") == "true":
        print(f"    Response: {response.text}")

    return response.text


# Framework type is loaded from config.json automatically
test_case = run_test_case("1-simple", test_logic)
main = test_case["main"]
assert_sentry = test_case["assert_sentry"]
```

### Step 6: Test Your Implementation

```bash
cd shared/orchestration
npm run cli -- run --sdk py/{your-sdk}
```

## General Testing Commands

```bash
# Run specific SDK and case
npm run cli run -- --sdk js/your-sdk --case 1-simple

# Run all cases for an SDK
npm run cli run -- --sdk js/your-sdk

# Run specific case across all SDKs
npm run cli run -- --case 1-simple

# Run everything
npm run cli run -- --all
```

## See Also

- [Test Specifications](../shared/specs/README.md) - Fixture format & framework types
- [Test Utilities](../shared/test-utils/README.md) - Mock transport & validation
- [CLI Documentation](../shared/orchestration/README.md) - Test orchestration
- [Troubleshooting](../docs/TROUBLESHOOTING.md) - Common pitfalls
- [Main Documentation](../CLAUDE.md) - Project overview & critical rules
