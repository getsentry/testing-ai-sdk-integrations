"""
Setup file for Google GenAI SDK tests

This file contains lifecycle hooks that run before/after tests:
- before_all: Runs once before all test cases
- before_each: Runs before each test case
- after_each: Runs after each test case
- after_all: Runs once after all test cases
"""

import os
import sys
import sentry_sdk
from sentry_sdk.integrations.google_genai import GoogleGenAIIntegration
from pathlib import Path
from dotenv import load_dotenv

# Add shared test utils to path (CRITICAL - DO NOT FORGET)
shared_path = Path(__file__).parent.parent.parent.parent / "shared" / "test-utils" / "py"
sys.path.insert(0, str(shared_path))

from mock_transport import create_mock_transport, get_mock_transport, clear_mock_transport


def before_all():
    """Initialize Sentry with mock transport"""
    print("🔧 Setting up Google GenAI SDK tests...")

    # Load environment variables
    env_path = Path(__file__).parent.parent.parent.parent / ".env"
    load_dotenv(dotenv_path=env_path)

    # Pre-initialize mock transport
    from mock_transport import MockTransportCapture, _mock_transport_capture
    import mock_transport as mt

    mt._mock_transport_capture = MockTransportCapture()

    mock_transport_instance = create_mock_transport(
        options={"dsn": os.getenv("SENTRY_DSN", "https://public@127.0.0.1/1")}
    )

    # Initialize Sentry with Google GenAI integration
    sentry_sdk.init(
        dsn=os.getenv("SENTRY_DSN", "https://public@127.0.0.1/1"),
        traces_sample_rate=1.0,
        transport=mock_transport_instance,
        send_default_pii=True,
        integrations=[
            GoogleGenAIIntegration(
                include_prompts=True,
            ),
        ],
    )

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
    print("🧹 Tearing down Google GenAI SDK tests...")
    sentry_sdk.flush(timeout=2.0)


def get_mock_sentry_transport():
    """Helper to get mock transport for assertions"""
    return get_mock_transport()
