"""
9-message-truncation: Message Truncation Test

Tests that when large messages are sent to an LLM, Sentry correctly tracks
the original message count vs. the potentially truncated message count in
the captured span data.
"""

import os
from google import genai
from test_runner import run_test_case


async def test_logic(inputs):
    """The actual test logic"""
    model = inputs["model"]
    message_size_kb = inputs.get("message_size_kb", 9)
    message_count = inputs.get("message_count", 3)

    client = genai.Client(api_key=os.getenv("GOOGLE_GENAI_API_KEY"))

    # Generate large content for each message (~9KB each)
    large_content = "x" * (message_size_kb * 1024)

    # Build a large prompt with multiple "messages" embedded
    prompt_parts = []
    for i in range(message_count):
        prompt_parts.append(f"Message {i + 1}: {large_content}")

    large_prompt = (
        "\n\n".join(prompt_parts) + "\n\nPlease summarize the above messages briefly."
    )

    response = client.models.generate_content(
        model=model,
        contents=large_prompt,
    )

    if not response.text:
        raise Exception("No output returned from Google GenAI")

    if os.getenv("SENTRY_AI_TEST_VERBOSE") == "true":
        print(f"    Response: {response.text[:100]}...")
        print(
            f"    Sent {message_count} messages with ~{message_size_kb}KB content each"
        )

    return response.text


# Export test case functions
test_case = run_test_case("9-message-truncation", test_logic)
main = test_case["main"]
assert_sentry = test_case["assert_sentry"]
