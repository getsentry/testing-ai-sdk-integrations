"""
1-simple: Basic Completion

Tests a simple chat completion request with LangChain SDK
and verifies that Sentry captures the appropriate spans and AI monitoring data.
"""

import os
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, SystemMessage
from test_runner import run_test_case

FRAMEWORK_TYPE = "low-level"


async def test_logic(inputs):
    """The actual test logic"""
    model = inputs["model"]
    system = inputs["system"]
    prompt = inputs["prompt"]

    chat = ChatOpenAI(model=model, api_key=os.getenv("OPENAI_API_KEY"))

    messages = [
        SystemMessage(content=system),
        HumanMessage(content=prompt),
    ]

    response = chat.invoke(messages)

    text = response.content

    if not text:
        raise Exception("No output returned from LangChain")

    if os.getenv("SENTRY_AI_TEST_VERBOSE") == "true":
        print(f"    Response: {text}")

    return text


# Export test case functions
test_case = run_test_case("1-simple", FRAMEWORK_TYPE, test_logic)
main = test_case["main"]
assert_sentry = test_case["assert_sentry"]
