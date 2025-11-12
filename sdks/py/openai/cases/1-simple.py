"""
1-simple: Basic Completion

Tests a simple chat completion request with OpenAI SDK
and verifies that Sentry captures the appropriate spans and AI monitoring data.
"""

import os
from openai import OpenAI
from test_runner import run_test_case

FRAMEWORK_TYPE = "low-level"


async def test_logic(inputs):
    """The actual test logic"""
    model = inputs["model"]
    system = inputs["system"]
    prompt = inputs["prompt"]

    client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

    response = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": prompt}
        ]
    )

    text = response.choices[0].message.content

    if not text:
        raise Exception("No output returned from OpenAI")

    if os.getenv("SENTRY_AI_TEST_VERBOSE") == "true":
        print(f"    Response: {text}")

    return text


# Export test case functions
test_case = run_test_case("1-simple", FRAMEWORK_TYPE, test_logic)
main = test_case["main"]
assert_sentry = test_case["assert_sentry"]
