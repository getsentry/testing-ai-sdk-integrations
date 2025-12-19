"""
2-multi-step: Multi-step Conversation

Tests a multi-step conversation with conversation history using Pydantic AI SDK
and verifies that Sentry captures all spans for both API calls.
"""

import os
from pydantic_ai import Agent
from test_runner import run_test_case


async def test_logic(inputs):
    """The actual test logic"""
    model = inputs["model"]
    system = inputs["system"]
    first_prompt = inputs["first_prompt"]
    second_prompt = inputs["second_prompt"]

    # Create agent with system prompt
    agent = Agent(f"openai:{model}", system_prompt=system)

    # First call
    first_result = await agent.run(first_prompt)
    first_text = first_result.output

    if not first_text:
        raise Exception("No output returned from Pydantic AI (first call)")

    if os.getenv("SENTRY_AI_TEST_VERBOSE") == "true":
        print(f"    First response: {first_text}")

    # Second call with conversation history
    # Pydantic AI uses message history from the result
    second_result = await agent.run(
        second_prompt,
        message_history=first_result.all_messages()
    )

    second_text = second_result.output

    if not second_text:
        raise Exception("No output returned from Pydantic AI (second call)")

    if os.getenv("SENTRY_AI_TEST_VERBOSE") == "true":
        print(f"    Second response: {second_text}")

    return second_text


# Export test case functions
test_case = run_test_case("2-multi-step", test_logic)
main = test_case["main"]
assert_sentry = test_case["assert_sentry"]
