"""
Setup file for Google GenAI SDK tests

This file contains lifecycle hooks that run before/after tests.
Using consolidated sdk_helpers to eliminate boilerplate.
"""

import sys
from pathlib import Path
from sentry_sdk.integrations.google_genai import GoogleGenAIIntegration

# Add test utils to path (CRITICAL - DO NOT FORGET)
test_utils_path = Path(__file__).parent.parent / "_test-utils"
sys.path.insert(0, str(test_utils_path))

from sdk_helpers import create_sdk_setup

module_exports = create_sdk_setup(
    sdk_name="Google GenAI",
    env_path="../../../../.env",
    sentry_options={
        'integrations': [
            GoogleGenAIIntegration(
                include_prompts=True,
            ),
        ],
    }
)

# Export functions for test runner
before_all = module_exports['before_all']
before_each = module_exports['before_each']
after_each = module_exports['after_each']
after_all = module_exports['after_all']
get_mock_sentry_transport = module_exports['get_mock_sentry_transport']
