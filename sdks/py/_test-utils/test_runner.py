"""
Test runner helper - orchestrates test execution with minimal boilerplate
"""

import asyncio
import sentry_sdk
from fixture_loader import load_fixture
from validator import validate_fixture
from mock_transport import get_mock_transport


def run_test_case(spec_id, test_logic):
    """
    Run a test case with automatic fixture loading, span wrapping, and validation

    Args:
        spec_id: Test spec ID (e.g., "1-simple")
        test_logic: Async function containing SDK-specific test logic

    Returns:
        Dict with main() and assert_sentry() functions for test runner
    """

    async def main():
        """Main test case entry point"""
        import os
        import json

        sdk_path = os.getenv("SDK_PATH", "unknown")

        # Load SDK config from environment
        sdk_config_json = os.getenv("SDK_CONFIG")
        sdk_config = json.loads(sdk_config_json) if sdk_config_json else None

        if not sdk_config or "framework_type" not in sdk_config:
            raise Exception(
                "SDK_CONFIG with framework_type must be provided via environment variable"
            )

        framework_type = sdk_config["framework_type"]

        # Load config overrides from environment
        overrides_json = os.getenv("SDK_CONFIG_OVERRIDES")
        overrides = json.loads(overrides_json) if overrides_json else None

        # Load fixture inputs with overrides applied
        fixture = load_fixture(spec_id, framework_type, overrides)

        # Log with test name from fixture
        print(f"\n  [{sdk_path}]")
        print(f"    Running {spec_id}: {fixture.get('name', spec_id)}")

        # Run test logic
        await test_logic(fixture["inputs"])

    async def assert_sentry():
        """Verify Sentry captured the expected data"""
        # Flush and wait for transport
        sentry_sdk.flush(timeout=2.0)
        await asyncio.sleep(0.05)

        # Load SDK config from environment
        import os
        import json
        sdk_config_json = os.getenv("SDK_CONFIG")
        sdk_config = json.loads(sdk_config_json) if sdk_config_json else None

        if not sdk_config or "framework_type" not in sdk_config:
            raise Exception(
                "SDK_CONFIG with framework_type must be provided via environment variable"
            )

        framework_type = sdk_config["framework_type"]

        # Load config overrides from environment
        overrides_json = os.getenv("SDK_CONFIG_OVERRIDES")
        overrides = json.loads(overrides_json) if overrides_json else None

        # Get transport data
        transport = get_mock_transport()
        spans = transport.get_spans()
        transactions = transport.get_transactions()
        events = transport.get_events()

        print(
            f"    Captured: {len(spans)} spans, {len(transactions)} transactions, {len(events)} events"
        )

        # Validate with overrides
        result = validate_fixture(
            spec_id, spans, transactions, events, framework_type, overrides
        )

        if not result["passed"]:
            print("    ✗ Validation failed:")
            for error in result["errors"]:
                print(f"      - {error}")
            raise Exception(
                f"Fixture validation failed:\n" + "\n".join(result["errors"])
            )

        print("    ✓ All fixture validations passed")
        print(f"    ✓ {spec_id} completed")

    return {"main": main, "assert_sentry": assert_sentry}
