# S1: Basic Streaming

## Level & Category
- **Level**: 3 (Advanced)
- **Category**: Streaming

## Description
Streaming version of G1. Simple streaming completion. Tests that Sentry captures streaming LLM interactions correctly, including the full response assembled from chunks.

## Requirements
- Stream response from LLM
- Process chunks as they arrive
- Verify Sentry captures streaming interaction
- Verify complete response is captured

## Example Implementation

### JavaScript
```javascript
// System message
"You are a helpful math assistant."

// User message (same as G1, but streaming)
const stream = await llm.chat("What is 69 + 96?", { stream: true });

let fullResponse = "";
for await (const chunk of stream) {
  fullResponse += chunk.content;
  // Process chunk
}

// Verify complete response was streamed
// Expected: "165" or "69 + 96 = 165"
```

### Python
```python
# System message
"You are a helpful math assistant."

# User message (same as G1, but streaming)
stream = llm.chat("What is 69 + 96?", stream=True)

full_response = ""
for chunk in stream:
    full_response += chunk.content
    # Process chunk

# Verify complete response was streamed
# Expected: "165" or "69 + 96 = 165"
```

## Expected Sentry Data

### Spans
- One span for the streaming LLM API call
- Span should include timing from start to last chunk
- Span should indicate streaming mode

### Events
- Transaction containing the streaming LLM span
- No error events (successful completion)

### Metadata
- **Model name**: The specific model used
- **Token counts**:
  - Input tokens (prompt tokens)
  - Output tokens (completion tokens)
  - Total tokens
- **Messages**:
  - System message: "You are a helpful math assistant."
  - User message: "What is 69 + 96?"
  - Complete assistant response (assembled from all chunks)
- **Provider**: AI provider name
- **Streaming**: Indicator that this was a streaming call
- **Chunks received**: Count or indication of streaming chunks (if supported)

### Success Criteria
- ✅ Streaming LLM call completes successfully
- ✅ All chunks are received and processed
- ✅ Complete response is assembled correctly
- ✅ Sentry captures span for streaming call
- ✅ Full response is captured (not just final chunk)
- ✅ Token counts reflect complete response
- ✅ Timing captures full stream duration
- ✅ Streaming mode is indicated in metadata
