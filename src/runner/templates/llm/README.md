# LLM Framework Templates

Templates for frameworks that support direct LLM calls (no agent wrapper).

## Compatible Frameworks

| Platform | Framework | Directory | Status |
|----------|-----------|-----------|--------|
| JavaScript | OpenAI SDK | `js/openai/` | 🚧 TODO |
| JavaScript | Anthropic SDK | `js/anthropic/` | 🚧 TODO |
| JavaScript | Google GenAI | `js/google-genai/` | 🚧 TODO |
| Python | OpenAI SDK | `py/openai/` | ✅ Done |
| Python | Anthropic SDK | `py/anthropic/` | 🚧 TODO |
| Python | Google GenAI | `py/google-genai/` | 🚧 TODO |
| Python | LiteLLM | `py/litellm/` | 🚧 TODO |

## Test Compatibility

LLM templates should implement tests that have:
- `system` property (system message)
- `input.model` property (model identifier)
- `input.prompt` property (user prompt)

Example test from `test-cases/llm/basic.ts`:
```typescript
{
  system: 'You are a helpful assistant.',
  input: {
    model: 'gpt-4o',
    prompt: 'What is the capital of France?',
  }
}
```

## Template Requirements

Each LLM template must:

1. **Extend base template**
   ```nunjucks
   {% extends "base.{js,py}.njk" %}
   ```

2. **Import SDK**
   ```nunjucks
   {% block imports %}
   {{ super() }}
   from framework import Client
   {% endblock %}
   ```

3. **Initialize client**
   ```nunjucks
   {% block setup %}
   client = Client(api_key=os.environ.get("FRAMEWORK_API_KEY"))
   {% endblock %}
   ```

4. **Call LLM**
   ```nunjucks
   {% block test %}
   response = client.chat.create(
       model="{{ input.model }}",
       messages=[
           {"role": "system", "content": "{{ system }}"},
           {"role": "user", "content": "{{ input.prompt }}"}
       ]
   )
   print(response.content)
   {% endblock %}
   ```

## Notes

- Use `{{ system }}` for system message
- Use `{{ input.model }}` for model
- Use `{{ input.prompt }}` for user prompt
- Framework-specific parameters can be added as needed
