# Test Templates

Base templates and framework-specific templates for generating test files using Nunjucks.

## Directory Structure

```
templates/
├── base.js.njk              # JavaScript base template
├── base.python.njk          # Python base template
├── base.cloudflare.njk      # Cloudflare Workers base template
├── llm/                     # LLM-only framework templates
│   ├── node/
│   │   ├── openai/
│   │   │   ├── template.njk
│   │   │   └── config.json
│   │   └── anthropic/
│   │       ├── template.njk
│   │       └── config.json
│   ├── python/
│   │   ├── openai/
│   │   │   ├── template.njk
│   │   │   └── config.json
│   │   └── anthropic/
│   │       ├── template.njk
│   │       └── config.json
│   └── cloudflare/
│       ├── openai/
│       ├── anthropic/
│       └── google-genai/
├── embeddings/              # Embedding framework templates
│   ├── node/
│   ├── cloudflare/
│   │   ├── openai/
│   │   ├── google-genai/
│   │   └── vercel/
│   └── ...
└── agents/                  # Agentic framework templates
    ├── node/
    │   ├── vercel/
    │   │   ├── template.njk
    │   │   └── config.json
    │   ├── langgraph/
    │   │   ├── template.njk
    │   │   └── config.json
    │   └── mastra/
    │       ├── template.njk
    │       └── config.json
    ├── browser/
    │   └── langgraph/
    │       ├── template.njk
    │       └── config.json
    ├── python/
    │   ├── openai-agents/
    │   │   ├── template.njk
    │   │   └── config.json
    │   ├── langgraph/
    │   │   ├── template.njk
    │   │   └── config.json
    │   ├── pydantic-ai/
    │   │   ├── template.njk
    │   │   └── config.json
    │   └── google-genai/
    │       ├── template.njk
    │       └── config.json
    ├── cloudflare/
    │   └── vercel/
    │       ├── template.njk
    │       └── config.json
    └── php/
        └── laravel/
            ├── config.json
            ├── template.njk       # Artisan command
            ├── agent.php.njk      # Agent class
            └── tool.php.njk       # Tool class
```

## Base Templates

### `base.js.njk` - JavaScript Base Template

Provides a standard structure for JavaScript tests with the following blocks:

- **`imports`** - Import statements (includes `@sentry/node` by default)
- **`sdk_setup`** - Sentry SDK initialization
- **`setup`** - Code to run before the test (setup fixtures, clients, etc.)
- **`test`** - Main test logic (inside async `main()` function)
- **`teardown`** - Code to run after the test

### `base.python.njk` - Python Base Template

Provides a standard structure for Python tests with the following blocks:

- **`imports`** - Import statements (includes `sentry_sdk` by default)
- **`sdk_setup`** - Sentry SDK initialization
- **`setup`** - Code to run before the test (setup fixtures, clients, etc.)
- **`test`** - Main test logic (inside `main()` function)
- **`teardown`** - Code to run after the test

### `base.cloudflare.njk` - Cloudflare Workers Base Template

Provides a structure for Cloudflare Workers tests using `@sentry/cloudflare`:

- **`setup`** - Code before the handler (module-level declarations)
- **`sentry_integrations`** - Integrations added to the `withSentry()` config (e.g. `Sentry.vercelAIIntegration()`)
- **`dynamic_imports`** - Dynamic imports and client setup inside the fetch handler (e.g. `Sentry.instrumentOpenAiClient(client)`)
- **`test`** - Main test logic inside `Sentry.startSpan()` callback

Key differences from Node.js:
- Uses `Sentry.withSentry()` wrapper instead of `Sentry.init()`
- AI SDK clients are instrumented manually (e.g. `Sentry.instrumentOpenAiClient(client)`)
- API keys accessed via `env` parameter (from `.dev.vars`), not `process.env`

## Usage

### 1. Render Base Template

```typescript
const renderer = new TemplateRenderer();

const code = renderer.renderBase("js", {
  testName: "Basic LLM Test",
  frameworkName: "openai",
});
```

### 2. Extend with Custom Blocks

```typescript
const code = renderer.renderWithBlocks(
  "python",
  {
    testName: "OpenAI Chat Test",
    frameworkName: "openai",
  },
  {
    imports: "from openai import OpenAI",
    setup: "client = OpenAI()",
    test: `
    response = client.chat.completions.create(
        model="gpt-4",
        messages=[{"role": "user", "content": "Hello"}]
    )
    print(response.choices[0].message.content)
  `,
  },
);
```

## Block Inheritance

Blocks can use `{{ super() }}` to include the parent block's content:

```nunjucks
{% block imports %}
{{ super() }}  {# Includes base imports #}
from openai import OpenAI  {# Add custom import #}
{% endblock %}
```

## Framework Templates

Framework-specific templates extend base templates and implement SDK-specific code.

### Location

- **LLM frameworks:** `llm/{node,python,browser,nextjs,cloudflare}/{framework}/`
- **Agent frameworks:** `agents/{node,python,nextjs,cloudflare,php}/{framework}/`
- **Embedding frameworks:** `embeddings/{node,python,browser,nextjs,cloudflare,php}/{framework}/`

### Example: OpenAI Python LLM Template

**File:** `llm/python/openai/template.njk`

```nunjucks
{% extends "base.python.njk" %}

{% block imports %}
{{ super() }}
from openai import OpenAI
{% endblock %}

{% block setup %}
client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))
{% endblock %}

{% block test %}
response = client.chat.completions.create(
    model="{{ input.model }}",
    messages=[
        {"role": "system", "content": "{{ system }}"},
        {"role": "user", "content": "{{ input.prompt }}"}
    ]
)
print(response.choices[0].message.content)
{% endblock %}
```

### Example: OpenAI Agents Python Template

**File:** `agents/python/openai-agents/template.njk`

```nunjucks
{% extends "base.python.njk" %}

{% block imports %}
{{ super() }}
from openai import OpenAI
{% endblock %}

{% block setup %}
client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))

# Define tools
def {{ agent.tools[0].name }}():
    """{{ agent.tools[0].description }}"""
    return {{ agent.tools[0].result }}

tools = [
    {
        "type": "function",
        "function": {
            "name": "{{ agent.tools[0].name }}",
            "description": "{{ agent.tools[0].description }}",
            "parameters": {{ agent.tools[0].parameters | dump }}
        }
    }
]
{% endblock %}

{% block test %}
response = client.chat.completions.create(
    model="{{ input.model }}",
    messages=[{"role": "user", "content": "{{ input.prompt }}"}],
    tools=tools
)
print(response.choices[0].message.content)
{% endblock %}
```

### Template Context Variables

Framework templates receive:

- `testName` - Test case name
- `frameworkName` - Framework identifier
- `system` - System message (LLM tests only)
- `agent` - Agent config with tools (agent tests only)
- `input` - Test input with model, prompt, etc.
- `input.model` - Model identifier
- `input.prompt` - User prompt
- Any resolved option values as top-level variables (see Generic Options below)

### Generic Options

Frameworks can define `options` in their `config.json` to create additional test matrix dimensions:

```json
{
  "name": "my-framework",
  "options": {
    "apiStyle": ["highlevel", "lowlevel"]
  }
}
```

This doubles the test count — each test runs once per `apiStyle` value. Multiple options multiply further via cartesian product.

**How options flow:**

1. **Config**: `options` defines arrays of possible values per key
2. **Matrix expansion**: The orchestrator generates all combinations (cartesian product)
3. **Template variables**: Resolved values are available as top-level variables (e.g., `{{ apiStyle }}`)
4. **Filenames**: Option values are appended to test filenames (e.g., `test-basic-...-highlevel.py`)
5. **CLI filtering**: Use `--option key=value` (repeatable) to run only specific values

**Template usage example:**

```nunjucks
{% if apiStyle == "highlevel" %}
{# High-level API code #}
{% elif apiStyle == "lowlevel" %}
{# Low-level API code #}
{% endif %}
```

### Creating Framework Templates

1. Determine framework type (LLM or agent)
2. Choose platform (node, python, browser, nextjs, php, or cloudflare)
3. Create framework directory: `{llm,agents,embeddings}/{node,python,browser,nextjs,php,cloudflare}/{framework}/`
4. Create template file: `template.njk`
5. Create config file: `config.json`
6. Extend appropriate base template
7. Override blocks with framework-specific code

## Context Variables

All templates receive a context object with:

- `testName` - Name of the test
- `frameworkName` - Name of the framework being tested
- Additional variables can be passed as needed

## Notes

- Templates use Nunjucks syntax (Jinja-like)
- Autoescape is disabled (we're generating code, not HTML)
- `trimBlocks` and `lstripBlocks` are enabled for cleaner output
- Comments use `{# comment #}` syntax
