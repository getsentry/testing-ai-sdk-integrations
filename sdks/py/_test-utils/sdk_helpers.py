"""
Consolidated SDK Test Helpers for Python

This module provides utilities to eliminate boilerplate in SDK test implementations:
- Setup factory for lifecycle hooks
- Test orchestration wrapper
- Config override handling
- Assertion helpers
"""

import os
import sys
import json
import asyncio
import sentry_sdk
from pathlib import Path
from dotenv import load_dotenv

# Ensure fixtures module is available
from fixtures import load_fixture, validate_fixture
from mock_transport import (
    create_mock_transport,
    get_mock_transport,
    clear_mock_transport,
    MockTransportCapture,
    _mock_transport_capture
)
import mock_transport as mt


def create_sdk_setup(sdk_name, env_path, sentry_options=None):
    """
    Creates a complete setup module with lifecycle hooks for an SDK

    Args:
        sdk_name: Name of the SDK (for logging)
        env_path: Relative path to .env file from setup.py location
        sentry_options: Dict with sentry_sdk.init() options (integrations, traces_sample_rate, etc.)

    Returns:
        Dict with before_all, before_each, after_each, after_all, get_mock_sentry_transport

    Example:
        # In sdks/py/openai-agents/setup.py:
        import sys
        from pathlib import Path

        # Add shared test utils to path
        shared_path = Path(__file__).parent.parent.parent.parent / "shared" / "test-utils" / "py"
        sys.path.insert(0, str(shared_path))

        from sdk_helpers import create_sdk_setup
        import sentry_sdk
        from sentry_sdk.integrations.openai import OpenAIIntegration

        module_exports = create_sdk_setup(
            sdk_name='OpenAI Agents',
            env_path='../../../../.env',
            sentry_options={
                'integrations': [OpenAIIntegration(include_prompts=True)],
                'traces_sample_rate': 1.0,
                'send_default_pii': True
            }
        )

        # Export functions
        before_all = module_exports['before_all']
        before_each = module_exports['before_each']
        after_each = module_exports['after_each']
        after_all = module_exports['after_all']
        get_mock_sentry_transport = module_exports['get_mock_sentry_transport']
    """
    if sentry_options is None:
        sentry_options = {}

    def before_all():
        """Initialize Sentry with mock transport"""
        print(f"🔧 Setting up {sdk_name} tests...")

        # Load environment variables
        # env_path is relative to the setup.py file location
        # We need to resolve it relative to the caller's location
        caller_frame = sys._getframe(1)
        caller_file = caller_frame.f_globals.get('__file__')
        if caller_file:
            caller_dir = Path(caller_file).parent
            resolved_env_path = caller_dir / env_path
        else:
            resolved_env_path = Path(env_path)

        load_dotenv(dotenv_path=resolved_env_path)

        # Pre-initialize mock transport (required for Python)
        mt._mock_transport_capture = MockTransportCapture()

        mock_transport_instance = create_mock_transport(
            options={"dsn": os.getenv("SENTRY_DSN", "https://public@127.0.0.1/1")}
        )

        # Initialize Sentry with provided options
        init_options = {
            'dsn': os.getenv("SENTRY_DSN", "https://public@127.0.0.1/1"),
            'traces_sample_rate': 1.0,
            'transport': mock_transport_instance,
            'send_default_pii': True,
        }
        # Merge with user-provided options (allows overriding defaults)
        init_options.update(sentry_options)

        sentry_sdk.init(**init_options)

        print("  ✓ Sentry initialized with mock transport")

    def before_each():
        """Reset test state"""
        print("  ↻ Resetting test state...")
        clear_mock_transport()

    def after_each():
        """Clean up after test"""
        print("  ✓ Cleaning up...")

    def after_all():
        """Teardown Sentry"""
        print(f"🧹 Tearing down {sdk_name} tests...")
        sentry_sdk.flush(timeout=2.0)

    def get_mock_sentry_transport():
        """Helper to get mock transport for assertions"""
        return get_mock_transport()

    return {
        'before_all': before_all,
        'before_each': before_each,
        'after_each': after_each,
        'after_all': after_all,
        'get_mock_sentry_transport': get_mock_sentry_transport,
    }


def load_config_override():
    """
    Loads config override from environment variable

    Returns:
        Dict with config overrides or None if not set/invalid
    """
    # Check both possible environment variable names (for backwards compatibility)
    override_json = os.getenv("SDK_CONFIG_OVERRIDES") or os.getenv("SENTRY_AI_TEST_CONFIG_OVERRIDE")
    if not override_json:
        return None

    try:
        return json.loads(override_json)
    except json.JSONDecodeError as error:
        print(f"⚠️  Failed to parse config override: {error}")
        return None


def get_fixture_inputs(spec_id, framework_type):
    """
    Extracts inputs from fixture with optional config override

    Args:
        spec_id: Test spec ID (e.g., "1-simple")
        framework_type: Framework type ("agentic" or "low-level")

    Returns:
        Dict with fixture inputs (potentially overridden)
    """
    config_override = load_config_override()
    fixture = load_fixture(spec_id, framework_type, config_override)
    return fixture["inputs"]


def get_transport_data(get_mock_sentry_transport):
    """
    Extracts all transport data (spans, transactions, events)

    Args:
        get_mock_sentry_transport: Function to get mock transport

    Returns:
        Dict with spans, transactions, events arrays
    """
    transport = get_mock_sentry_transport()
    return {
        'spans': transport.get_spans(),
        'transactions': transport.get_transactions(),
        'events': transport.get_events(),
    }


async def assert_sentry_fixture(spec_id, spans, transactions, events, framework_type):
    """
    Validates captured Sentry data against fixture expectations

    Args:
        spec_id: Test spec ID
        spans: Captured spans
        transactions: Captured transactions
        events: Captured events
        framework_type: Framework type

    Raises:
        Exception: If validation fails
    """
    print(f"    Captured: {len(spans)} spans, {len(transactions)} transactions, {len(events)} events")

    config_override = load_config_override()
    result = validate_fixture(spec_id, spans, transactions, events, framework_type, config_override)

    if not result["passed"]:
        print("    ✗ Validation failed:")
        for error in result["errors"]:
            print(f"      - {error}")

        error_msg = "Fixture validation failed:\n" + "\n".join(result["errors"])
        raise Exception(error_msg)

    print("    ✓ All fixture validations passed")


def run_test_case(spec_id, framework_type, test_logic, get_mock_sentry_transport):
    """
    Orchestrates a complete test case execution

    Handles:
    - Fixture loading
    - Span wrapping
    - Flushing
    - Validation
    - Error handling

    Args:
        spec_id: Test spec ID (e.g., "1-simple")
        framework_type: Framework type ("agentic" or "low-level")
        test_logic: Async function containing SDK-specific test logic (receives inputs dict)
        get_mock_sentry_transport: Function to get mock transport

    Returns:
        Dict with main() and assert_sentry() functions for test runner

    Example:
        # In sdks/py/openai-agents/cases/1-simple.py:
        from sdk_helpers import run_test_case
        from setup import get_mock_sentry_transport
        import openai

        async def test_logic(inputs):
            model = inputs["model"]
            system = inputs["system"]
            prompt = inputs["prompt"]

            client = openai.OpenAI()
            response = client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user", "content": prompt}
                ]
            )
            return response

        test_case = run_test_case('1-simple', 'low-level', test_logic, get_mock_sentry_transport)

        # Export for test runner
        main = test_case['main']
        assert_sentry = test_case['assert_sentry']
    """

    async def main():
        """Main test case entry point - runs the test logic only"""
        print(f"    Running {spec_id}: {get_test_description(spec_id)}")

        # Load inputs from fixture
        inputs = get_fixture_inputs(spec_id, framework_type)

        # Run the SDK-specific test logic
        result = await test_logic(inputs)

        # Show result in verbose mode
        if os.getenv("SENTRY_AI_TEST_VERBOSE") == "true" and result:
            print(f"    Response: {result}")

        print("    ✓ Test logic completed")

    async def assert_sentry():
        """Verify Sentry captured the expected data - called after main() completes"""
        # Small buffer to ensure transport has processed everything
        await asyncio.sleep(0.1)

        # Get transport data
        data = get_transport_data(get_mock_sentry_transport)

        # Validate
        await assert_sentry_fixture(
            spec_id,
            data['spans'],
            data['transactions'],
            data['events'],
            framework_type
        )

        print(f"    ✓ {spec_id} validation passed")

    return {
        'main': main,
        'assert_sentry': assert_sentry,
    }


def get_test_description(spec_id):
    """
    Gets human-readable description for a test spec

    Args:
        spec_id: Test spec ID

    Returns:
        Description string
    """
    descriptions = {
        "1-simple": "Basic Completion",
        "2-simple-with-error": "Basic Completion with Error",
        "3-multi-turn": "Multi-turn Conversation",
        "4-streaming": "Basic Streaming",
        "5-streaming-with-error": "Streaming with Error",
        "6-agent-success": "Agent Success Path",
        "7-agent-llm-error": "Agent LLM Error",
        "8-agent-tool-error": "Agent Tool Error",
    }
    return descriptions.get(spec_id, spec_id)


# Export all public functions
__all__ = [
    'create_sdk_setup',
    'run_test_case',
    'load_config_override',
    'get_fixture_inputs',
    'get_transport_data',
    'assert_sentry_fixture',
    'get_test_description',
]
