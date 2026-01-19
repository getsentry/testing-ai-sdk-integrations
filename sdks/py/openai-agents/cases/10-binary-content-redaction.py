"""
10-binary-content-redaction: Binary Content Redaction Test

Tests that when binary data (such as images) is sent to an LLM via OpenAI Agents,
Sentry correctly redacts the binary content in the captured span data and
replaces it with a substitute marker.
"""

import os
import io
import base64
from agents import Agent, Runner
from test_runner import run_test_case
from PIL import Image


def create_minimal_png():
    """
    Create a minimal valid PNG image using PIL.
    Returns the PNG bytes that OpenAI can process.
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
    base64_image = base64.standard_b64encode(image_data).decode("utf-8")

    # Create an agent that can handle images
    agent = Agent(
        name="image_analyzer",
        instructions="You are a helpful assistant that analyzes images.",
        model=model,
    )

    # OpenAI Agents SDK accepts either a string or list of ResponseInputItemParam
    # For images, we need to wrap content in a message structure and pass as a list
    message_with_image = {
        "role": "user",
        "content": [
            {
                "type": "input_image",
                "image_url": f"data:image/png;base64,{base64_image}",
                "detail": "auto",  # Required field: "low", "high", or "auto"
            },
            {
                "type": "input_text",
                "text": "What color is this image? Answer in one word.",
            },
        ],
    }

    result = await Runner.run(agent, input=[message_with_image])

    if not result.final_output:
        raise Exception("No output returned from OpenAI Agents")

    if os.getenv("SENTRY_AI_TEST_VERBOSE") == "true":
        print(f"    Response: {result.final_output}")
        print(f"    Sent image with {len(image_data)} bytes of binary data")

    return result.final_output


# Export test case functions
test_case = run_test_case("10-binary-content-redaction", test_logic)
main = test_case["main"]
assert_sentry = test_case["assert_sentry"]
