"""
10-binary-content-redaction: Binary Content Redaction Test

Tests that when binary data (such as images) is sent to an LLM, Sentry
correctly redacts the binary content in the captured span data and
replaces it with a substitute marker.
"""

import os
import base64
from pathlib import Path
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage
from test_runner import run_test_case


async def test_logic(inputs):
    """The actual test logic"""
    model = inputs["model"]

    chat = ChatOpenAI(model=model, api_key=os.getenv("OPENAI_API_KEY"))

    # Load static test image
    # Path: cases -> langchain -> py -> sdks -> repo_root
    repo_root = Path(__file__).parent.parent.parent.parent.parent
    image_path = repo_root / "shared" / "test-assets" / "test-image-10x10-red.png"

    with open(image_path, "rb") as f:
        image_data = f.read()
    base64_image = base64.standard_b64encode(image_data).decode("utf-8")

    # LangChain uses a specific format for image inputs
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

    response = chat.invoke([message])

    text = response.content

    if not text:
        raise Exception("No output returned from LangChain")

    if os.getenv("SENTRY_AI_TEST_VERBOSE") == "true":
        print(f"    Response: {text}")
        print(f"    Sent image with {len(image_data)} bytes of binary data")

    return text


# Export test case functions
test_case = run_test_case("10-binary-content-redaction", test_logic)
main = test_case["main"]
assert_sentry = test_case["assert_sentry"]
