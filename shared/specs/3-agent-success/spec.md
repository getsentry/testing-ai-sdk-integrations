# A1: Agentic Workflow - Success

## Level & Category
- **Level**: 2 (Intermediate)
- **Category**: Agentic

## Description
Multi-step calculation using tools: (69+96) * 3 / 2. All calls succeed. Tests that Sentry captures complex agentic workflows with multiple tool calls and LLM interactions.

## Requirements
- Multiple tool calls (at least 3)
- Successful completion of workflow
- Verify Sentry captures entire workflow chain

## Tool Definitions

### JavaScript
```javascript
const tools = [
  {
    name: "add",
    description: "Add two numbers",
    parameters: {
      type: "object",
      properties: {
        a: { type: "number", description: "First number" },
        b: { type: "number", description: "Second number" }
      },
      required: ["a", "b"]
    }
  },
  {
    name: "multiply",
    description: "Multiply two numbers",
    parameters: {
      type: "object",
      properties: {
        a: { type: "number", description: "First number" },
        b: { type: "number", description: "Second number" }
      },
      required: ["a", "b"]
    }
  },
  {
    name: "divide",
    description: "Divide two numbers",
    parameters: {
      type: "object",
      properties: {
        a: { type: "number", description: "Numerator" },
        b: { type: "number", description: "Denominator" }
      },
      required: ["a", "b"]
    }
  }
];

function add(a, b) {
  return { result: a + b };
}

function multiply(a, b) {
  return { result: a * b };
}

function divide(a, b) {
  if (b === 0) {
    throw new Error("Division by zero");
  }
  return { result: a / b };
}
```

### Python
```python
tools = [
    {
        "name": "add",
        "description": "Add two numbers",
        "parameters": {
            "type": "object",
            "properties": {
                "a": {"type": "number", "description": "First number"},
                "b": {"type": "number", "description": "Second number"}
            },
            "required": ["a", "b"]
        }
    },
    {
        "name": "multiply",
        "description": "Multiply two numbers",
        "parameters": {
            "type": "object",
            "properties": {
                "a": {"type": "number", "description": "First number"},
                "b": {"type": "number", "description": "Second number"}
            },
            "required": ["a", "b"]
        }
    },
    {
        "name": "divide",
        "description": "Divide two numbers",
        "parameters": {
            "type": "object",
            "properties": {
                "a": {"type": "number", "description": "Numerator"},
                "b": {"type": "number", "description": "Denominator"}
            },
            "required": ["a", "b"]
        }
    }
]

def add(a, b):
    return {"result": a + b}

def multiply(a, b):
    return {"result": a * b}

def divide(a, b):
    if b == 0:
        raise ValueError("Division by zero")
    return {"result": a / b}
```

## Example Implementation

### JavaScript
```javascript
// System message
"You are a helpful math assistant. Use the provided tools to perform calculations."

// Initial prompt
"Calculate (69 + 96) * 3 / 2"

// Expected flow:
// 1. LLM calls add(69, 96)
// 2. Tool returns: { result: 165 }
// 3. LLM calls multiply(165, 3)
// 4. Tool returns: { result: 495 }
// 5. LLM calls divide(495, 2)
// 6. Tool returns: { result: 247.5 }
// 7. LLM responds: "The result is 247.5"
```

### Python
```python
# System message
"You are a helpful math assistant. Use the provided tools to perform calculations."

# Initial prompt
"Calculate (69 + 96) * 3 / 2"

# Expected flow:
# 1. LLM calls add(69, 96)
# 2. Tool returns: {"result": 165}
# 3. LLM calls multiply(165, 3)
# 4. Tool returns: {"result": 495}
# 5. LLM calls divide(495, 2)
# 6. Tool returns: {"result": 247.5}
# 7. LLM responds: "The result is 247.5"
```

## Expected Sentry Data

### Spans
- Multiple spans for LLM API calls (may be multiple calls or single call with tools)
- Spans for each tool execution (add, multiply, divide)
- Proper parent-child relationship showing workflow hierarchy
- Each span should have timing information

### Events
- Transaction containing all workflow spans
- No error events (successful completion)

### Metadata

**LLM Call Metadata:**
- **Model name**: The specific model used
- **Token counts**: Total tokens across all LLM interactions
- **Messages**: Initial prompt and any follow-up messages
- **Tools available**: List of tool definitions provided to LLM
- **Provider**: AI provider name

**Tool Call Metadata (for each tool):**
- **Tool name**: "add", "multiply", "divide"
- **Tool arguments**:
  - add(69, 96)
  - multiply(165, 3)
  - divide(495, 2)
- **Tool results**:
  - { result: 165 }
  - { result: 495 }
  - { result: 247.5 }
- **Execution order**: Clear ordering of tool calls

**Final Response:**
- Complete answer: "The result is 247.5"

### Success Criteria
- ✅ All tool calls complete successfully
- ✅ All tool executions are captured as spans
- ✅ LLM interactions are captured
- ✅ Tool arguments and results are captured
- ✅ Workflow chain is clear (parent-child relationships)
- ✅ Token counts are accurate
- ✅ Final result is correct (247.5)
- ✅ All spans properly nested in transaction
