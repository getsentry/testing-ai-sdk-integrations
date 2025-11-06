"""
Setup file for OpenAI Agents SDK tests

This file contains lifecycle hooks that run before/after tests:
- before_all: Runs once before all test cases
- before_each: Runs before each test case
- after_each: Runs after each test case
- after_all: Runs once after all test cases
"""

import os
import sys
import sentry_sdk
from sentry_sdk.integrations.openai import OpenAIIntegration
from sentry_sdk.integrations.openai_agents import OpenAIAgentsIntegration
from pathlib import Path
from dotenv import load_dotenv

# Add shared test utils to path
shared_path = Path(__file__).parent.parent.parent.parent / "shared" / "test-utils" / "py"
sys.path.insert(0, str(shared_path))

from mock_transport import create_mock_transport, get_mock_transport, clear_mock_transport


def before_all():
    """
    Runs once before all test cases
    Initialize Sentry with mock transport
    """
    print("🔧 Setting up OpenAI Agents SDK tests...")

    # Load environment variables from .env file
    env_path = Path(__file__).parent / ".env"
    load_dotenv(dotenv_path=env_path)

    # Pre-initialize the mock transport capture instance
    # This ensures the global is set before Sentry needs it
    from mock_transport import MockTransportCapture, _mock_transport_capture
    import mock_transport as mt
    mt._mock_transport_capture = MockTransportCapture()

    # Create the mock transport instance directly
    mock_transport_instance = create_mock_transport(options={"dsn": os.getenv("SENTRY_DSN", "https://public@127.0.0.1/1")})

    # Initialize Sentry with mock transport
    sentry_sdk.init(
        dsn=os.getenv("SENTRY_DSN", "https://public@127.0.0.1/1"),
        # dsn="https://public@127.0.0.1/1",
        traces_sample_rate=1.0,
        transport=mock_transport_instance,
        integrations=[
            OpenAIAgentsIntegration(),
        ],
        disabled_integrations=[OpenAIIntegration()],
    )

    print("  ✓ Sentry initialized with mock transport")


def before_each():
    """
    Runs before each test case
    Reset mock transport and clear any state
    """
    print("  ↻ Resetting test state...")
    clear_mock_transport()


def after_each():
    """
    Runs after each test case
    Clean up any resources
    """
    print("  ✓ Cleaning up...")


def after_all():
    """
    Runs once after all test cases
    Teardown Sentry and clean up
    """
    print("🧹 Tearing down OpenAI Agents SDK tests...")
    sentry_sdk.flush(timeout=2.0)


def get_mock_sentry_transport():
    """
    Helper function to get mock transport for assertions
    """
    return get_mock_transport()
