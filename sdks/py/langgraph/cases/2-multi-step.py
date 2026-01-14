"""
2-multi-step: Multi-step Conversation

Tests a multi-step conversation with conversation history using LangGraph SDK
and verifies that Sentry captures all spans for both API calls.
"""

import os
from langgraph.prebuilt import create_react_agent
from langchain_openai import ChatOpenAI
from test_runner import run_test_case


async def test_logic(inputs):
    """The actual test logic"""
    model = inputs["model"]
    system = inputs["system"]
    first_prompt = inputs["first_prompt"]
    second_prompt = inputs["second_prompt"]

    llm = ChatOpenAI(model=model, api_key=os.getenv("OPENAI_API_KEY"))

    # Create a simple react agent with no tools
    agent = create_react_agent(llm, tools=[])

    # First call
    first_messages = [
        ("system", system),
        ("user", first_prompt)
    ]

    first_result = agent.invoke({"messages": first_messages})
    first_text = first_result["messages"][-1].content

    if not first_text:
        raise Exception("No output returned from LangGraph (first call)")

    if os.getenv("SENTRY_AI_TEST_VERBOSE") == "true":
        print(f"    First response: {first_text}")

    # Second call with conversation history
    second_messages = [
        ("system", system),
        ("user", first_prompt),
        ("ai", first_text),
        ("user", second_prompt)
    ]

    second_result = agent.invoke({"messages": second_messages})
    second_text = second_result["messages"][-1].content

    if not second_text:
        raise Exception("No output returned from LangGraph (second call)")

    if os.getenv("SENTRY_AI_TEST_VERBOSE") == "true":
        print(f"    Second response: {second_text}")

    return second_text


# Export test case functions
test_case = run_test_case("2-multi-step", test_logic)
main = test_case["main"]
assert_sentry = test_case["assert_sentry"]
