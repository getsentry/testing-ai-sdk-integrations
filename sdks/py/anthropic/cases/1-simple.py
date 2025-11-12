"""
1-simple: Basic Completion

Tests a simple chat completion request with Anthropic SDK
and verifies that Sentry captures the appropriate spans and AI monitoring data.
"""

import os
from anthropic import Anthropic
from test_runner import run_test_case

FRAMEWORK_TYPE = "low-level"


async def test_logic(inputs):
    """The actual test logic"""
    model = inputs["model"]
    system = inputs["system"]
    prompt = inputs["prompt"]

    client = Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))

    response = client.messages.create(
        model=model,
        system=system,
        messages=[
            {"role": "user", "content": prompt}
        ],
        max_tokens=1024,
    )

    text = response.content[0].text

    if not text:
        raise Exception("No output returned from Anthropic")

    if os.getenv("SENTRY_AI_TEST_VERBOSE") == "true":
        print(f"    Response: {text}")

    return text


# Export test case functions
test_case = run_test_case("1-simple", FRAMEWORK_TYPE, test_logic)
main = test_case["main"]
assert_sentry = test_case["assert_sentry"]
