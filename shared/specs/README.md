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
├── 2-simple-with-error/
│   └── ...
└── ...
```

## Current Test Cases

Test cases are identified by spec ID (e.g., "1-simple", "2-simple-with-error"). Each has:

- **JSON fixture(s)** in `shared/specs/{spec-id}/` defining expectations
- **JS implementation(s)** in `sdks/js/*/cases/`
- **Python implementation(s)** in `sdks/py/*/cases/`

### Implemented

- **1-simple**: Basic Completion - Single prompt with system message

### Planned

- **2-simple-with-error**: Basic completion with application error
- **3-multi-turn**: Multi-turn conversation
- **4-streaming**: Basic streaming
- **5-streaming-with-error**: Streaming with application error
- **6-agent-success**: Agentic workflow - success path
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

- **OpenAI SDK** (both JS and Python) - Direct `gen_ai.chat` spans only
- **Anthropic SDK** (both JS and Python) - Direct LLM call spans

**Span hierarchy example:**
```
gen_ai.chat (no parent)
```

### Using Fixture Variants

Each test case folder contains multiple fixture files to handle both framework types:

- `fixture-agentic.json` - Expects agent parent spans + LLM child spans
- `fixture-low-level.json` - Expects only direct LLM call spans

Test cases specify which variant to use via the `FRAMEWORK_TYPE` constant:

**JavaScript:**
```javascript
// At top of test file
const FRAMEWORK_TYPE = "agentic"; // or "low-level"

// Load fixture with variant
const fixture = loadFixture("1-simple", FRAMEWORK_TYPE);

// Validate with same variant
validateFixture("1-simple", spans, transactions, events, FRAMEWORK_TYPE);
```

**Python:**
```python
# At top of test file
FRAMEWORK_TYPE = "agentic"  # or "low-level"

# Load fixture with variant
fixture = load_fixture("1-simple", FRAMEWORK_TYPE)

# Validate with same variant
validate_fixture("1-simple", spans, transactions, events, FRAMEWORK_TYPE)
```

**Important:** Each SDK's test cases should all use the same `FRAMEWORK_TYPE` value. The framework type is determined by the SDK's architecture, not by individual test cases.

### SDK Framework Type Mapping

When adding a new SDK, determine its framework type first, then use the same type across all test cases for that SDK.

| SDK Path              | Framework Type | Reason                                      |
| --------------------- | -------------- | ------------------------------------------- |
| `js/vercel`           | `agentic`      | Produces `gen_ai.invoke_agent` parent spans |
| `py/openai-agents`    | `agentic`      | Produces agent workflow spans               |
| `js/openai` (future)  | `low-level`    | Direct `gen_ai.chat` spans only             |
| `py/openai` (future)  | `low-level`    | Direct LLM call spans only                  |
| `js/anthropic` (future) | `low-level`  | Direct LLM call spans only                  |
| `py/anthropic` (future) | `low-level`  | Direct LLM call spans only                  |

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
    "model": "gpt-4o-mini",
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
            "gen_ai.response.model": "gpt-4o-mini",
            "gen_ai.response.text": true,
            "gen_ai.usage.input_tokens": true
          }
        },
        {
          "id": "generate_text",
          "op": ["gen_ai.chat", "gen_ai.generate_text"],
          "parent": "invoke_agent",
          "required_attributes": {
            "gen_ai.request.model": "gpt-4o-mini"
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

- `events` (object):
  - `error_count` (number): Expected number of error events

### Key Features

- `op` can be string or array (matches any of the ops)
- `required_attributes` with `true` = just check presence
- `required_attributes` with value = check exact match
- `parent` = verifies span hierarchy
- `min_count` = minimum spans (allows extra spans from SDK)

## Writing New Specifications

1. **Create directory:** `mkdir shared/specs/{spec-id}`
2. **Write spec.md:** Human-readable specification
3. **Create fixture-agentic.json:** Expectations for agentic frameworks
4. **Create fixture-low-level.json:** Expectations for low-level frameworks (if applicable)
5. **Implement test cases:** Add to SDKs in `sdks/js/*/cases/` and `sdks/py/*/cases/`

## See Also

- [Adding SDKs](../../sdks/README.md) - How to implement test cases
- [Test Utilities](../test-utils/README.md) - Fixture validation system
- [Main Documentation](../../CLAUDE.md) - Project overview
