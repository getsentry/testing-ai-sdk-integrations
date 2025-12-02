"""
2-multi-step: Multi-step Conversation

Tests a multi-step conversation with conversation history using Google GenAI SDK
and verifies that Sentry captures all spans for both API calls.
"""

import os
from google import genai
from google.genai import types
from test_runner import run_test_case


async def test_logic(inputs):
    """The actual test logic"""
    model = inputs["model"]
    system = inputs["system"]
    first_prompt = inputs["first_prompt"]
    second_prompt = inputs["second_prompt"]

    client = genai.Client(api_key=os.getenv("GOOGLE_GENAI_API_KEY"))

    # First call
    first_response = client.models.generate_content(
        model=model,
        contents=first_prompt,
        config=types.GenerateContentConfig(
            system_instruction=system,
        ),
    )

    first_text = first_response.text

    if not first_text:
        raise Exception("No output returned from Google GenAI (first call)")

    if os.getenv("SENTRY_AI_TEST_VERBOSE") == "true":
        print(f"    First response: {first_text}")

    # Second call with conversation history
    # Google GenAI API expects contents as a list for multi-turn conversations
    second_response = client.models.generate_content(
        model=model,
        contents=[
            types.Content(
                role="user",
                parts=[types.Part(text=first_prompt)]
            ),
            types.Content(
                role="model",
                parts=[types.Part(text=first_text)]
            ),
            types.Content(
                role="user",
                parts=[types.Part(text=second_prompt)]
            ),
        ],
        config=types.GenerateContentConfig(
            system_instruction=system,
        ),
    )

    second_text = second_response.text

    if not second_text:
        raise Exception("No output returned from Google GenAI (second call)")

    if os.getenv("SENTRY_AI_TEST_VERBOSE") == "true":
        print(f"    Second response: {second_text}")

    return second_text


# Export test case functions
test_case = run_test_case("2-multi-step", test_logic)
main = test_case["main"]
assert_sentry = test_case["assert_sentry"]
