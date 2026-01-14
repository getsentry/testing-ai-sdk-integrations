"""
2-multi-step: Multi-step Conversation

Tests a multi-step conversation with conversation history using LangChain SDK
and verifies that Sentry captures all spans for both API calls.
"""

import os
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, SystemMessage, AIMessage
from test_runner import run_test_case


async def test_logic(inputs):
    """The actual test logic"""
    model = inputs["model"]
    system = inputs["system"]
    first_prompt = inputs["first_prompt"]
    second_prompt = inputs["second_prompt"]

    chat = ChatOpenAI(model=model, api_key=os.getenv("OPENAI_API_KEY"))

    # First call
    first_messages = [
        SystemMessage(content=system),
        HumanMessage(content=first_prompt),
    ]

    first_response = chat.invoke(first_messages)
    first_text = first_response.content

    if not first_text:
        raise Exception("No output returned from LangChain (first call)")

    if os.getenv("SENTRY_AI_TEST_VERBOSE") == "true":
        print(f"    First response: {first_text}")

    # Second call with conversation history
    second_messages = [
        SystemMessage(content=system),
        HumanMessage(content=first_prompt),
        AIMessage(content=first_text),
        HumanMessage(content=second_prompt),
    ]

    second_response = chat.invoke(second_messages)
    second_text = second_response.content

    if not second_text:
        raise Exception("No output returned from LangChain (second call)")

    if os.getenv("SENTRY_AI_TEST_VERBOSE") == "true":
        print(f"    Second response: {second_text}")

    return second_text


# Export test case functions
test_case = run_test_case("2-multi-step", test_logic)
main = test_case["main"]
assert_sentry = test_case["assert_sentry"]
