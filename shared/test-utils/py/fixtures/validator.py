"""
Fixture validator - validates captured Sentry data against fixtures
"""

from typing import List, Dict, Any
from .fixture_loader import load_fixture


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


def attribute_matches(span: Dict[str, Any], attribute_name: str, value: Any) -> bool:
    """Check if a span has an attribute with a specific value"""
    attr_value = get_attribute(span, attribute_name)
    return attr_value is not None and attr_value == value


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
        op: Operation name (string) or list of operation names to search for
        required_attributes: Optional dict of attributes to filter by

    Returns:
        The matching span

    Raises:
        ValueError: If zero or multiple spans found
    """
    # Normalize op to a list
    op_list = [op] if isinstance(op, str) else op

    # Filter by operation name(s)
    matching = [s for s in spans if s.get("op") in op_list]

    # Further filter by attributes if specified
    if required_attributes:
        matching = [s for s in matching if contains_attributes(s, required_attributes)]

    if len(matching) == 0:
        op_desc = op if isinstance(op, str) else " or ".join(op)

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
            error_msg = f'Found span with op="{op_desc}" but missing required attributes'

            if required_attributes:
                error_msg += '\n  Required attributes:'
                for attr, val in required_attributes.items():
                    val_str = "(any value)" if val is True else repr(val)
                    error_msg += f'\n    - {attr}: {val_str}'

                # Show what the span actually has
                span = spans_with_op[0]
                error_msg += '\n  Span\'s actual attributes:'
                span_data = span.get("data", {})
                if span_data:
                    for key, value in span_data.items():
                        error_msg += f'\n    - {key}: {repr(value)}'
                else:
                    error_msg += '\n    (no attributes)'

            raise ValueError(error_msg)

    if len(matching) > 1:
        op_desc = op if isinstance(op, str) else " or ".join(op)
        error_msg = f'Found {len(matching)} spans matching op="{op_desc}", expected exactly 1'

        error_msg += '\n  Matching spans:'
        for i, s in enumerate(matching, 1):
            span_id = s.get("span_id", "?")[:8]
            error_msg += f'\n    {i}. op="{s.get("op")}" span_id={span_id}'

        raise ValueError(error_msg)

    return matching[0]


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


def validate_fixture(
    spec_id: str,
    spans: List[Dict[str, Any]],
    transactions: List[Dict[str, Any]],
    events: List[Dict[str, Any]] = None,
    variant: str = "agentic",
) -> Dict[str, Any]:
    """
    Validate captured Sentry data against a fixture

    Args:
        spec_id: The spec ID (e.g., "1-simple")
        spans: Captured spans
        transactions: Captured transactions
        events: Captured events (optional)
        variant: The fixture variant (e.g., "agentic", "low-level")

    Returns:
        Validation result dict with 'passed' and 'errors' keys
    """
    if events is None:
        events = []

    fixture = load_fixture(spec_id, variant)
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

            for item_expectation in items:
                try:
                    # Get span by operation and attributes
                    required_attrs = item_expectation.get("required_attributes")
                    span = get_span(spans, item_expectation["op"], required_attrs)
                    span_map[item_expectation["id"]] = span

                    # Validate required attributes (they were already used to find the span,
                    # but we still need to check individual ones for error messages)
                    if required_attrs:
                        if not contains_attributes(span, required_attrs):
                            # Build detailed error with span info
                            span_desc = f'Span with op="{span.get("op")}" (span_id={span.get("span_id", "?")[:8]}...)'
                            span_data = span.get("data", {})

                            # Get detailed error about which attribute failed
                            for attr, expected_value in required_attrs.items():
                                if expected_value is True:
                                    if not has_attribute(span, attr):
                                        errors.append(
                                            f'{span_desc} missing attribute: {attr}\n'
                                            f'  Available attributes: {", ".join(span_data.keys())}'
                                        )
                                else:
                                    if not attribute_matches(span, attr, expected_value):
                                        actual_value = get_attribute(span, attr)
                                        errors.append(
                                            f'{span_desc} attribute "{attr}" mismatch:\n'
                                            f'  Expected: {repr(expected_value)}\n'
                                            f'  Got: {repr(actual_value)}'
                                        )
                except Exception as e:
                    errors.append(str(e))

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
