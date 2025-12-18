"""
2-multi-step: Multi-step Conversation

Tests a multi-step conversation with conversation history using OpenAI Agents SDK
and verifies that Sentry captures all spans for both API calls.
"""

import os
from agents import Agent, Runner
from test_runner import run_test_case


async def test_logic(inputs):
    """The actual test logic"""
    model = inputs["model"]
    system = inputs["system"]
    first_prompt = inputs["first_prompt"]
    second_prompt = inputs["second_prompt"]

    math_agent = Agent(
        name="math_assistant",
        instructions=system,
        model=model,
    )

    # First call
    first_result = await Runner.run(math_agent, first_prompt)

    if not first_result.final_output:
        raise Exception("No output returned from OpenAI Agents (first call)")

    first_text = first_result.final_output

    if os.getenv("SENTRY_AI_TEST_VERBOSE") == "true":
        print(f"    First response: {first_text}")

    # Second call with conversation history
    # Build conversation history from first result's messages
    messages = first_result.messages + [
        {"role": "user", "content": second_prompt}
    ]

    second_result = await Runner.run(
        math_agent,
        messages=messages,
    )

    if not second_result.final_output:
        raise Exception("No output returned from OpenAI Agents (second call)")

    second_text = second_result.final_output

    if os.getenv("SENTRY_AI_TEST_VERBOSE") == "true":
        print(f"    Second response: {second_text}")

    return second_text


# Export test case functions
test_case = run_test_case("2-multi-step", test_logic)
main = test_case["main"]
assert_sentry = test_case["assert_sentry"]
