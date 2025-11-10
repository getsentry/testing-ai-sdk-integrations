# Test Orchestration & CLI

This directory contains the CLI tool that discovers and runs all SDK test cases.

## Overview

The orchestration system provides a unified CLI for running tests across all SDKs (JavaScript and Python). It handles:

- **Test discovery** - Automatically finds all SDKs and test cases
- **Lifecycle hooks** - Runs setup/teardown functions before/after tests
- **Cross-language support** - Executes both JavaScript and Python tests
- **Filtering** - Run specific SDKs, test cases, or everything
- **Result reporting** - Clear pass/fail output with timing

## CLI Commands

### Installation

```bash
cd shared/orchestration
npm install
npm run build
```

### Available Commands

#### `list` - Show all available tests

```bash
npm run cli list
```

**Output:**
```
📋 Available SDKs and Test Cases

js/vercel ✓
  • 1-simple

py/openai-agents ✓
  • 1-simple

Total: 2 SDKs, 2 test cases
✓ = has setup.js/setup.py file
```

#### `run` - Execute tests

**Run all tests:**
```bash
npm run cli run -- --all
```

**Run all JavaScript SDKs:**
```bash
npm run cli run -- --sdk js
```

**Run all Python SDKs:**
```bash
npm run cli run -- --sdk py
```

**Run specific SDK:**
```bash
npm run cli run -- --sdk js/vercel
npm run cli run -- --sdk py/openai-agents
```

**Run specific test case across all SDKs:**
```bash
npm run cli run -- --case 1-simple
```

**Run specific test case for all JavaScript SDKs:**
```bash
npm run cli run -- --sdk js --case 1-simple
```

**Run specific test case for specific SDK:**
```bash
npm run cli run -- --sdk js/vercel --case 1-simple
```

**Available options:**
- `--all` - Run all tests
- `--sdk <path>` - Run specific SDK or all SDKs in a language
  - `js` - All JavaScript SDKs
  - `py` - All Python SDKs
  - `js/openai` - Specific SDK
- `--case <id>` - Run specific test case (e.g., 1-simple)

**Note:** `--sdk` can target a language (js/py) or a specific SDK (js/openai).

**Output example:**
```
🧪 Running Sentry AI SDK Tests

Running 1 test case(s) across 1 SDK(s)

js/vercel (1-simple)

🔧 Setting up Vercel AI tests...
  ✓ Sentry initialized with mock transport
  ↻ Resetting test state...
    Running 1-simple: Basic Completion
    ✓ 1-simple completed
  ✓ Cleaning up...
🧹 Tearing down Vercel AI SDK tests...

📊 Test Results

js/vercel
  ✓ 1-simple (1250ms)

Summary:
  1 passed, 0 failed, 1 total
  Time: 1.25s

✓ All tests passed!
```

## Test Discovery

The CLI automatically discovers tests by scanning for files in the SDK directory structure:

### Discovery Pattern

```
sdks/
├── js/
│   └── {sdk-name}/
│       ├── setup.js          ← Lifecycle hooks (discovered)
│       └── cases/
│           ├── 1-simple.js   ← Test case (discovered)
│           └── 2-*.js        ← More test cases (discovered)
└── py/
    └── {sdk-name}/
        ├── setup.py          ← Lifecycle hooks (discovered)
        └── cases/
            ├── 1-simple.py   ← Test case (discovered)
            └── 2-*.py        ← More test cases (discovered)
```

### What Gets Discovered

**SDKs:**
- Any directory under `sdks/js/` or `sdks/py/` that contains a `cases/` subdirectory
- SDK path format: `{language}/{sdk-name}` (e.g., `js/vercel`, `py/openai-agents`)

**Test Cases:**
- Any `.js`, `.ts`, or `.py` file inside an SDK's `cases/` directory
- Test case ID is the filename without extension (e.g., `1-simple.js` → `1-simple`)
- Test cases are sorted alphabetically

**Setup Files:**
- `setup.js`, `setup.ts`, or `setup.py` in the SDK's root directory
- Contains lifecycle hooks: `beforeAll`, `beforeEach`, `afterEach`, `afterAll`

## Test Execution Flow

### Lifecycle Sequence

For each SDK with test cases:

```
1. beforeAll()       ← Initialize Sentry, load config (once per SDK)
2. For each test case:
   a. beforeEach()   ← Reset mock transport (before each test)
   b. RUN TEST       ← Execute test case function
   c. afterEach()    ← Clean up (after each test)
3. afterAll()        ← Teardown Sentry (once per SDK)
```

### JavaScript Test Execution

JavaScript/TypeScript tests are imported and executed directly:

```javascript
// Test case file: sdks/js/vercel/cases/1-simple.js
module.exports = async function () {
  // Test implementation
  console.log("Running test...");
  await Sentry.startSpan({ name: "test", op: "test" }, async () => {
    // ... test logic
  });
  await Sentry.flush(2000);
  // ... assertions
};
```

**Execution:**
1. CLI imports the test file as a module
2. Calls the exported function
3. Waits for completion (supports async/await)
4. Catches any thrown errors

### Python Test Execution

Python tests require a wrapper script because the orchestration CLI is TypeScript:

**Architecture:**
```
TypeScript CLI (orchestration)
    ↓ spawns subprocess
Python Test Runner (python-test-runner.py)
    ↓ imports and runs
Test Case (1-simple.py)
```

**Why the wrapper is needed:**
- TypeScript CLI can't import Python modules directly
- Setup hooks must run in the same Python process as the test
- Sentry SDK state (mock transport) must be shared

**Python test structure:**
```python
# Test case file: sdks/py/openai-agents/cases/1-simple.py

async def main():
    """Entry point - runs test logic only"""
    print("Running test...")
    # ... test implementation

async def assert_sentry():
    """Validation - checks Sentry captured data"""
    # ... assertions
```

**Python test runner workflow:**
1. CLI spawns `python-test-runner.py` subprocess
2. Runner imports SDK's `setup.py` module
3. Runner calls `setup.before_all()`
4. Runner calls `setup.before_each()`
5. Runner imports test module and calls `main()`
6. Runner calls `sentry_sdk.flush()` to capture events
7. Runner calls test module's `assert_sentry()` for validation
8. Runner calls `setup.after_each()`
9. Runner calls `setup.after_all()`

**Important:** Python test cases must have both `main()` and `assert_sentry()` functions. The orchestrator handles the timing of when each is called.

## Virtual Environment Detection

For Python SDKs, the orchestrator automatically detects and uses the correct Python interpreter:

```python
# Check for SDK's .venv
sdkDir/.venv/bin/python  ← Uses this if exists
python3                   ← Falls back to system Python
```

**Best practice:** Always create a `.venv` in each Python SDK directory to ensure correct dependencies.

## Error Handling

### Test Failures

When a test fails:
- Error message and stack trace are captured
- Remaining tests in the SDK continue running
- Final exit code is non-zero (for CI/CD)

**Example output:**
```
📊 Test Results

js/vercel
  ✗ 1-simple (850ms)
    Fixture validation failed:
    - Expected span with op "gen_ai.invoke_agent" not found

Summary:
  0 passed, 1 failed, 1 total
  Time: 0.85s

✗ Some tests failed
```

### Lifecycle Hook Failures

If `beforeAll` or `afterAll` fails:
- Error is logged
- All tests for that SDK are marked as failed

If `beforeEach` or `afterEach` fails:
- Specific test case is marked as failed
- `afterEach` runs even if test or `beforeEach` failed

## Project Structure

```
shared/orchestration/
├── src/
│   ├── cli.ts           # Main CLI entry point, commander setup
│   ├── discovery.ts     # Test discovery logic
│   ├── runner.ts        # Test execution engine
│   └── types.ts         # TypeScript type definitions
├── python-test-runner.py # Python test wrapper script
├── package.json         # CLI dependencies
├── tsconfig.json        # TypeScript configuration
└── README.md           # This file
```

## Adding New Commands

To add a new CLI command, edit `src/cli.ts`:

```typescript
program
  .command('your-command')
  .description('What it does')
  .option('-o, --option <value>', 'Option description')
  .action(async (options) => {
    // Implementation
  });
```

## Debugging Test Execution

### Enable Verbose Output

Tests log their own output via `console.log`. Both stdout and stderr are inherited from the orchestrator.

**JavaScript tests:**
```javascript
console.log("Debug: checking spans...");
```

**Python tests:**
```python
print("Debug: checking spans...")
```

### Common Issues

**Issue: "No SDKs found"**
- Check directory structure matches `sdks/{js|py}/{sdk-name}/cases/`
- Ensure test files have `.js`, `.ts`, or `.py` extensions

**Issue: "Mock transport not initialized" (Python)**
- Ensure `sys.path.insert(0, str(shared_path))` is in `setup.py`
- Check that `create_mock_transport()` is called before `sentry_sdk.init()`

**Issue: "Test case does not export a default function" (JavaScript)**
- Ensure test file uses `module.exports = async function () { ... }`
- Don't use named exports or ES6 `export default`

**Issue: Python test can't find dependencies**
- Create `.venv` in SDK directory: `python3 -m venv .venv`
- Install requirements: `source .venv/bin/activate && pip install -r requirements.txt`

**Issue: Test passes but no Sentry data captured**
- JavaScript: Check `await Sentry.flush(2000)` is called before assertions
- Python: Runner handles flushing automatically between `main()` and `assert_sentry()`

## Architecture Notes

### Why TypeScript for Orchestration?

The orchestration CLI uses TypeScript (not Python) for several reasons:

1. **Cross-language** - Can spawn both Node.js and Python subprocesses
2. **Modern CLI tools** - Commander.js, Chalk for great UX
3. **Type safety** - Catches errors early
4. **Separation of concerns** - Orchestrator is separate from test code

### Why ES Modules for Orchestration?

The orchestration code uses ES modules (`import`/`export`) while SDK tests use CommonJS:

- **Orchestration** (`shared/orchestration/`): ES modules for modern Node.js features
- **SDK tests** (`sdks/js/*/`): CommonJS for simplicity and compatibility

This is intentional and prevents module system confusion.

### Test Isolation

Each test case should be independent:
- `beforeEach` resets state (clears mock transport)
- Tests should not depend on execution order
- Tests should not share mutable state

## See Also

- [Adding SDKs](../../sdks/README.md) - How to implement test cases
- [Test Specifications](../specs/README.md) - Fixture format
- [Test Utilities](../test-utils/README.md) - Mock transport & validation
- [Troubleshooting](../../docs/TROUBLESHOOTING.md) - Common pitfalls
- [Main Documentation](../../CLAUDE.md) - Project overview
