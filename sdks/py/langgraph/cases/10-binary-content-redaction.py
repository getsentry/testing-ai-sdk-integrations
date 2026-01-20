"""
10-binary-content-redaction: Binary Content Redaction Test

Tests that when binary data (such as images) is sent to an LLM via LangGraph,
Sentry correctly redacts the binary content in the captured span data and
replaces it with a substitute marker.
"""

import os
import base64
from pathlib import Path
from langgraph.prebuilt import create_react_agent
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage
from test_runner import run_test_case


async def test_logic(inputs):
    """The actual test logic"""
    model = inputs["model"]

    llm = ChatOpenAI(model=model, api_key=os.getenv("OPENAI_API_KEY"))

    # Create a simple react agent with no tools
    agent = create_react_agent(llm, tools=[])

    # Load static test image
    # Path: cases -> langgraph -> py -> sdks -> repo_root
    repo_root = Path(__file__).parent.parent.parent.parent.parent
    image_path = repo_root / "shared" / "test-assets" / "test-image-10x10-red.png"

    with open(image_path, "rb") as f:
        image_data = f.read()
    base64_image = base64.standard_b64encode(image_data).decode("utf-8")

    # Create message with image content
    message = HumanMessage(
        content=[
            {
                "type": "image_url",
                "image_url": {"url": f"data:image/png;base64,{base64_image}"},
            },
            {
                "type": "text",
                "text": "What color is this image? Answer in one word.",
            },
        ]
    )

    result = agent.invoke({"messages": [message]})

    # Extract the AI's response from the result
    text = result["messages"][-1].content

    if not text:
        raise Exception("No output returned from LangGraph")

    if os.getenv("SENTRY_AI_TEST_VERBOSE") == "true":
        print(f"    Response: {text}")
        print(f"    Sent image with {len(image_data)} bytes of binary data")

    return text


# Export test case functions
test_case = run_test_case("10-binary-content-redaction", test_logic)
main = test_case["main"]
assert_sentry = test_case["assert_sentry"]
