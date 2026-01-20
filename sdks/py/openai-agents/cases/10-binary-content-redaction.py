"""
10-binary-content-redaction: Binary Content Redaction Test

Tests that when binary data (such as images) is sent to an LLM via OpenAI Agents,
Sentry correctly redacts the binary content in the captured span data and
replaces it with a substitute marker.
"""

import os
import base64
from pathlib import Path
from agents import Agent, Runner
from test_runner import run_test_case


async def test_logic(inputs):
    """The actual test logic"""
    model = inputs["model"]

    # Load static test image
    # Path: cases -> openai-agents -> py -> sdks -> repo_root
    repo_root = Path(__file__).parent.parent.parent.parent.parent
    image_path = repo_root / "shared" / "test-assets" / "test-image-10x10-red.png"

    with open(image_path, "rb") as f:
        image_data = f.read()
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
