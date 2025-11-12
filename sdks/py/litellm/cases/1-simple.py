"""
1-simple: Basic Completion

Tests a simple chat completion request with LiteLLM SDK
and verifies that Sentry captures the appropriate spans and AI monitoring data.
"""

import os
from litellm import completion
from test_runner import run_test_case


async def test_logic(inputs):
    """The actual test logic"""
    model = inputs["model"]
    system = inputs["system"]
    prompt = inputs["prompt"]

    # LiteLLM requires the model prefix (e.g., "openai/gpt-4o-mini")
    response = completion(
        model=f"openai/{model}",
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": prompt}
        ]
    )

    text = response.choices[0].message.content

    if not text:
        raise Exception("No output returned from LiteLLM")

    if os.getenv("SENTRY_AI_TEST_VERBOSE") == "true":
        print(f"    Response: {text}")

    return text


# Export test case functions
test_case = run_test_case("1-simple", test_logic)
main = test_case["main"]
assert_sentry = test_case["assert_sentry"]
