# Testing Guide

## Testing Template Rendering

To test framework template rendering without running the full orchestrator:

```bash
npm run test-templates
```

This will:

1. Render both OpenAI SDK (LLM) and OpenAI Agents (agentic) templates
2. Show the rendered Python code
3. Save output files for inspection
4. Display framework configurations
5. Calculate test matrix combinations

**Output files:**

- `test-output-openai-llm.py` - Rendered LLM test
- `test-output-openai-agents.py` - Rendered agent test

**Cleanup:**

```bash
rm test-output-*.py
```

## Manual Template Testing

You can also test templates programmatically:

```javascript
import { TemplateRenderer } from "./dist/runner/template-renderer.js";

const renderer = new TemplateRenderer();

// Render a template directly
const code = renderer.render("llm/python/openai/template.njk", {
  testName: "My Test",
  frameworkName: "openai",
  system: "You are a helpful assistant.",
  input: {
    model: "gpt-4o",
    prompt: "Hello!",
  },
});

// Or use the helper method
const code2 = renderer.renderFramework("llm", "python", "openai", {
  testName: "My Test",
  frameworkName: "openai",
  system: "You are a helpful assistant.",
  input: {
    model: "gpt-4o",
    prompt: "Hello!",
  },
});

console.log(code);
```

## Validating Python Syntax

Generated Python files can be validated:

```bash
python3 -m py_compile test-output-openai-llm.py
```

## Test Matrix

Framework configurations define test matrices:

```json
{
  "versions": ["1.57.0", "1.58.1"],
  "sentryVersions": ["2.19.2", "latest"]
}
```

This generates 4 test combinations (2 × 2):

- openai 1.57.0 + sentry-sdk 2.19.2
- openai 1.57.0 + sentry-sdk latest
- openai 1.58.1 + sentry-sdk 2.19.2
- openai 1.58.1 + sentry-sdk latest

## Framework Configuration

Each framework has its own directory with two files:

- `template.njk` - Nunjucks template
- `config.json` - Framework configuration

Example:

- `src/runner/templates/llm/python/openai/template.njk`
- `src/runner/templates/llm/python/openai/config.json`

Schema:

```typescript
{
  name: string;              // Framework identifier
  displayName: string;       // Human-readable name
  type: 'llm-only' | 'agentic';
  platform: 'node' | 'python' | 'browser';
  dependencies: Array<{
    package: string;
    version: string;         // "framework" | "latest" | specific version
  }>;
  versions: string[];        // Framework versions to test
  sentryVersions: string[];  // Sentry SDK versions
  matrix?: {                 // Optional additional axes
    modelProviders?: string[];
    [key: string]: string[];
  };
}
```

## Adding New Framework Templates

1. Create framework directory: `src/runner/templates/{llm,agents}/{node,python,browser}/{framework}/`
2. Create template file: `template.njk`
3. Create config file: `config.json`
4. Rebuild: `npm run build`
5. Test: `npm run test-templates`

Example for a new framework called "my-sdk":

```bash
mkdir -p src/runner/templates/llm/python/my-sdk
touch src/runner/templates/llm/python/my-sdk/template.njk
touch src/runner/templates/llm/python/my-sdk/config.json
```

See template documentation in `src/runner/templates/README.md`.
