# Troubleshooting Guide

This guide covers common issues you'll encounter when working with the Sentry AI SDK testing framework and how to resolve them.

## Quick Diagnostic Checklist

When a test fails, check these first:

- [ ] Did you run `npm install` in the SDK directory?
- [ ] Did you create a `.venv` and install requirements (Python SDKs)?
- [ ] Are relative import paths correct? (count `../` carefully)
- [ ] Is `sys.path.insert(0, ...)` present in Python setup.py?
- [ ] Are you using `.js` files (not `.ts`) for SDK tests?
- [ ] Is `FRAMEWORK_TYPE` set correctly for your SDK?
- [ ] Did you call `await Sentry.flush()` before assertions (JavaScript)?

## Common Pitfalls

### Pitfall #1: Exporting frameworkType from setup.js breaks tests

**Symptoms:**
- Error: "Mock transport not initialized"
- TypeError: Cannot read property 'getSpans' of undefined

**Problem:**
```javascript
// ❌ BAD - breaks module loading
module.exports = {
  frameworkType: "agentic",  // This causes issues
  beforeAll,
  beforeEach,
  afterEach,
  afterAll,
  getMockSentryTransport,
};
```

**Why it breaks:** Importing `frameworkType` from setup creates module loading race conditions where the mock transport singleton isn't properly shared between setup and test files.

**Solution:**
```javascript
// ✅ GOOD - use constant in test case
// In: sdks/js/vercel/cases/1-simple.js
const FRAMEWORK_TYPE = "agentic";  // Define in test file

const fixture = loadFixture("1-simple", FRAMEWORK_TYPE);
const result = validateFixture("1-simple", spans, transactions, events, FRAMEWORK_TYPE);
```

**Additional notes:**
- Each test case should define its own `FRAMEWORK_TYPE` constant
- All test cases in an SDK should use the same framework type
- Don't try to centralize this in setup.js

---

### Pitfall #2: Using ES modules (import/export) in SDK test files

**Symptoms:**
- SyntaxError: Cannot use import statement outside a module
- ReferenceError: exports is not defined

**Problem:**
```javascript
// ❌ BAD - causes "Cannot use import statement outside a module"
import Sentry from "@sentry/node";
import { loadFixture } from "../../_test-utils/fixtures";

export default async function() {
  // ...
}
```

**Why it breaks:** SDK test files use CommonJS for compatibility with the test runner and to avoid compilation steps.

**Solution:**
```javascript
// ✅ GOOD - use CommonJS require/module.exports
const Sentry = require("@sentry/node");
const { loadFixture } = require("../../_test-utils/fixtures");

module.exports = async function () {
  // test implementation
};
```

**Module system reference:**
| Location | Module System | Syntax |
|----------|---------------|--------|
| `sdks/js/*/` | CommonJS | `require()`, `module.exports` |
| `shared/orchestration/` | ES Modules | `import`, `export` |
| `sdks/js/_test-utils/` | CommonJS | `require()`, `module.exports` |

---

### Pitfall #3: Forgetting sys.path setup in Python SDK

**Symptoms:**
- ModuleNotFoundError: No module named 'mock_transport'
- ModuleNotFoundError: No module named 'fixtures'

**Problem:**
```python
# ❌ BAD - import fails immediately
import sentry_sdk
from mock_transport import create_mock_transport  # ERROR
```

**Why it breaks:** Python doesn't have project-wide module resolution by default. Shared test utilities are outside the SDK directory, so Python can't find them.

**Solution:**
```python
# ✅ GOOD - add sys.path setup BEFORE imports
import os
import sys
import sentry_sdk
from pathlib import Path
from dotenv import load_dotenv

# Add shared test utils to path (CRITICAL - DO NOT FORGET)
shared_path = Path(__file__).parent.parent.parent.parent / "_test-utils"
sys.path.insert(0, str(shared_path))

# Now imports work
from mock_transport import create_mock_transport, get_mock_transport, clear_mock_transport
```

**Path breakdown:**
```
Path(__file__)                    # /path/to/sdks/py/your-sdk/setup.py
.parent                            # /path/to/sdks/py/your-sdk/
.parent.parent.parent.parent       # /path/to/ (repo root)
/ "_test-utils"  # /path/to/shared/test-utils/py/
```

---

### Pitfall #4: Wrong relative path counts in JavaScript

**Symptoms:**
- Error: Cannot find module '../../_test-utils/fixtures'
- Module not found: Can't resolve '../_test-utils/mock-transport'

**Problem:**
```javascript
// ❌ BAD - wrong number of ../
const { loadFixture } = require("../_test-utils/fixtures");
// Too few levels up!
```

**Why it breaks:** Relative paths must traverse up to repo root, then down to target directory.

**Solution:**
```javascript
// ✅ GOOD - count levels carefully
// From: sdks/js/vercel/cases/1-simple.js (4 levels deep from root)
// To:   sdks/js/_test-utils/fixtures/
const { loadFixture } = require("../../_test-utils/fixtures");
//                                  ^^^^
//                                  4 levels: cases/ -> vercel/ -> js/ -> sdks/ -> root
```

**Formula for counting:**
1. Start at your test file location
2. Count how many directories deep you are from repo root
3. That's your `../` count
4. Then add the path down to target directory

**Common paths from test cases:**
```javascript
// From sdks/js/{sdk}/cases/{test}.js:
require("../../_test-utils/mock-transport.js");
require("../../_test-utils/fixtures");
require("../setup");  // SDK's setup.js

// From sdks/js/{sdk}/setup.js:
require("../_test-utils/mock-transport.js");
```

---

### Pitfall #5: Missing .venv in Python SDK

**Symptoms:**
- Error: No module named 'sentry_sdk'
- Error: No module named 'openai' (or other AI SDK)
- Python test exits immediately with import errors

**Problem:**
```bash
$ npm run cli run -- --sdk py/your-sdk
# Error: No module named 'sentry_sdk'
```

**Why it breaks:** Python dependencies aren't installed in the system Python or aren't accessible to the test runner.

**Solution:**
```bash
# ✅ GOOD - create virtual environment first
cd sdks/py/your-sdk
python3 -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
pip install -r requirements.txt

# Now run tests from orchestration directory
cd ../../../shared/orchestration
npm run cli run -- --sdk py/your-sdk
```

**How the orchestrator finds Python:**
1. Checks for `sdks/py/your-sdk/.venv/bin/python` ← Uses this if exists
2. Falls back to `python3` system command

**Best practice:** Always create a `.venv` in each Python SDK directory to ensure isolated dependencies.

---

### Pitfall #6: Using TypeScript (.ts) for SDK test files

**Symptoms:**
- Warning: "SDK has no setup file" (✓ indicator missing in `list` output)
- Tests don't run even though files exist

**Problem:**
```bash
# Created setup.ts instead of setup.js
sdks/js/your-sdk/
├── setup.ts          # ❌ Wrong!
└── cases/
    └── 1-simple.ts   # ❌ Wrong!
```

**Why it breaks:** The orchestrator only looks for `.js` files (and `.py` for Python SDKs). TypeScript files require compilation.

**Solution:**
```bash
# ✅ GOOD - use .js for SDK files
sdks/js/your-sdk/
├── setup.js          # ✓ Correct
└── cases/
    └── 1-simple.js   # ✓ Correct
```

**File extension reference:**
| Location | Extension | Reason |
|----------|-----------|--------|
| `sdks/js/*/` | `.js` | No build step, CommonJS compatibility |
| `shared/orchestration/src/` | `.ts` | Type safety for complex orchestration logic |
| `sdks/py/*/` | `.py` | Standard Python |

---

### Pitfall #7: Calling assert_sentry() from main() in Python

**Symptoms:**
- AssertionError: No spans found (but SDK is instrumented correctly)
- Validation fails even though test logic succeeds

**Problem:**
```python
# ❌ BAD - assert_sentry() runs too early
async def main():
    await run_test()
    await assert_sentry()  # Mock transport not fully populated yet!
```

**Why it breaks:** The orchestrator needs to call `sentry_sdk.flush()` between running the test and checking assertions. If you call `assert_sentry()` from `main()`, it runs before flushing completes.

**Solution:**
```python
# ✅ GOOD - let orchestrator call them separately
async def main():
    """Entry point - runs ONLY the test logic"""
    print("    Running 1-simple: Basic Completion")
    await run_test()
    print("    ✓ Test logic completed")

async def assert_sentry():
    """Validation - checks ONLY Sentry captured data
    Called by orchestrator AFTER main() completes and Sentry flushes"""
    await asyncio.sleep(0.1)  # Buffer for transport
    await assert_sentry_captured()
    print("    ✓ 1-simple validation passed")
```

**Test execution flow for Python:**
1. Orchestrator imports test module
2. Orchestrator calls `main()` ← Run test logic
3. Orchestrator calls `sentry_sdk.flush()` ← Ensure events captured
4. Orchestrator calls `assert_sentry()` ← Validate captured data

---

### Pitfall #8: Wrong framework type for SDK

**Symptoms:**
- Error: "No span found with op='gen_ai.invoke_agent'" (when using agentic fixture on low-level SDK)
- Error: "No span found with op='gen_ai.chat'" (when using low-level fixture on agentic SDK)

**Problem:**
Test fails even though the SDK is working correctly. The issue is using the wrong fixture variant.

**Solution:**
1. Run your SDK and examine actual spans captured
2. Check if you see agent/workflow wrapper spans → use `FRAMEWORK_TYPE = "agentic"`
3. Check if you only see direct LLM call spans → use `FRAMEWORK_TYPE = "low-level"`
4. Update `FRAMEWORK_TYPE` constant in **all** test cases for that SDK

**Framework type examples:**
```javascript
// Agentic frameworks (produce wrapper spans)
const FRAMEWORK_TYPE = "agentic";
// Examples: Vercel AI SDK, OpenAI Agents SDK

// Low-level frameworks (direct LLM calls only)
const FRAMEWORK_TYPE = "low-level";
// Examples: OpenAI SDK, Anthropic SDK
```

**How to diagnose:**
```javascript
// Add debug output in your test
const transport = getMockSentryTransport();
const spans = transport.getSpans();
console.log("Captured spans:", spans.map(s => s.op));

// Output might be:
// ["gen_ai.invoke_agent", "gen_ai.chat"]  → agentic
// ["gen_ai.chat"]                         → low-level
```

---

## Debugging Tips

### Enable Verbose Logging

**JavaScript:**
```javascript
// In test case
console.log("Debug: Running test with model:", model);
console.log("Debug: Captured spans:", transport.getSpans().map(s => ({ op: s.op, name: s.description })));
```

**Python:**
```python
# In test case
print(f"Debug: Running test with model: {model}")
transport = get_mock_sentry_transport()
print(f"Debug: Captured {len(transport.get_spans())} spans")
```

### Inspect Captured Sentry Data

```javascript
// JavaScript
const transport = getMockSentryTransport();
console.log("Spans:", JSON.stringify(transport.getSpans(), null, 2));
console.log("Transactions:", JSON.stringify(transport.getTransactions(), null, 2));
console.log("Events:", JSON.stringify(transport.getEvents(), null, 2));
```

```python
# Python
transport = get_mock_sentry_transport()
import json
print("Spans:", json.dumps(transport.get_spans(), indent=2, default=str))
```

### Verify Sentry Is Initialized

```javascript
// JavaScript
const Sentry = require("@sentry/node");
const client = Sentry.getClient();
console.log("Sentry client:", client ? "initialized" : "NOT initialized");
```

```python
# Python
import sentry_sdk
client = sentry_sdk.Hub.current.client
print(f"Sentry client: {'initialized' if client else 'NOT initialized'}")
```

---

## Error Message Decoder

### "Mock transport not initialized"

**Likely causes:**
1. Forgot to call `createMockTransport()` before `Sentry.init()` (JavaScript)
2. Exported frameworkType from setup.js (see Pitfall #1)
3. Module loading order issue

**Fix:** Ensure mock transport is created before Sentry.init()

---

### "Cannot find module"

**Likely causes:**
1. Wrong relative path (see Pitfall #4)
2. Missing `sys.path.insert()` in Python (see Pitfall #3)
3. Forgot to run `npm install` or `pip install`

**Fix:** Count `../` carefully and verify imports

---

### "No span found with op='...'"

**Likely causes:**
1. Wrong framework type (see Pitfall #8)
2. SDK integration not working (check Sentry is initialized)
3. Forgot to flush Sentry before assertions

**Fix:** Verify spans are captured, check framework type

---

### "Fixture validation failed"

**Likely causes:**
1. Fixture expectations don't match actual SDK output
2. Sentry SDK version mismatch
3. AI SDK version changed behavior

**Fix:** Compare actual attributes vs required attributes in error message

---

## Getting Help

If you're still stuck after checking this guide:

1. **Check the error message carefully** - It usually tells you exactly what's wrong
2. **Compare with working examples** - Look at `sdks/js/vercel/` or `sdks/py/openai-agents/`
3. **Verify basic setup** - Can you run existing tests successfully?
4. **Isolate the issue** - Does it happen with all tests or just one?

## See Also

- [Adding SDKs Guide](../sdks/README.md) - Step-by-step SDK implementation
- [Test Utilities (JS)](../sdks/js/_test-utils/README.md) - Mock transport and fixtures
- [Test Utilities (Python)](../sdks/py/_test-utils/README.md) - Mock transport and fixtures
- [CLI Documentation](../shared/orchestration/README.md) - Running tests
- [Main Documentation](../CLAUDE.md) - Project overview
