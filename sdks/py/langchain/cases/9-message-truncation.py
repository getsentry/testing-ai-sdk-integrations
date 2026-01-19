"""
9-message-truncation: Message Truncation Test

Tests that when large messages are sent to an LLM, Sentry correctly tracks
the original message count vs. the potentially truncated message count in
the captured span data.
"""

import os
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, SystemMessage, AIMessage
from test_runner import run_test_case


async def test_logic(inputs):
    """The actual test logic"""
    model = inputs["model"]
    message_size_kb = inputs.get("message_size_kb", 9)
    message_count = inputs.get("message_count", 3)

    chat = ChatOpenAI(model=model, api_key=os.getenv("OPENAI_API_KEY"))

    # Generate large content for each message (~9KB each)
    large_content = "x" * (message_size_kb * 1024)

    # Create the messages array with large content
    messages = []
    for i in range(message_count):
        if i % 2 == 0:
            messages.append(HumanMessage(content=f"Message {i + 1}: {large_content}"))
        else:
            messages.append(AIMessage(content=f"Message {i + 1}: {large_content}"))

    # Ensure the last message is from user (required)
    if isinstance(messages[-1], AIMessage):
        messages.append(HumanMessage(content="Please summarize what we discussed."))

    response = chat.invoke(messages)

    text = response.content

    if not text:
        raise Exception("No output returned from LangChain")

    if os.getenv("SENTRY_AI_TEST_VERBOSE") == "true":
        print(f"    Response: {text[:100]}...")
        print(
            f"    Sent {len(messages)} messages with ~{message_size_kb}KB content each"
        )

    return text


# Export test case functions
test_case = run_test_case("9-message-truncation", test_logic)
main = test_case["main"]
assert_sentry = test_case["assert_sentry"]
