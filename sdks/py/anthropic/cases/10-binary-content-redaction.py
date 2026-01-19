"""
10-binary-content-redaction: Binary Content Redaction Test

Tests that when binary data (such as images) is sent to an LLM, Sentry
correctly redacts the binary content in the captured span data and
replaces it with a substitute marker.
"""

import os
import io
import base64
from anthropic import Anthropic
from test_runner import run_test_case
from PIL import Image


def create_minimal_png():
    """
    Create a minimal valid PNG image using PIL.
    Returns the PNG bytes that Anthropic can process.
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

    client = Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))

    # Create binary image data
    image_data = create_minimal_png()
    base64_image = base64.standard_b64encode(image_data).decode("utf-8")

    # Send message with image content
    response = client.messages.create(
        model=model,
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": "image/png",
                            "data": base64_image,
                        },
                    },
                    {
                        "type": "text",
                        "text": "What color is this image? Answer in one word.",
                    },
                ],
            }
        ],
        max_tokens=1024,
    )

    text = response.content[0].text

    if not text:
        raise Exception("No output returned from Anthropic")

    if os.getenv("SENTRY_AI_TEST_VERBOSE") == "true":
        print(f"    Response: {text}")
        print(f"    Sent image with {len(image_data)} bytes of binary data")

    return text


# Export test case functions
test_case = run_test_case("10-binary-content-redaction", test_logic)
main = test_case["main"]
assert_sentry = test_case["assert_sentry"]
