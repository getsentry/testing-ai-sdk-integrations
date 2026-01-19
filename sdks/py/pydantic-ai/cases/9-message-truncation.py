"""
9-message-truncation: Message Truncation Test

Tests that when large messages are sent to an LLM via Pydantic AI, Sentry
correctly tracks the original message count vs. the potentially truncated
message count in the captured span data.
"""

import os
from pydantic_ai import Agent
from test_runner import run_test_case


async def test_logic(inputs):
    """The actual test logic"""
    model = inputs["model"]
    message_size_kb = inputs.get("message_size_kb", 9)
    message_count = inputs.get("message_count", 3)

    # Generate large content for each message (~9KB each)
    large_content = "x" * (message_size_kb * 1024)

    # Build a large prompt with multiple "messages" embedded
    prompt_parts = []
    for i in range(message_count):
        prompt_parts.append(f"Message {i + 1}: {large_content}")

    large_prompt = (
        "\n\n".join(prompt_parts) + "\n\nPlease summarize the above messages briefly."
    )

    # Create agent
    agent = Agent(
        f"openai:{model}",
        system_prompt="You are a helpful assistant that summarizes content.",
    )

    result = await agent.run(large_prompt)

    text = result.output

    if not text:
        raise Exception("No output returned from Pydantic AI")

    if os.getenv("SENTRY_AI_TEST_VERBOSE") == "true":
        print(f"    Response: {text[:100]}...")
        print(
            f"    Sent prompt with {message_count} large messages (~{message_size_kb}KB each)"
        )

    return text


# Export test case functions
test_case = run_test_case("9-message-truncation", test_logic)
main = test_case["main"]
assert_sentry = test_case["assert_sentry"]
