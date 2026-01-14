# S2: Streaming with Application Error

## Level & Category
- **Level**: 3 (Advanced)
- **Category**: Streaming

## Description
Streaming version of G2. Error occurs during stream processing. Tests that Sentry captures partial streaming data when an error interrupts the stream processing.

## Requirements
- Start streaming response (same prompt as G1)
- Throw error while processing chunks
- Verify Sentry captures partial stream + error

## Example Implementation

### JavaScript
```javascript
// System message
"You are a helpful math assistant."

const stream = await llm.chat("What is 69 + 96?", { stream: true });

let chunkCount = 0;
try {
  for await (const chunk of stream) {
    chunkCount++;
    if (chunkCount > 3) {
      throw new Error("Stream processing error");
    }
  }
} catch (error) {
  // Sentry should capture error with streaming context
}
```

### Python
```python
# System message
"You are a helpful math assistant."

stream = llm.chat("What is 69 + 96?", stream=True)

chunk_count = 0
try:
    for chunk in stream:
        chunk_count += 1
        if chunk_count > 3:
            raise RuntimeError("Stream processing error")
except Exception as e:
    # Sentry should capture error with streaming context
    pass
```

## Expected Sentry Data

### Spans
- One span for the streaming LLM API call
- Span should be marked as errored or interrupted
- Timing should show when stream was interrupted

### Events
- Transaction containing the streaming span (marked as errored)
- Error event with exception details
- Error should be linked to the streaming transaction

### Metadata

**LLM Span Metadata:**
- **Model name**: The specific model used
- **Token counts**: Partial token count (if available)
- **Messages**:
  - System message: "You are a helpful math assistant."
  - User message: "What is 69 + 96?"
  - Partial assistant response (chunks received before error)
- **Provider**: AI provider name
- **Streaming**: Indicator that this was a streaming call
- **Chunks received**: Number of chunks processed before error (3)
- **Stream interrupted**: Indication that stream didn't complete

**Error Event Metadata:**
- **Exception type**: Error/RuntimeError
- **Exception message**: "Stream processing error"
- **Stack trace**: Full stack trace showing where error occurred
- **Context**:
  - Error occurred during streaming
  - Number of chunks processed before error
  - Partial response data (if available)

### Success Criteria
- ✅ Streaming starts successfully
- ✅ First 3 chunks are received and processed
- ✅ Error is thrown on 4th chunk
- ✅ Streaming span is captured
- ✅ Partial response data is captured
- ✅ Error event is captured
- ✅ Error is properly linked to streaming transaction
- ✅ Clear indication that stream was interrupted
- ✅ Stack trace shows error location
- ✅ Chunk count or partial data is preserved
