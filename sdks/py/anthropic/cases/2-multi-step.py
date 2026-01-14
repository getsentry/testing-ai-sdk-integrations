"""
2-multi-step: Multi-step Conversation

Tests a multi-step conversation with conversation history using Anthropic SDK
and verifies that Sentry captures all spans for both API calls.
"""

import os
from anthropic import Anthropic
from test_runner import run_test_case


async def test_logic(inputs):
    """The actual test logic"""
    model = inputs["model"]
    system = inputs["system"]
    first_prompt = inputs["first_prompt"]
    second_prompt = inputs["second_prompt"]

    client = Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))

    # First call
    first_response = client.messages.create(
        model=model,
        system=system,
        messages=[
            {"role": "user", "content": first_prompt}
        ],
        max_tokens=1024,
    )

    first_text = first_response.content[0].text

    if not first_text:
        raise Exception("No output returned from Anthropic (first call)")

    if os.getenv("SENTRY_AI_TEST_VERBOSE") == "true":
        print(f"    First response: {first_text}")

    # Second call with conversation history
    second_response = client.messages.create(
        model=model,
        system=system,
        messages=[
            {"role": "user", "content": first_prompt},
            {"role": "assistant", "content": first_text},
            {"role": "user", "content": second_prompt}
        ],
        max_tokens=1024,
    )

    second_text = second_response.content[0].text

    if not second_text:
        raise Exception("No output returned from Anthropic (second call)")

    if os.getenv("SENTRY_AI_TEST_VERBOSE") == "true":
        print(f"    Second response: {second_text}")

    return second_text


# Export test case functions
test_case = run_test_case("2-multi-step", test_logic)
main = test_case["main"]
assert_sentry = test_case["assert_sentry"]
