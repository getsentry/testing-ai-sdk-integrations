"""
Setup file for OpenAI SDK tests

Initializes Sentry with OpenAI-specific integrations.
"""

import os
import sys
from pathlib import Path
from dotenv import load_dotenv
import sentry_sdk

# Add test utils to path
test_utils_path = Path(__file__).parent.parent / "_test-utils"
sys.path.insert(0, str(test_utils_path))

from mock_transport import create_mock_transport, MockTransportCapture
import mock_transport as mt

# Load environment variables
env_path = Path(__file__).parent.parent.parent.parent / ".env"
load_dotenv(dotenv_path=env_path)

# Pre-initialize mock transport (required for Python)
mt._mock_transport_capture = MockTransportCapture()

mock_transport_instance = create_mock_transport(
    options={"dsn": os.getenv("SENTRY_DSN", "https://public@127.0.0.1/1")}
)

# Initialize Sentry with OpenAI integration (auto-enabled)
sentry_sdk.init(
    dsn=os.getenv("SENTRY_DSN", "https://public@127.0.0.1/1"),
    traces_sample_rate=1.0,
    transport=mock_transport_instance,
    send_default_pii=True,
    # OpenAIIntegration is enabled automatically
)
