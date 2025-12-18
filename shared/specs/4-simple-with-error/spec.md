# 4-simple-with-error: Basic Completion with Application Error

## Level & Category
- **Level**: 1 (Basic)
- **Category**: Generation

## Description
Application code throws an error after receiving LLM response. Tests that Sentry captures both the successful LLM interaction and the application error with proper context.

## Requirements
- Start an LLM call (same as G1)
- Throw an exception in application code after receiving response
- Verify Sentry captures both the LLM interaction and the error

## Example Implementation

### JavaScript
```javascript
// System message
"You are a helpful math assistant."

try {
  const response = await llm.chat("What is 69 + 96?");
  // Intentionally throw error after receiving response
  throw new Error("Application error during processing");
} catch (error) {
  // Sentry should capture this error
}
```

### Python
```python
# System message
"You are a helpful math assistant."

try:
    response = llm.chat("What is 69 + 96?")
    # Intentionally throw error after receiving response
    raise ValueError("Application error during processing")
except Exception as e:
    # Sentry should capture this error
    pass
```

## Expected Sentry Data

### Spans
- One span for the LLM API call
- Span should complete successfully before error occurs
- Span should be part of the errored transaction

### Events
- Transaction containing the LLM span (marked as errored)
- Error event with exception details
- Error should be linked to the transaction

### Metadata

**LLM Span Metadata:**
- **Model name**: The specific model used
- **Token counts**: Input, output, and total tokens
- **Messages**: System message, user message, and assistant response
- **Provider**: AI provider name

**Error Event Metadata:**
- **Exception type**: Error/ValueError
- **Exception message**: "Application error during processing"
- **Stack trace**: Full stack trace showing where error occurred
- **Context**: Error occurred after LLM call completed

### Success Criteria
- ✅ LLM call completes successfully
- ✅ LLM span is captured with all metadata
- ✅ Error event is captured
- ✅ Error is properly linked to transaction containing LLM span
- ✅ Stack trace shows error location
- ✅ Both LLM data and error data are present in Sentry
