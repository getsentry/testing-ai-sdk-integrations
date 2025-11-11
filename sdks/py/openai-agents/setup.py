"""
Setup file for OpenAI Agents SDK tests

This file contains lifecycle hooks that run before/after tests.
Using consolidated sdk_helpers to eliminate boilerplate.
"""

import sys
from pathlib import Path
from sentry_sdk.integrations.openai import OpenAIIntegration
from sentry_sdk.integrations.openai_agents import OpenAIAgentsIntegration

# Add test utils to path
test_utils_path = Path(__file__).parent.parent / "_test-utils"
sys.path.insert(0, str(test_utils_path))

from sdk_helpers import create_sdk_setup

module_exports = create_sdk_setup(
    sdk_name="OpenAI Agents",
    env_path=".env",
    sentry_options={
        'integrations': [
            OpenAIAgentsIntegration(),
        ],
        'disabled_integrations': [OpenAIIntegration()],
    }
)

# Export functions for test runner
before_all = module_exports['before_all']
before_each = module_exports['before_each']
after_each = module_exports['after_each']
after_all = module_exports['after_all']
get_mock_sentry_transport = module_exports['get_mock_sentry_transport']
