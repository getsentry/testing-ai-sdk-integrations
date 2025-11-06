# G3: Multi-turn Conversation

## Level & Category
- **Level**: 2 (Intermediate)
- **Category**: Generation

## Description
Multiple messages in conversation, multiple API calls. Builds on G1 by adding conversation history. Tests that Sentry captures all interactions in a multi-turn conversation.

## Requirements
- First message: same as G1 (add 69+96)
- Second message: "multiply it by 3"
- Two separate API calls
- Verify Sentry captures both interactions

## Example Implementation

### JavaScript
```javascript
// System message (for both calls)
"You are a helpful math assistant."

// First call
const firstResponse = await llm.chat("What is 69 + 96?");
// Expected: "165"

// Second call with conversation history
const messages = [
  { role: "user", content: "What is 69 + 96?" },
  { role: "assistant", content: firstResponse },
  { role: "user", content: "Multiply it by 3" }
];
const secondResponse = await llm.chat(messages);
// Expected: "495" or "165 * 3 = 495"
```

### Python
```python
# System message (for both calls)
"You are a helpful math assistant."

# First call
first_response = llm.chat("What is 69 + 96?")
# Expected: "165"

# Second call with conversation history
messages = [
    {"role": "user", "content": "What is 69 + 96?"},
    {"role": "assistant", "content": first_response},
    {"role": "user", "content": "Multiply it by 3"}
]
second_response = llm.chat(messages)
# Expected: "495" or "165 * 3 = 495"
```

## Expected Sentry Data

### Spans
- Two separate spans, one for each LLM API call
- Each span should have timing information
- Spans should be properly ordered/nested in transaction

### Events
- Transaction containing both LLM spans
- No error events (successful completion)

### Metadata

**First Call Metadata:**
- **Model name**: The specific model used
- **Token counts**: Input, output, and total tokens for first call
- **Messages**:
  - System message: "You are a helpful math assistant."
  - User message: "What is 69 + 96?"
  - Assistant response: "165"
- **Provider**: AI provider name

**Second Call Metadata:**
- **Model name**: The specific model used
- **Token counts**: Input, output, and total tokens for second call
- **Messages**:
  - System message: "You are a helpful math assistant."
  - User message: "What is 69 + 96?"
  - Assistant message: "165"
  - User message: "Multiply it by 3"
  - Assistant response: "495"
- **Provider**: AI provider name
- **Conversation history**: Full message history should be captured

### Success Criteria
- ✅ Both LLM calls complete successfully
- ✅ Two separate spans are captured
- ✅ First span captures initial Q&A
- ✅ Second span captures conversation history + new message
- ✅ Token counts are accurate for both calls
- ✅ All messages in conversation are captured
- ✅ Model name captured for both calls
