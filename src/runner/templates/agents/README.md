# Agent Framework Templates

Templates for frameworks that support agentic workflows with tool calling.

## Compatible Frameworks

| Platform   | Framework     | Directory               | Status  |
| ---------- | ------------- | ----------------------- | ------- |
| JavaScript | Vercel AI SDK | `node/vercel/`          | ✅ Done |
| JavaScript | LangGraph     | `node/langgraph/`       | ✅ Done |
| JavaScript | Mastra        | `node/mastra/`          | ✅ Done |
| Python     | OpenAI Agents | `python/openai-agents/` | ✅ Done |
| Python     | LangGraph     | `python/langgraph/`     | ✅ Done |
| Python     | PydanticAI    | `python/pydantic-ai/`   | ✅ Done |
| Python     | Google GenAI  | `python/google-genai/`  | ✅ Done |
| PHP        | Laravel AI    | `php/laravel/`          | ✅ Done |

## Test Compatibility

Agent templates should implement tests that have:

- `agent` property (agent configuration with tools)
- `agent.name` property (agent name)
- `agent.description` property (agent description)
- `agent.tools` array (tool definitions)
- `input.model` property (model identifier)
- `input.prompt` property (user prompt)

Example test from `test-cases/agents/basic.ts`:

```typescript
{
  agent: {
    name: 'math_assistant',
    description: 'A math assistant',
    tools: [
      {
        name: 'add',
        description: 'Add two numbers',
        parameters: { /* JSON Schema */ },
        result: 11,  // Static result
      }
    ]
  },
  input: {
    model: 'gpt-4o',
    prompt: 'What is 4 + 7? Use the add tool.',
  }
}
```

## Template Requirements

Each agent template must:

1. **Extend base template**

   ```nunjucks
   {% extends "base.{node,python}.njk" %}
   ```

2. **Import SDK**

   ```nunjucks
   {% block imports %}
   {{ super() }}
   from framework import Agent, Tool
   {% endblock %}
   ```

3. **Define tools**

   ```nunjucks
   {% block setup %}
   {% for tool in agent.tools %}
   def {{ tool.name }}():
       """{{ tool.description }}"""
       {% if tool.result %}
       return {{ tool.result }}
       {% elif tool.error %}
       raise Exception("{{ tool.error }}")
       {% endif %}
   {% endfor %}

   agent = Agent(
       name="{{ agent.name }}",
       tools=[{{ agent.tools | map(attribute='name') | join(', ') }}]
   )
   {% endblock %}
   ```

4. **Run agent**
   ```nunjucks
   {% block test %}
   result = agent.run("{{ input.prompt }}")
   print(result)
   {% endblock %}
   ```

## Tool Definition Format

Tools in test definitions have:

```typescript
{
  name: 'function_name',
  description: 'What the function does',
  parameters: { /* JSON Schema */ },
  result?: any,          // Static return value
  error?: string,        // OR error to raise
}
```

Templates should generate tool implementations that:

- Return `result` if specified
- Raise error with `error` message if specified
- Match the parameter schema

## Notes

- Use `{{ agent.name }}` for agent name
- Use `{{ agent.description }}` for agent description
- Loop through `{{ agent.tools }}` to define tools
- Use `{{ input.model }}` for model
- Use `{{ input.prompt }}` for user prompt
- Tool results are static (no real computation)
