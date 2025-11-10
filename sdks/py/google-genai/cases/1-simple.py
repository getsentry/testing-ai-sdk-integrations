"""
1-simple: Basic Completion

Tests a simple chat completion request with Google GenAI SDK
and verifies that Sentry captures the appropriate spans and AI monitoring data.
"""

import os
import asyncio
import sentry_sdk
from google import genai

# Framework type for this SDK (low-level: direct LLM calls)
FRAMEWORK_TYPE = "low-level"

# Model override: Google GenAI uses Gemini models, not OpenAI models
# The fixture specifies 'gpt-4o-mini' but we need to use a Gemini model
MODEL_OVERRIDE = "gemini-2.5-flash-lite"


async def main():
    """Main test case entry point - runs the test logic only"""
    print("    Running 1-simple: Basic Completion")

    # Run the actual test
    await run_test()

    print("    ✓ Test logic completed")


async def assert_sentry():
    """Verify Sentry captured the expected data - called after main() completes"""
    # Small buffer to ensure transport has processed everything
    await asyncio.sleep(0.1)

    await assert_sentry_captured()

    print("    ✓ 1-simple validation passed")


async def run_test():
    """The actual test logic"""
    # Load test inputs from fixture
    from fixtures import load_fixture

    fixture = load_fixture("1-simple", FRAMEWORK_TYPE)
    model = MODEL_OVERRIDE  # Use Gemini model instead of fixture's OpenAI model
    system = fixture["inputs"]["system"]
    prompt = fixture["inputs"]["prompt"]

    # Create Google GenAI client
    client = genai.Client(api_key=os.getenv("GOOGLE_GENAI_API_KEY"))

    # Make the request - combine system and prompt since GenAI doesn't have separate system parameter
    # Format: system message followed by user prompt
    contents = f"{system}\n\n{prompt}"

    response = client.models.generate_content(
        model=model,
        contents=contents,
    )

    if not response.text:
        raise Exception("No output returned from Google GenAI")

    # Only show response in verbose mode
    if os.getenv("SENTRY_AI_TEST_VERBOSE") == "true":
        print(f"    Response: {response.text}")


async def assert_sentry_captured():
    """Verify Sentry captured the expected spans and data"""
    # Import fixtures validator and setup helper
    # (paths set up by python-test-runner.py wrapper)
    from fixtures import validate_fixture
    from setup import get_mock_sentry_transport

    transport = get_mock_sentry_transport()
    spans = transport.get_spans()
    transactions = transport.get_transactions()
    events = transport.get_events()

    print(f"    Captured: {len(spans)} spans, {len(transactions)} transactions, {len(events)} events")

    result = validate_fixture("1-simple", spans, transactions, events, FRAMEWORK_TYPE)

    if not result["passed"]:
        print("    ✗ Validation failed:")
        for error in result["errors"]:
            print(f"      - {error}")

        # Build error message with all details
        error_msg = "Fixture validation failed:\n" + "\n".join(result["errors"])
        raise Exception(error_msg)

    print("    ✓ All fixture validations passed")


# The main function is exported for the test runner to call
# No need for __main__ block - runner will import and call main()
