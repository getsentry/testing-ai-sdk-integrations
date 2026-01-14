# Test Specifications & Fixtures

This directory contains test specifications and fixture expectations for all test scenarios.

## Directory Structure

Each test specification has its own directory:

```
shared/specs/
├── 1-simple/
│   ├── spec.md                    # Human-readable specification
│   ├── fixture-agentic.json       # Expectations for agentic frameworks
│   └── fixture-low-level.json     # Expectations for low-level frameworks
├── 2-multi-step/
│   └── ...
└── ...
```

## Current Test Cases

Test cases are identified by spec ID (e.g., "1-simple", "2-multi-step"). Each has:

- **JSON fixture(s)** in `shared/specs/{spec-id}/` defining expectations
- **JS implementation(s)** in `sdks/js/*/cases/`
- **Python implementation(s)** in `sdks/py/*/cases/`

### Implemented

- **1-simple**: Basic Completion - Single prompt with system message
- **2-multi-step**: Multi-step conversation - Two API calls with conversation history

### Planned

- **3-agent-success**: Agentic workflow - success path
- **4-simple-with-error**: Basic completion with application error
- **5-streaming**: Basic streaming
- **6-streaming-with-error**: Streaming with application error
- **7-agent-llm-error**: Agentic workflow - error during LLM call
- **8-agent-tool-error**: Agentic workflow - error during tool execution

## Sentry Features to Verify

Each test must verify that Sentry captures:

1. **Performance tracing** - Spans and transactions with proper timing
2. **AI monitoring data** - Model name, token counts, prompts, completions
3. **Error tracking** - Exceptions with context and stack traces (for error tests)

## Framework Types & Fixture Variants

AI SDKs fall into two categories based on the span hierarchy they produce.

### Agentic Frameworks

Frameworks that wrap LLM calls in agent abstraction spans:

- **Vercel AI SDK** (`js/vercel`) - Produces `gen_ai.invoke_agent` parent spans
- **OpenAI Agents SDK** (`py/openai-agents`) - Produces agent workflow spans

**Span hierarchy example:**

```
gen_ai.invoke_agent (parent)
  └─ gen_ai.chat or gen_ai.generate_text (child)
```

### Low-Level Frameworks

Frameworks that directly produce LLM call spans without agent wrappers:

- **OpenAI SDK** (`js/openai`) - Direct `gen_ai.chat` spans only
- **Anthropic SDK** (`js/anthropic`) - Direct LLM call spans
- **Google GenAI SDK** (`py/google-genai`) - Direct LLM call spans

**Span hierarchy example:**

```
gen_ai.chat (no parent)
```

### Using Fixture Variants

Each test case folder contains multiple fixture files to handle both framework types:

- `fixture-agentic.json` - Expects agent parent spans + LLM child spans
- `fixture-low-level.json` - Expects only direct LLM call spans

Framework type is configured per SDK in `config.json`, not in individual test files:

**SDK Config (config.json):**

```json
{
  "sdk_name": "vercel",
  "framework_type": "agentic",
  "overrides": {}
}
```

**JavaScript Test Case:**

```javascript
const { runTestCase } = require("../../_test-utils/test-runner.cjs");
const { Sentry } = require("../setup");

async function testLogic(inputs) {
  // Your test logic
}

// Framework type loaded from config.json automatically
module.exports = runTestCase("1-simple", testLogic, Sentry);
```

**Python Test Case:**

```python
from test_runner import run_test_case

async def test_logic(inputs):
    # Your test logic
    pass

# Framework type loaded from config.json automatically
test_case = run_test_case("1-simple", test_logic)
main = test_case["main"]
assert_sentry = test_case["assert_sentry"]
```

**Important:** Each SDK's `config.json` defines its framework type. All test cases in that SDK use the same framework type automatically.

### SDK Framework Type Mapping

When adding a new SDK, determine its framework type first, then use the same type across all test cases for that SDK.

| SDK Path           | Framework Type | Reason                                      |
| ------------------ | -------------- | ------------------------------------------- |
| `js/vercel`        | `agentic`      | Produces `gen_ai.invoke_agent` parent spans |
| `js/openai`        | `low-level`    | Direct `gen_ai.chat` spans only             |
| `js/anthropic`     | `low-level`    | Direct LLM call spans only                  |
| `py/openai-agents` | `agentic`      | Produces agent workflow spans               |
| `py/google-genai`  | `low-level`    | Direct LLM call spans only                  |

**How to determine framework type for a new SDK:**

1. Run a simple test case with the SDK
2. Examine the captured spans
3. If you see agent/workflow wrapper spans → `agentic`
4. If you only see direct LLM call spans → `low-level`

## Fixture Format

Fixtures define expected spans, transactions, and events in a language-agnostic JSON format.

### Example Fixture

```json
{
  "spec_id": "1-simple",
  "name": "Basic Completion",
  "inputs": {
    "model": "gpt-5-nano",
    "system": "You are a helpful math assistant.",
    "prompt": "What is 69 + 96?"
  },
  "expectations": {
    "spans": {
      "min_count": 3,
      "items": [
        {
          "id": "invoke_agent",
          "op": "gen_ai.invoke_agent",
          "required_attributes": {
            "gen_ai.response.model": "gpt-5-nano",
            "gen_ai.response.text": true,
            "gen_ai.usage.input_tokens": true
          }
        },
        {
          "id": "generate_text",
          "op": ["gen_ai.chat", "gen_ai.generate_text"],
          "parent": "invoke_agent",
          "required_attributes": {
            "gen_ai.request.model": "gpt-5-nano"
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

### Fixture Format Specification

**Top-level fields:**

- `spec_id` (string): Unique identifier matching directory name
- `name` (string): Human-readable test name
- `description` (string, optional): Detailed description
- `inputs` (object): Test inputs (model, system message, prompt, etc.)
- `expectations` (object): What to verify in captured Sentry data

**Expectations structure:**

- `spans` (object):

  - `min_count` (number): Minimum number of spans expected
  - `items` (array): Specific spans to verify

- `spans.items[]` (object):

  - `id` (string): Unique identifier for this span (used for parent references)
  - `op` (string | string[]): Operation name(s) to match
  - `parent` (string, optional): ID of parent span (verifies hierarchy)
  - `required_attributes` (object, optional): Attributes to verify

- `required_attributes` format:

  - `"attribute.name": true` - Check presence only
  - `"attribute.name": "value"` - Check exact match
  - `"attribute.name": "pattern*"` - Wildcard pattern matching (see below)

- `events` (object):
  - `error_count` (number): Expected number of error events

### Key Features

- `op` can be string or array (matches any of the ops)
- `required_attributes` with `true` = just check presence
- `required_attributes` with value = check exact match or wildcard pattern
- `parent` = verifies span hierarchy
- `min_count` = minimum spans (allows extra spans from SDK)

### Wildcard Pattern Matching

Fixture attribute values support wildcard patterns using `*` for flexible matching:

**Pattern Types:**

| Pattern   | Description | Example        | Matches                       |
| --------- | ----------- | -------------- | ----------------------------- |
| `"foo*"`  | Starts with | `"gpt-*"`      | `gpt-5-nano`, `gpt-5-nano`    |
| `"*foo"`  | Ends with   | `"*-mini"`     | `gpt-5-nano`, `claude-3-mini` |
| `"*foo*"` | Contains    | `"*4o*"`       | `gpt-5-nano`, `gpt-5-nano`    |
| `"foo"`   | Exact match | `"gpt-5-nano"` | `gpt-5-nano` only             |

**Use Cases:**

- **Model versions**: `"gen_ai.request.model": "gpt-4*"` matches any GPT-4 variant
- **Flexible IDs**: `"span_id": "*"` would match any non-empty span ID (but prefer `true` for presence)
- **URL patterns**: `"http.url": "https://api.openai.com/*"` matches any OpenAI API endpoint
- **Token ranges**: Not supported - use `true` for presence checking instead

**Examples:**

```json
{
  "required_attributes": {
    "gen_ai.request.model": "gpt-*", // Matches gpt-5-nano, gpt-5-nano, etc.
    "gen_ai.response.model": "gemini-*", // Matches gemini-2.5-flash-lite, gemini-1.5-pro
    "gen_ai.provider": "*anthropic*", // Matches "anthropic", "anthropic-vertex", etc.
    "http.url": "https://api.openai.com/*", // Matches any OpenAI API URL
    "gen_ai.response.text": true // Just check presence (no pattern needed)
  }
}
```

**Important Notes:**

- Wildcards work on string values only (not numbers or booleans)
- Empty wildcards (`"*"`, `"**"`) are invalid and will not match anything
- For presence-only checks, use `true` instead of wildcards
- Patterns are case-sensitive

### Pattern-Based Op Matching

For complex op matching scenarios, use pattern objects with exclusions:

```json
{
  "id": "llm_call",
  "op": {
    "pattern": "gen_ai.*",
    "not": ["gen_ai.invoke_agent", "gen_ai.execute_tool"]
  },
  "required_attributes": { ... }
}
```

This matches any span with op starting with `gen_ai.` EXCEPT `gen_ai.invoke_agent` and `gen_ai.execute_tool`.

**Supported op formats:**

- `"op": "gen_ai.chat"` - Single string (exact match)
- `"op": ["gen_ai.chat", "gen_ai.messages"]` - Array (OR matching)
- `"op": { "pattern": "gen_ai.*", "not": [...] }` - Pattern with exclusions

### Schema Validation for Complex Attributes

For attributes with structured data (like `gen_ai.request.messages`), use schema objects:

```json
{
  "required_attributes": {
    "gen_ai.request.messages": {
      "type": "json_array",
      "min_length": 2,
      "items_have": ["role", "content"]
    }
  }
}
```

**Supported schema types:**

**`json_array`** - Validates stringified JSON arrays or array objects

- `length: N` - Exact array length
- `min_length: N` - Minimum array length
- `max_length: N` - Maximum array length
- `items_have: ["prop1", "prop2"]` - All items must contain these properties

**`plain_string`** - Validates plain strings (NOT stringified JSON)

- `min_length: N` - Minimum string length
- `max_length: N` - Maximum string length
- `pattern: "value*"` - Wildcard pattern matching

**Example use cases:**

```json
{
  "gen_ai.request.messages": {
    "type": "json_array",
    "length": 2,
    "items_have": ["role", "content"]
  },
  "gen_ai.response.text": {
    "type": "plain_string",
    "min_length": 1,
    "pattern": "*hello world*"
  }
}
```

### Shared Span Definitions

To eliminate duplication, common span definitions are stored in `shared/specs/common-spans.json` and can be referenced using `$ref`:

**common-spans.json:**
```json
{
  "llm_call": {
    "id": "llm_call",
    "op": { "pattern": "gen_ai.*", "not": [...] },
    "required_attributes": { ... }
  },
  "invoke_agent": { ... }
}
```

**Using $ref in fixtures:**
```json
{
  "expectations": {
    "spans": {
      "items": [
        { "$ref": "common-spans#/llm_call" },
        { "$ref": "common-spans#/llm_call", "parent": "agent" }
      ]
    }
  }
}
```

**Benefits:**
- Single source of truth for span definitions
- Properties in fixture override referenced span properties
- Reduces fixture size by ~50%

### Order-Based Span Matching

When multiple spans have the same op, they're matched in the order they appear in the fixture:

```json
{
  "items": [
    { "$ref": "common-spans#/llm_call", "id": "first_call" },
    { "$ref": "common-spans#/llm_call", "id": "second_call" }
  ]
}
```

First `llm_call` in fixture → first matching span
Second `llm_call` in fixture → second matching span (first excluded)

**No occurrence field needed** - just list spans in expected order.

## Writing New Specifications

1. **Create directory:** `mkdir shared/specs/{spec-id}`
2. **Write spec.md:** Human-readable specification
3. **Create fixture-agentic.json:** Expectations for agentic frameworks
4. **Create fixture-low-level.json:** Expectations for low-level frameworks (if applicable)
5. **Implement test cases:** Add to SDKs in `sdks/js/*/cases/` and `sdks/py/*/cases/`

## See Also

- [Adding SDKs](../../sdks/README.md) - How to implement test cases
- [Test Utilities (JS)](../../sdks/js/_test-utils/README.md) - Fixture validation system
- [Test Utilities (Python)](../../sdks/py/_test-utils/README.md) - Fixture validation system
- [Main Documentation](../../CLAUDE.md) - Project overview
