"""
1-simple: Basic Completion

Tests a simple chat completion request with Google GenAI SDK
and verifies that Sentry captures the appropriate spans and AI monitoring data.
"""

import os
from google import genai
from test_runner import run_test_case


async def test_logic(inputs):
    """The actual test logic"""
    model = inputs["model"]
    system = inputs["system"]
    prompt = inputs["prompt"]

    client = genai.Client(api_key=os.getenv("GOOGLE_GENAI_API_KEY"))

    # Combine system and prompt (GenAI doesn't have separate system parameter)
    contents = f"{system}\n\n{prompt}"

    response = client.models.generate_content(
        model=model,
        contents=contents,
    )

    if not response.text:
        raise Exception("No output returned from Google GenAI")

    if os.getenv("SENTRY_AI_TEST_VERBOSE") == "true":
        print(f"    Response: {response.text}")

    return response.text


# Export test case functions
test_case = run_test_case("1-simple", test_logic)
main = test_case["main"]
assert_sentry = test_case["assert_sentry"]
