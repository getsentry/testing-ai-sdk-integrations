"""
2-multi-step: Multi-step Conversation

Tests a multi-step conversation with conversation history using OpenAI SDK
and verifies that Sentry captures all spans for both API calls.
"""

import os
from openai import OpenAI
from test_runner import run_test_case


async def test_logic(inputs):
    """The actual test logic"""
    model = inputs["model"]
    system = inputs["system"]
    first_prompt = inputs["first_prompt"]
    second_prompt = inputs["second_prompt"]

    client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

    # First call
    first_response = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": first_prompt}
        ]
    )

    first_text = first_response.choices[0].message.content

    if not first_text:
        raise Exception("No output returned from OpenAI (first call)")

    if os.getenv("SENTRY_AI_TEST_VERBOSE") == "true":
        print(f"    First response: {first_text}")

    # Second call with conversation history
    second_response = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": first_prompt},
            {"role": "assistant", "content": first_text},
            {"role": "user", "content": second_prompt}
        ]
    )

    second_text = second_response.choices[0].message.content

    if not second_text:
        raise Exception("No output returned from OpenAI (second call)")

    if os.getenv("SENTRY_AI_TEST_VERBOSE") == "true":
        print(f"    Second response: {second_text}")

    return second_text


# Export test case functions
test_case = run_test_case("2-multi-step", test_logic)
main = test_case["main"]
assert_sentry = test_case["assert_sentry"]
