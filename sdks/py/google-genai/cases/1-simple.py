"""
1-simple: Basic Completion

Tests a simple chat completion request with Google GenAI SDK
and verifies that Sentry captures the appropriate spans and AI monitoring data.
"""

import os
from google import genai
from sdk_helpers import run_test_case
from setup import get_mock_sentry_transport

# Framework type for this SDK (low-level: direct LLM calls)
FRAMEWORK_TYPE = "low-level"


async def test_logic(inputs):
    """The actual test logic"""
    model = inputs["model"]
    system = inputs["system"]
    prompt = inputs["prompt"]

    # Create Google GenAI client
    client = genai.Client(api_key=os.getenv("GOOGLE_GENAI_API_KEY"))

    # Make the request - combine system and prompt since GenAI doesn't have separate system parameter
    # Format: system message followed by user prompt
    contents = f"{system}\n\n{prompt}"

    response = client.models.generate_content(
        model=model,
        contents=contents,
    )

    if not response.text:
        raise Exception("No output returned from Google GenAI")

    # Only show response in verbose mode
    if os.getenv("SENTRY_AI_TEST_VERBOSE") == "true":
        print(f"    Response: {response.text}")

    return response.text


# Export test case functions
test_case = run_test_case("1-simple", FRAMEWORK_TYPE, test_logic, get_mock_sentry_transport)
main = test_case['main']
assert_sentry = test_case['assert_sentry']
