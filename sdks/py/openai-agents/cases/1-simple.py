"""
1-simple: Basic Completion

Tests a simple agent completion request with OpenAI Agents SDK
and verifies that Sentry captures the appropriate spans and AI monitoring data.
"""

import os
from agents import Agent, Runner
from sdk_helpers import run_test_case
from setup import get_mock_sentry_transport

# Framework type for this SDK (determines which fixture variant to use)
FRAMEWORK_TYPE = "agentic"


async def test_logic(inputs):
    """The actual test logic"""
    model = inputs["model"]
    system = inputs["system"]
    prompt = inputs["prompt"]

    # Create a simple math assistant agent
    math_agent = Agent(
        name="math_assistant",
        instructions=system,
        model=model,
    )

    # Run the agent with a simple math question
    result = await Runner.run(math_agent, prompt)

    if not result.final_output:
        raise Exception("No output returned from OpenAI Agents")

    # Only show response in verbose mode
    if os.getenv("SENTRY_AI_TEST_VERBOSE") == "true":
        print(f"    Response: {result.final_output}")

    return result.final_output


# Export test case functions
test_case = run_test_case("1-simple", FRAMEWORK_TYPE, test_logic, get_mock_sentry_transport)
main = test_case['main']
assert_sentry = test_case['assert_sentry']
