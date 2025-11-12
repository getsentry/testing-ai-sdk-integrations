"""
1-simple: Basic Completion

Tests a simple chat completion request with LangGraph SDK
and verifies that Sentry captures the appropriate spans and AI monitoring data.
"""

import os
from langgraph.prebuilt import create_react_agent
from langchain_openai import ChatOpenAI
from test_runner import run_test_case

FRAMEWORK_TYPE = "agentic"


async def test_logic(inputs):
    """The actual test logic"""
    model = inputs["model"]
    system = inputs["system"]
    prompt = inputs["prompt"]

    llm = ChatOpenAI(model=model, api_key=os.getenv("OPENAI_API_KEY"))

    # Create a simple react agent with no tools
    agent = create_react_agent(llm, tools=[])

    # Combine system and prompt as LangGraph expects
    messages = [
        ("system", system),
        ("user", prompt)
    ]

    result = agent.invoke({"messages": messages})

    # Extract the AI's response from the result
    text = result["messages"][-1].content

    if not text:
        raise Exception("No output returned from LangGraph")

    if os.getenv("SENTRY_AI_TEST_VERBOSE") == "true":
        print(f"    Response: {text}")

    return text


# Export test case functions
test_case = run_test_case("1-simple", FRAMEWORK_TYPE, test_logic)
main = test_case["main"]
assert_sentry = test_case["assert_sentry"]
