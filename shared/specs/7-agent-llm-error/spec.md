# A2: Agentic Workflow - Error During LLM Call

## Level & Category
- **Level**: 2 (Intermediate)
- **Category**: Agentic

## Description
Agentic workflow where application error occurs after a tool call. Tests that Sentry captures partial workflow execution plus the error with full context.

## Requirements
- Start agentic workflow with tools
- First tool call succeeds
- Application error after receiving tool result
- Verify Sentry captures partial workflow + error

## Tool Definitions
Same tools as A1 (add, multiply, divide, subtract).

## Example Implementation

### JavaScript
```javascript
// System message
"You are a helpful math assistant. Use the provided tools to perform calculations."

try {
  // Start calculation - first tool call succeeds
  const response = await llm.chat("Calculate 69 + 96", { tools });
  // Tool successfully returns 165

  // Throw error after receiving result
  throw new Error("Error processing calculation result");
} catch (error) {
  // Sentry should capture error with workflow context
}
```

### Python
```python
# System message
"You are a helpful math assistant. Use the provided tools to perform calculations."

try:
    # Start calculation - first tool call succeeds
    response = llm.chat("Calculate 69 + 96", tools=tools)
    # Tool successfully returns 165

    # Throw error after receiving result
    raise RuntimeError("Error processing calculation result")
except Exception as e:
    # Sentry should capture error with workflow context
    pass
```

## Expected Sentry Data

### Spans
- Span(s) for LLM API call(s) before error
- Span for successful tool execution (add)
- Spans should complete successfully before error
- All spans should be part of the errored transaction

### Events
- Transaction containing workflow spans (marked as errored)
- Error event with exception details
- Error should be linked to the transaction

### Metadata

**LLM Call Metadata:**
- **Model name**: The specific model used
- **Token counts**: Tokens for the call that completed
- **Messages**: Initial prompt
- **Tools available**: List of tool definitions
- **Provider**: AI provider name

**Tool Call Metadata:**
- **Tool name**: "add"
- **Tool arguments**: add(69, 96)
- **Tool result**: { result: 165 }

**Error Event Metadata:**
- **Exception type**: Error/RuntimeError
- **Exception message**: "Error processing calculation result"
- **Stack trace**: Full stack trace
- **Context**: Error occurred after tool call completed
- **Workflow state**: Which tools were called before error

### Success Criteria
- ✅ First tool call (add) completes successfully
- ✅ Tool execution span is captured with all metadata
- ✅ LLM interaction span is captured
- ✅ Error event is captured
- ✅ Error is properly linked to transaction
- ✅ Partial workflow state is preserved in Sentry
- ✅ Stack trace shows error location
- ✅ Clear indication that workflow was interrupted
