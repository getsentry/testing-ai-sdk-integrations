# Adding & Implementing SDKs

This guide covers how to add new SDK implementations to the testing framework.

## Currently Implemented

| Language | SDK               | Status     | Notes                              |
| -------- | ----------------- | ---------- | ---------------------------------- |
| JS       | `vercel` (AI SDK) | ✅ Working | 1-simple test passing              |
| Python   | `openai-agents`   | ⚠️ Partial | 1-simple test exists but may fail  |

## Planned SDKs

- JavaScript: OpenAI SDK, Anthropic, LangChain, LlamaIndex
- Python: LangChain, Anthropic, OpenAI, LlamaIndex

**Note:** Not all SDKs support all features (streaming, function calling, etc.)

## Adding a New JavaScript SDK

### Step 1: Determine Framework Type

First, determine if your SDK is "agentic" or "low-level":
- Run a simple test and examine spans
- Agent/workflow wrappers → `agentic`
- Direct LLM calls only → `low-level`

See [../shared/specs/README.md](../shared/specs/README.md) for framework type definitions.

### Step 2: Create Directory Structure

```bash
mkdir -p sdks/js/{sdk-name}/cases
touch sdks/js/{sdk-name}/setup.js
touch sdks/js/{sdk-name}/package.json
```

### Step 3: Create package.json

```json
{
  "name": "@sentry-ai-sdks/{sdk-name}",
  "version": "1.0.0",
  "dependencies": {
    "@sentry/node": "^8.0.0",
    "{your-ai-sdk}": "^x.x.x"
  }
}
```

Run `npm install` in the SDK directory.

### Step 4: Implement setup.js (Copy-Paste Template)

```javascript
/**
 * Setup file for {SDK Name} tests
 */

const Sentry = require("@sentry/node");
const { config } = require("dotenv");
const { resolve } = require("path");
const {
  createMockTransport,
  getMockTransport,
  clearMockTransport,
} = require("../../../shared/test-utils/js/mock-transport.js");

async function beforeAll() {
  console.log("🔧 Setting up {SDK Name} tests...");

  // Load environment variables from .env file
  config({ path: resolve(__dirname, ".env") });

  // Initialize Sentry with mock transport
  Sentry.init({
    dsn: process.env.SENTRY_DSN || "https://public@127.0.0.1/1",
    tracesSampleRate: 1.0,
    transport: createMockTransport,
    integrations: [
      // Add your SDK's Sentry integration here
      // Sentry.yourSDKIntegration(),
    ],
  });

  console.log("  ✓ Sentry initialized with mock transport");
}

async function beforeEach() {
  console.log("  ↻ Resetting test state...");
  clearMockTransport();
}

async function afterEach() {
  console.log("  ✓ Cleaning up...");
}

async function afterAll() {
  console.log("🧹 Tearing down {SDK Name} tests...");
  await Sentry.close();
}

function getMockSentryTransport() {
  return getMockTransport();
}

module.exports = {
  beforeAll,
  beforeEach,
  afterEach,
  afterAll,
  getMockSentryTransport,
};
```

### Step 5: Implement Test Case (e.g., 1-simple.js)

```javascript
const Sentry = require("@sentry/node");
const { getMockSentryTransport } = require("../setup");
const {
  validateFixture,
  loadFixture,
} = require("../../../../shared/test-utils/js/fixtures");

// Set framework type based on your SDK
const FRAMEWORK_TYPE = "agentic"; // or "low-level"

module.exports = async function () {
  console.log("    Running 1-simple: Basic Completion");

  await Sentry.startSpan(
    { name: "1-simple-basic-completion", op: "test" },
    async () => {
      await runTest();
    }
  );

  await Sentry.flush(2000);
  await new Promise((resolve) => setTimeout(resolve, 50));

  await assertSentryCaptured();

  console.log("    ✓ 1-simple completed");
};

async function runTest() {
  const fixture = loadFixture("1-simple", FRAMEWORK_TYPE);
  const { model, system, prompt } = fixture.inputs;

  // TODO: Implement your SDK's API call here
  // const response = await yourSDK.generateText({ model, system, prompt });
}

async function assertSentryCaptured() {
  const transport = getMockSentryTransport();
  const spans = transport.getSpans();
  const transactions = transport.getTransactions();
  const events = transport.getEvents();

  const result = validateFixture("1-simple", spans, transactions, events, FRAMEWORK_TYPE);

  if (!result.passed) {
    console.log("    ✗ Validation failed:");
    result.errors.forEach((error) => console.log(`      - ${error}`));
    throw new Error(`Fixture validation failed:\n${result.errors.join("\n")}`);
  }

  console.log("    ✓ All fixture validations passed");
}
```

### Step 6: Test Your Implementation

```bash
cd shared/orchestration
npm run cli -- run --sdk js/{your-sdk}
```

## Adding a New Python SDK

### Step 1: Determine Framework Type

Same as JavaScript - determine if "agentic" or "low-level".

### Step 2: Create Directory Structure

```bash
mkdir -p sdks/py/{sdk-name}/cases
touch sdks/py/{sdk-name}/setup.py
touch sdks/py/{sdk-name}/requirements.txt
```

### Step 3: Create requirements.txt

```
sentry-sdk>=2.0.0
{your-ai-sdk}>=x.x.x
python-dotenv>=1.0.0
```

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

# Add shared test utils to path (CRITICAL - DO NOT FORGET)
shared_path = Path(__file__).parent.parent.parent.parent / "shared" / "test-utils" / "py"
sys.path.insert(0, str(shared_path))

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
    sentry_sdk.init(
        dsn=os.getenv("SENTRY_DSN", "https://public@127.0.0.1/1"),
        traces_sample_rate=1.0,
        transport=mock_transport_instance,
        integrations=[
            # Add your SDK's Sentry integration here
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
    print("🧹 Tearing down {SDK Name} tests...")
    sentry_sdk.flush(timeout=2.0)


def get_mock_sentry_transport():
    """Helper to get mock transport for assertions"""
    return get_mock_transport()
```

### Step 5: Implement Test Case (e.g., 1-simple.py)

```python
"""
1-simple: Basic Completion
"""

import asyncio

# Set framework type based on your SDK
FRAMEWORK_TYPE = "agentic"  # or "low-level"


async def main():
    """Entry point - runs test logic only"""
    print("    Running 1-simple: Basic Completion")
    await run_test()
    print("    ✓ Test logic completed")


async def assert_sentry():
    """Validation - checks Sentry captured data"""
    await asyncio.sleep(0.1)  # Buffer for transport
    await assert_sentry_captured()
    print("    ✓ 1-simple validation passed")


async def run_test():
    """The actual test implementation"""
    from fixtures import load_fixture

    fixture = load_fixture("1-simple", FRAMEWORK_TYPE)
    model = fixture["inputs"]["model"]
    system = fixture["inputs"]["system"]
    prompt = fixture["inputs"]["prompt"]

    # TODO: Implement your SDK's API call here
    # response = await your_sdk.generate_text(model=model, system=system, prompt=prompt)


async def assert_sentry_captured():
    """Verify Sentry captured the expected data"""
    from fixtures import validate_fixture
    from setup import get_mock_sentry_transport

    transport = get_mock_sentry_transport()
    spans = transport.get_spans()
    transactions = transport.get_transactions()
    events = transport.get_events()

    result = validate_fixture("1-simple", spans, transactions, events, FRAMEWORK_TYPE)

    if not result["passed"]:
        print("    ✗ Validation failed:")
        for error in result["errors"]:
            print(f"      - {error}")
        raise Exception(f"Fixture validation failed with {len(result['errors'])} error(s)")

    print("    ✓ All fixture validations passed")
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
