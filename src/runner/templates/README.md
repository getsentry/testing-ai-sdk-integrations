# Test Templates

Base templates and framework-specific templates for generating test files using Nunjucks.

## Directory Structure

```
templates/
├── base.js.njk              # JavaScript base template
├── base.python.njk          # Python base template
├── llm/                     # LLM-only framework templates
│   ├── node/
│   │   ├── openai/
│   │   │   ├── template.njk
│   │   │   └── config.json
│   │   └── anthropic/
│   │       ├── template.njk
│   │       └── config.json
│   └── python/
│       ├── openai/
│       │   ├── template.njk
│       │   └── config.json
│       └── anthropic/
│           ├── template.njk
│           └── config.json
├── agents/                  # Agentic framework templates
│   ├── node/
│   │   ├── vercel/
│   │   │   ├── template.njk
│   │   │   └── config.json
│   │   ├── langgraph/
│   │   │   ├── template.njk
│   │   │   └── config.json
│   │   └── mastra/
│   │       ├── template.njk
│   │       └── config.json
│   ├── python/
│   │   ├── openai-agents/
│   │   │   ├── template.njk
│   │   │   └── config.json
│   │   ├── langgraph/
│   │   │   ├── template.njk
│   │   │   └── config.json
│   │   ├── pydantic-ai/
│   │   │   ├── template.njk
│   │   │   └── config.json
│   │   └── google-genai/
│   │       ├── template.njk
│   │       └── config.json
│   └── php/
│       └── laravel/
│           ├── config.json
│           ├── template.njk       # Artisan command
│           ├── agent.php.njk      # Agent class
│           └── tool.php.njk       # Tool class
└── mcp/                     # MCP server framework templates
    └── python/
        ├── fastmcp/         # FastMCP high-level SDK
        │   ├── template.njk
        │   └── config.json
        └── mcp/             # MCP Python SDK (highlevel + lowlevel via options)
            ├── template.njk
            └── config.json
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

- **LLM frameworks:** `llm/{node,python}/{framework}.njk`
- **Agent frameworks:** `agents/{node,python}/{framework}.njk`
- **MCP frameworks:** `mcp/{python}/{framework}.njk`

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

### Example: MCP Python Template

**File:** `mcp/python/mcp/template.njk`

The MCP template uses the generic **options** system to support two API styles (`highlevel` and `lowlevel`) from a single template. The `config.json` declares:

```json
{
  "options": {
    "apiStyle": ["highlevel", "lowlevel"]
  }
}
```

This expands the test matrix so each test runs with both `apiStyle=highlevel` and `apiStyle=lowlevel`. The resolved option value is available as a top-level template variable (`{{ apiStyle }}`).

The template conditionally renders different server setup code:
- **highlevel**: Uses `FastMCP` with decorator-based tool/resource/prompt registration
- **lowlevel**: Uses `Server` with manual handler registration (`@server.list_tools()`, `@server.call_tool()`, etc.)

Both styles use `ClientSession` from `mcp.client.session` with `anyio` memory streams for in-process communication (stdio mode) or `sse_client` for SSE transport.

### Template Context Variables

Framework templates receive:

- `testName` - Test case name
- `frameworkName` - Framework identifier
- `system` - System message (LLM tests only)
- `agent` - Agent config with tools (agent tests only)
- `mcpServer` - MCP server definition with tools, resources, prompts (MCP tests only)
- `input` / `inputs` - Test input(s) with model, prompt, action, etc.
- `input.model` - Model identifier
- `input.prompt` - User prompt
- `isStreaming` - Whether the test runs in streaming mode
- `isAsync` - Whether the test runs in async mode (Python)
- `isSse` - Whether the test uses SSE transport (MCP tests)
- Resolved options from `config.json` `options` field are spread as top-level variables (e.g., `apiStyle`)

### Creating Framework Templates

1. Determine framework type (LLM or agent)
2. Choose platform (node, python, browser, nextjs, or php)
3. Create framework directory: `{llm,agents,mcp}/{node,python,browser,nextjs,php}/{framework}/`
4. Create template file: `template.njk`
5. Create config file: `config.json`
6. Extend appropriate base template
7. Override blocks with framework-specific code

## Context Variables

All templates receive a context object with:

- `testName` - Name of the test
- `frameworkName` - Name of the framework being tested
- Additional variables can be passed as needed

## Generic Options System

Frameworks can declare `options` in their `config.json` to expand the test matrix with additional dimensions beyond the built-in ones (streaming/blocking, sync/async, transport mode).

```json
{
  "options": {
    "apiStyle": ["highlevel", "lowlevel"]
  }
}
```

- Each option key/value combination is expanded via cartesian product into the test matrix
- Resolved option values are passed as top-level Nunjucks template variables
- Filter from the CLI with `--option apiStyle=highlevel`
- Multiple options can be declared; they multiply the matrix accordingly

## Notes

- Templates use Nunjucks syntax (Jinja-like)
- Autoescape is disabled (we're generating code, not HTML)
- `trimBlocks` and `lstripBlocks` are enabled for cleaner output
- Comments use `{# comment #}` syntax
