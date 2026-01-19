"""
10-binary-content-redaction: Binary Content Redaction Test

Tests that when binary data (such as images) is sent to an LLM, Sentry
correctly redacts the binary content in the captured span data and
replaces it with a substitute marker.
"""

import os
import io
from google import genai
from google.genai import types
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

    client = genai.Client(api_key=os.getenv("GOOGLE_GENAI_API_KEY"))

    # Create binary image data
    image_data = create_minimal_png()

    # Google GenAI accepts images as Part objects
    image_part = types.Part.from_bytes(data=image_data, mime_type="image/png")
    text_part = types.Part(text="What color is this image? Answer in one word.")

    response = client.models.generate_content(
        model=model,
        contents=[image_part, text_part],
    )

    if not response.text:
        raise Exception("No output returned from Google GenAI")

    if os.getenv("SENTRY_AI_TEST_VERBOSE") == "true":
        print(f"    Response: {response.text}")
        print(f"    Sent image with {len(image_data)} bytes of binary data")

    return response.text


# Export test case functions
test_case = run_test_case("10-binary-content-redaction", test_logic)
main = test_case["main"]
assert_sentry = test_case["assert_sentry"]
