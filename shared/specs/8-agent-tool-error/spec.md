# A3: Agentic Workflow - Error During Tool Execution

## Level & Category
- **Level**: 2 (Intermediate)
- **Category**: Agentic

## Description
Tool/function execution throws an error (division by zero). Tests that Sentry captures errors that occur within tool execution with full context.

## Requirements
- LLM calls divide tool
- Tool throws division by zero error
- Workflow handles or propagates error
- Verify Sentry captures tool error with context

## Tool Definitions
Same tools as A1 (add, multiply, divide, subtract). The divide tool includes error handling for division by zero.

## Example Implementation

### JavaScript
```javascript
// System message
"You are a helpful math assistant. Use the provided tools to perform calculations."

// Prompt that triggers division by zero
"Calculate 165 divided by 0"
// Note: 165 is the sum of 69 + 96

// Expected flow:
// 1. LLM calls divide(165, 0)
// 2. Tool throws: Error("Division by zero")
// 3. Sentry captures the tool error with full context
```

### Python
```python
# System message
"You are a helpful math assistant. Use the provided tools to perform calculations."

# Prompt that triggers division by zero
"Calculate 165 divided by 0"
# Note: 165 is the sum of 69 + 96

# Expected flow:
# 1. LLM calls divide(165, 0)
# 2. Tool throws: ValueError("Division by zero")
# 3. Sentry captures the tool error with full context
```

## Expected Sentry Data

### Spans
- Span(s) for LLM API call
- Span for tool execution (divide) - marked as errored
- Proper parent-child relationship showing where error occurred

### Events
- Transaction containing workflow spans (marked as errored)
- Error event with exception details from tool execution
- Error should be linked to the tool execution span

### Metadata

**LLM Call Metadata:**
- **Model name**: The specific model used
- **Token counts**: Tokens for the LLM call
- **Messages**: Prompt requesting division by zero
- **Tools available**: List of tool definitions
- **Provider**: AI provider name

**Tool Call Metadata:**
- **Tool name**: "divide"
- **Tool arguments**: divide(165, 0)
- **Tool error**: Division by zero error

**Error Event Metadata:**
- **Exception type**: Error/ValueError
- **Exception message**: "Division by zero"
- **Stack trace**: Stack trace showing error in divide function
- **Context**:
  - Tool being executed: "divide"
  - Arguments: a=165, b=0
  - Error occurred during tool execution
- **Workflow state**: What happened before the tool error

### Success Criteria
- ✅ LLM interaction is captured
- ✅ Tool call (divide) is captured
- ✅ Tool arguments (165, 0) are captured
- ✅ Error event is captured
- ✅ Error is linked to tool execution span
- ✅ Stack trace shows error in divide function
- ✅ Clear indication that error occurred in tool, not application code
- ✅ Tool execution span is marked as errored
- ✅ Transaction is marked as errored
