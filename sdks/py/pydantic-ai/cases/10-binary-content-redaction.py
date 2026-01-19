"""
10-binary-content-redaction: Binary Content Redaction Test

Tests that when binary data (such as images) is sent to an LLM via Pydantic AI,
Sentry correctly redacts the binary content in the captured span data and
replaces it with a substitute marker.
"""

import os
import io
import base64
from pydantic_ai import Agent, BinaryContent
from test_runner import run_test_case
from PIL import Image


def create_minimal_png():
    """
    Create a minimal valid PNG image using PIL.
    Returns the PNG bytes.
    """
    # Create a small 10x10 red image
    img = Image.new("RGB", (10, 10), color="red")

    # Save to bytes buffer
    buffer = io.BytesIO()
    img.save(buffer, format="PNG")
    buffer.seek(0)

    return buffer.read()


async def test_logic(inputs):
    """The actual test logic"""
    model = inputs["model"]

    # Create binary image data
    image_data = create_minimal_png()

    # Create agent for image analysis
    agent = Agent(
        f"openai:{model}",
        system_prompt="You are a helpful assistant that analyzes images.",
    )

    # Pydantic AI uses BinaryContent for images
    image_content = BinaryContent(data=image_data, media_type="image/png")

    result = await agent.run(
        "What color is this image? Answer in one word.",
        message_history=[
            {"role": "user", "content": [image_content]},
        ],
    )

    text = result.output

    if not text:
        raise Exception("No output returned from Pydantic AI")

    if os.getenv("SENTRY_AI_TEST_VERBOSE") == "true":
        print(f"    Response: {text}")
        print(f"    Sent image with {len(image_data)} bytes of binary data")

    return text


# Export test case functions
test_case = run_test_case("10-binary-content-redaction", test_logic)
main = test_case["main"]
assert_sentry = test_case["assert_sentry"]
