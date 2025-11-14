"""
Fixture validator - validates captured Sentry data against fixtures

Includes assertion helpers for querying and verifying spans
"""

from typing import List, Dict, Any
from fixture_loader import load_fixture


# ============================================================================
# ASSERTION HELPERS
# ============================================================================

def get_attribute(span: Dict[str, Any], attribute_name: str) -> Any:
    """
    Get an attribute value from a span
    First checks span.data for the attribute, then checks span directly

    Args:
        span: The span to check
        attribute_name: Name of the attribute (e.g., "gen_ai.request.model")

    Returns:
        The attribute value, or None if not found
    """
    if not span:
        return None

    # First check in span.data (where Sentry stores span attributes)
    if "data" in span and isinstance(span["data"], dict):
        if attribute_name in span["data"]:
            return span["data"][attribute_name]

    # Then check directly on span using dot notation
    parts = attribute_name.split(".")
    current = span

    for part in parts:
        if current and isinstance(current, dict) and part in current:
            current = current[part]
        else:
            return None

    return current


def has_attribute(span: Dict[str, Any], attribute_name: str) -> bool:
    """Check if a span has an attribute (regardless of value)"""
    return get_attribute(span, attribute_name) is not None


def matches_pattern(actual_value: Any, pattern: Any) -> bool:
    """
    Check if a value matches a pattern with wildcard support

    Wildcard patterns:
    - "foo*" matches any string that begins with "foo"
    - "*foo" matches any string that ends with "foo"
    - "*foo*" matches any string that contains "foo"
    - "foo" matches exactly "foo" (no wildcards)

    Args:
        actual_value: The actual value to test
        pattern: The expected value or pattern (may contain wildcards)

    Returns:
        True if the value matches the pattern
    """
    # If pattern is not a string, use strict equality
    if not isinstance(pattern, str):
        return actual_value == pattern

    # Convert actual value to string for pattern matching
    actual_str = str(actual_value)

    # Check for wildcard patterns
    if "*" in pattern:
        # *foo* - contains
        if pattern.startswith("*") and pattern.endswith("*"):
            substring = pattern[1:-1]
            # If substring is empty (pattern is "*" or "**"), no match
            if substring == "" or substring == "*":
                return False
            return substring in actual_str
        # foo* - starts with
        elif pattern.endswith("*"):
            prefix = pattern[:-1]
            # If prefix is empty (pattern is just "*"), no match
            if prefix == "":
                return False
            return actual_str.startswith(prefix)
        # *foo - ends with
        elif pattern.startswith("*"):
            suffix = pattern[1:]
            # If suffix is empty (pattern is just "*"), no match
            if suffix == "":
                return False
            return actual_str.endswith(suffix)

    # No wildcards, use strict equality
    return actual_value == pattern


def attribute_matches(span: Dict[str, Any], attribute_name: str, value: Any) -> bool:
    """Check if a span has an attribute with a specific value"""
    attr_value = get_attribute(span, attribute_name)
    return attr_value is not None and matches_pattern(attr_value, value)


def contains_attributes(span: Dict[str, Any], attributes: Dict[str, Any]) -> bool:
    """
    Check if a span contains multiple attributes

    Args:
        span: The span to check
        attributes: Dict mapping attribute names to expected values
            - If value is True, only checks attribute presence
            - Otherwise checks attribute matches the value exactly

    Returns:
        True if all attributes match
    """
    for attr_name, expected_value in attributes.items():
        if expected_value is True:
            if not has_attribute(span, attr_name):
                return False
        else:
            if not attribute_matches(span, attr_name, expected_value):
                return False

    return True


def get_span(spans: List[Dict[str, Any]], op: Any, required_attributes: Dict[str, Any] = None) -> Dict[str, Any]:
    """
    Get a single span by operation name(s) and/or attributes
    Raises if zero or more than one span is found

    Args:
        spans: List of span objects
        op: Operation name (string), list of operation names, or dict with pattern/not
        required_attributes: Optional dict of attributes to filter by

    Returns:
        The matching span

    Raises:
        ValueError: If zero or multiple spans found
    """
    # Normalize op to a list
    if isinstance(op, dict):
        # Object format: { "pattern": "gen_ai.*", "not": ["gen_ai.invoke_agent", ...] }
        pattern = op.get("pattern")
        not_list = op.get("not", [])

        # Get all unique op values from spans that match the pattern but not in the exclusion list
        matching_ops = set()
        for s in spans:
            span_op = s.get("op")
            if span_op and matches_pattern(span_op, pattern) and span_op not in not_list:
                matching_ops.add(span_op)

        op_list = list(matching_ops)
    elif isinstance(op, str):
        op_list = [op]
    else:
        op_list = op

    # Filter by operation name(s)
    matching = [s for s in spans if s.get("op") in op_list]

    # Further filter by attributes if specified
    if required_attributes:
        matching = [s for s in matching if contains_attributes(s, required_attributes)]

    if len(matching) == 0:
        # Generate description for error messages
        if isinstance(op, dict):
            op_desc = f"{op.get('pattern')} (excluding: {', '.join(op.get('not', []))})"
        elif isinstance(op, str):
            op_desc = op
        else:
            op_desc = " or ".join(op)

        # Check if any spans with the op exist (without attribute filtering)
        spans_with_op = [s for s in spans if s.get("op") in op_list]

        if len(spans_with_op) == 0:
            # No spans with that op at all
            error_msg = f'No span found with op="{op_desc}"'
            error_msg += '\n  Available spans:'
            for i, s in enumerate(spans, 1):
                error_msg += f'\n    {i}. op="{s.get("op")}"'
            raise ValueError(error_msg)
        else:
            # Spans with that op exist, but don't match required attributes
            import os
            is_verbose = os.getenv("SENTRY_AI_TEST_VERBOSE") == "true"
            error_msg = f'Found span with op="{op_desc}" but missing required attributes'

            if required_attributes:
                span = spans_with_op[0]
                span_data = span.get("data", {})

                # Concise mode: Just show what's missing/mismatched
                if not is_verbose:
                    missing = []
                    mismatched = []

                    for attr, expected_val in required_attributes.items():
                        actual_val = get_attribute(span, attr)

                        if actual_val is None:
                            missing.append(attr)
                        elif expected_val is not True and actual_val != expected_val:
                            mismatched.append(f'{attr} (expected: {repr(expected_val)}, got: {repr(actual_val)})')

                    if missing:
                        error_msg += f'\n  Missing: {", ".join(missing)}'
                    if mismatched:
                        error_msg += f'\n  Mismatched: {", ".join(mismatched)}'
                    error_msg += '\n  (run with --verbose for full details)'
                else:
                    # Verbose mode: Show everything
                    error_msg += '\n  Required attributes:'
                    for attr, val in required_attributes.items():
                        val_str = "(any value)" if val is True else repr(val)
                        error_msg += f'\n    - {attr}: {val_str}'

                    error_msg += '\n  Span\'s actual attributes:'
                    if span_data:
                        for key, value in span_data.items():
                            error_msg += f'\n    - {key}: {repr(value)}'
                    else:
                        error_msg += '\n    (no attributes)'

            raise ValueError(error_msg)

    if len(matching) > 1:
        # Generate description for error messages
        if isinstance(op, dict):
            op_desc = f"{op.get('pattern')} (excluding: {', '.join(op.get('not', []))})"
        elif isinstance(op, str):
            op_desc = op
        else:
            op_desc = " or ".join(op)

        error_msg = f'Found {len(matching)} spans matching op="{op_desc}", expected exactly 1'

        error_msg += '\n  Matching spans:'
        for i, s in enumerate(matching, 1):
            span_id = s.get("span_id", "?")[:8]
            error_msg += f'\n    {i}. op="{s.get("op")}" span_id={span_id}'

        raise ValueError(error_msg)

    return matching[0]


def get_spans(spans: List[Dict[str, Any]], op: str) -> List[Dict[str, Any]]:
    """
    Get all spans matching an operation name

    Args:
        spans: List of span objects
        op: Operation name to search for

    Returns:
        List of matching spans (may be empty)
    """
    return [s for s in spans if s.get("op") == op]


def is_child_of(child_span: Dict[str, Any], parent_span: Dict[str, Any]) -> bool:
    """
    Check if one span is a child of another

    Args:
        child_span: The potential child span
        parent_span: The potential parent span

    Returns:
        True if child_span is a child of parent_span
    """
    if not child_span or not parent_span:
        return False

    return child_span.get("parent_span_id") == parent_span.get("span_id")


# ============================================================================
# VALIDATOR
# ============================================================================

def validate_fixture(
    spec_id: str,
    spans: List[Dict[str, Any]],
    transactions: List[Dict[str, Any]],
    events: List[Dict[str, Any]] = None,
    variant: str = "agentic",
    overrides: Dict[str, Any] = None,
) -> Dict[str, Any]:
    """
    Validate captured Sentry data against a fixture

    Args:
        spec_id: The spec ID (e.g., "1-simple")
        spans: Captured spans
        transactions: Captured transactions
        events: Captured events (optional)
        variant: The fixture variant (e.g., "agentic", "low-level")
        overrides: Optional SDK config overrides to apply to fixture expectations

    Returns:
        Validation result dict with 'passed' and 'errors' keys
    """
    if events is None:
        events = []

    # Load fixture with overrides applied
    fixture = load_fixture(spec_id, variant, overrides)
    errors = []

    # Log captured spans in verbose mode
    import os
    if os.getenv("SENTRY_AI_TEST_VERBOSE") == "true":
        print('\n    === Captured Spans (Verbose) ===')
        if len(spans) == 0:
            print('    No spans captured')
        else:
            for index, span in enumerate(spans):
                print(f'    Span {index + 1}:')
                print(f'      op: {span.get("op", "N/A")}')
                print(f'      description: {span.get("description", "N/A")}')
                print(f'      span_id: {span.get("span_id", "N/A")}')
                print(f'      parent_span_id: {span.get("parent_span_id", "N/A")}')
                if span.get("data") and len(span["data"]) > 0:
                    print(f'      data keys: {", ".join(span["data"].keys())}')
        print('    === End Captured Spans ===\n')

    # Validate transactions
    if "transactions" in fixture["expectations"]:
        min_count = fixture["expectations"]["transactions"].get("min_count")
        if min_count is not None and len(transactions) < min_count:
            errors.append(
                f"Expected at least {min_count} transaction(s), got {len(transactions)}"
            )

    # Validate spans
    if "spans" in fixture["expectations"]:
        expectations = fixture["expectations"]["spans"]
        count = expectations.get("count")
        min_count = expectations.get("min_count")
        items = expectations.get("items", [])

        # Check minimum span count
        # Note: 'count' is treated as minimum, not exact
        min_span_count = min_count if min_count is not None else count
        if min_span_count is not None and len(spans) < min_span_count:
            errors.append(f"Expected at least {min_span_count} span(s), got {len(spans)}")

        # Validate individual spans and relationships
        if items:
            span_map = {}  # id -> span object
            span_errors = {}  # id -> { expected_op, actual_op, missing: [], mismatched: [], not_found: bool }

            for item_expectation in items:
                fixture_id = item_expectation["id"]

                # Generate expected op description
                op = item_expectation["op"]
                if isinstance(op, dict):
                    expected_op = f"{op.get('pattern')} (excluding: {', '.join(op.get('not', []))})"
                elif isinstance(op, list):
                    expected_op = " or ".join(op)
                else:
                    expected_op = op

                try:
                    # Get span by operation and attributes
                    required_attrs = item_expectation.get("required_attributes")
                    span = get_span(spans, item_expectation["op"], required_attrs)
                    span_map[fixture_id] = span

                    # Validate required attributes and collect errors
                    if required_attrs:
                        if fixture_id not in span_errors:
                            span_errors[fixture_id] = {"expected_op": expected_op, "actual_op": span.get("op"), "missing": [], "mismatched": []}

                        span_error = span_errors[fixture_id]

                        for attr, expected_value in required_attrs.items():
                            if expected_value is True:
                                if not has_attribute(span, attr):
                                    span_error["missing"].append(attr)
                            else:
                                if not attribute_matches(span, attr, expected_value):
                                    actual_value = get_attribute(span, attr)
                                    span_error["mismatched"].append({
                                        "attr": attr,
                                        "expected": expected_value,
                                        "actual": actual_value
                                    })
                except Exception as e:
                    error_msg = str(e)
                    # getSpan threw an error - check if it's about missing attributes or missing span
                    if "but missing required attributes" in error_msg:
                        # Span exists but has attribute issues - extract the details
                        required_attrs = item_expectation.get("required_attributes")
                        if required_attrs:
                            # Find the span by op only (without attribute filtering)
                            op_list = item_expectation["op"] if isinstance(item_expectation["op"], list) else [item_expectation["op"]]
                            matching_span = next((s for s in spans if s.get("op") in op_list), None)

                            if matching_span:
                                if fixture_id not in span_errors:
                                    span_errors[fixture_id] = {"expected_op": expected_op, "actual_op": matching_span.get("op"), "missing": [], "mismatched": []}

                                span_error = span_errors[fixture_id]

                                # Check each attribute
                                for attr, expected_value in required_attrs.items():
                                    if expected_value is True:
                                        if not has_attribute(matching_span, attr):
                                            span_error["missing"].append(attr)
                                    else:
                                        if not attribute_matches(matching_span, attr, expected_value):
                                            actual_value = get_attribute(matching_span, attr)
                                            span_error["mismatched"].append({
                                                "attr": attr,
                                                "expected": expected_value,
                                                "actual": actual_value
                                            })
                    elif "No span found with op=" in error_msg:
                        # Span doesn't exist at all
                        if fixture_id not in span_errors:
                            span_errors[fixture_id] = {"expected_op": expected_op, "actual_op": None, "missing": [], "mismatched": [], "not_found": True}
                    else:
                        # Other error - just append it
                        errors.append(error_msg)

            # Format span errors in a structured way
            for fixture_id, error_details in span_errors.items():
                if error_details.get("not_found"):
                    errors.append(f"    {fixture_id} (expected: {error_details['expected_op']}): span not found")
                elif error_details["missing"] or error_details["mismatched"]:
                    error_msg = f"    {fixture_id} ({error_details['actual_op']}):"

                    for attr in error_details["missing"]:
                        error_msg += f"\n       {attr}: missing"

                    for mismatch in error_details["mismatched"]:
                        error_msg += f'\n       {mismatch["attr"]}: mismatch (expected: {repr(mismatch["expected"])}, got: {repr(mismatch["actual"])})'

                    errors.append(error_msg)

            # Validate parent-child relationships
            for item_expectation in items:
                if "parent" in item_expectation:
                    child_span = span_map.get(item_expectation["id"])
                    parent_span = span_map.get(item_expectation["parent"])

                    if child_span and parent_span:
                        if not is_child_of(child_span, parent_span):
                            errors.append(
                                f'Span with op="{item_expectation["op"]}" should be child of '
                                f'span with id="{item_expectation["parent"]}"'
                            )

    # Validate events
    if "events" in fixture["expectations"]:
        error_count = fixture["expectations"]["events"].get("error_count")
        if error_count is not None:
            actual_error_count = len(
                [e for e in events if e.get("level") == "error"]
            )
            if actual_error_count != error_count:
                errors.append(
                    f"Expected {error_count} error event(s), got {actual_error_count}"
                )

    return {"passed": len(errors) == 0, "errors": errors, "fixture": fixture}
