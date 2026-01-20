"""
9-message-truncation: Message Truncation Test

Tests that when large messages are sent to an LLM via OpenAI Agents, Sentry
correctly tracks the original message count vs. the potentially truncated
message count in the captured span data.
"""

import os
from agents import Agent, Runner
from test_runner import run_test_case


async def test_logic(inputs):
    """The actual test logic"""
    model = inputs["model"]
    message_size_kb = inputs.get("message_size_kb", 9)
    message_count = inputs.get("message_count", 3)

    # Generate large content for the prompt (~9KB each message)
    large_content = "x" * (message_size_kb * 1024)

    # Build a large prompt with multiple "messages" embedded
    prompt_parts = []
    for i in range(message_count):
        prompt_parts.append(f"Message {i + 1}: {large_content}")

    large_prompt = (
        "\n\n".join(prompt_parts) + "\n\nPlease summarize the above messages briefly."
    )

    agent = Agent(
        name="summarizer",
        instructions="You are a helpful assistant that summarizes content.",
        model=model,
    )

    result = await Runner.run(agent, large_prompt)

    if not result.final_output:
        raise Exception("No output returned from OpenAI Agents")

    if os.getenv("SENTRY_AI_TEST_VERBOSE") == "true":
        print(f"    Response: {result.final_output[:100]}...")
        print(
            f"    Sent prompt with {message_count} large messages (~{message_size_kb}KB each)"
        )

    return result.final_output


# Export test case functions
test_case = run_test_case("9-message-truncation", test_logic)
main = test_case["main"]
assert_sentry = test_case["assert_sentry"]
