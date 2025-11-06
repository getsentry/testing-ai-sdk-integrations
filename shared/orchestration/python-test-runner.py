#!/usr/bin/env python3
"""
Python Test Runner - Executes Python test cases with lifecycle hooks

This script is used by the TypeScript orchestration tool to run Python tests.
It properly handles setup.py lifecycle hooks in the same Python process as the test.

Usage:
    python python-test-runner.py <sdk_path> <test_file_path>
"""

import sys
import asyncio
from pathlib import Path


def main():
    if len(sys.argv) < 3:
        print("Usage: python python-test-runner.py <sdk_path> <test_file_path>")
        sys.exit(1)

    sdk_path = Path(sys.argv[1]).resolve()
    test_file_path = Path(sys.argv[2]).resolve()

    # Add SDK directory to path so we can import setup
    sys.path.insert(0, str(sdk_path))

    # Import setup module
    import setup

    try:
        # Run beforeAll hook
        if hasattr(setup, "before_all"):
            setup.before_all()

        # Run beforeEach hook
        if hasattr(setup, "before_each"):
            setup.before_each()

        # Import and run the test case
        # We need to add the cases directory to path temporarily
        cases_dir = test_file_path.parent
        sys.path.insert(0, str(cases_dir))

        # Import the test module
        test_module_name = test_file_path.stem
        test_module = __import__(test_module_name)

        # Run the test function - let it handle its own logic
        if not hasattr(test_module, "main"):
            print(f"ERROR: Test module {test_module_name} has no main() function", file=sys.stderr)
            sys.exit(1)

        # Create a transaction for this test (like JS tests do)
        import sentry_sdk
        with sentry_sdk.start_transaction(op="test", name=f"{test_module_name}"):
            if asyncio.iscoroutinefunction(test_module.main):
                asyncio.run(test_module.main())
            else:
                test_module.main()

        # Flush Sentry to ensure all events are sent to transport
        sentry_sdk.flush(timeout=2.0)

        # Run assertions if they exist (should be called after transaction completes)
        if hasattr(test_module, "assert_sentry"):
            if asyncio.iscoroutinefunction(test_module.assert_sentry):
                asyncio.run(test_module.assert_sentry())
            else:
                test_module.assert_sentry()

        # Run afterEach hook
        if hasattr(setup, "after_each"):
            setup.after_each()

        # Run afterAll hook
        if hasattr(setup, "after_all"):
            setup.after_all()

    except Exception as e:
        # Ensure cleanup hooks run even on failure
        if hasattr(setup, "after_each"):
            try:
                setup.after_each()
            except Exception:
                pass

        if hasattr(setup, "after_all"):
            try:
                setup.after_all()
            except Exception:
                pass

        # Print error message cleanly without full traceback
        print(f"\n✗ Test failed: {str(e)}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
