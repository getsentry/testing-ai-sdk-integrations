"""
1-simple: Basic Completion

Tests a simple chat completion request with Pydantic AI SDK
and verifies that Sentry captures the appropriate spans and AI monitoring data.
"""

import os
from pydantic_ai import Agent
from test_runner import run_test_case

FRAMEWORK_TYPE = "agentic"


async def test_logic(inputs):
    """The actual test logic"""
    model = inputs["model"]
    system = inputs["system"]
    prompt = inputs["prompt"]

    # Create agent with system prompt
    agent = Agent(f"openai:{model}", system_prompt=system)

    # Run synchronously (inside async function, but using sync method)
    result = await agent.run(prompt)

    text = result.output

    if not text:
        raise Exception("No output returned from Pydantic AI")

    if os.getenv("SENTRY_AI_TEST_VERBOSE") == "true":
        print(f"    Response: {text}")

    return text


# Export test case functions
test_case = run_test_case("1-simple", FRAMEWORK_TYPE, test_logic)
main = test_case["main"]
assert_sentry = test_case["assert_sentry"]
