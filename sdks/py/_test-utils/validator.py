"""
Fixture validator - validates captured Sentry data against fixtures

Includes assertion helpers for querying and verifying spans
"""

import json
from typing import List, Dict, Any
from fixture_loader import load_fixture

# Public API
__all__ = ["validate_fixture", "attribute_matches"]


# ============================================================================
# ASSERTION HELPERS
# ============================================================================


def format_op_description(op: Any) -> str:
    """
    Format an op specification as a human-readable description

    Args:
        op: Operation specification (string, list, or dict)

    Returns:
        Human-readable description
    """
    if isinstance(op, dict):
        not_list = op.get("not", [])
        return f"{op.get('pattern')} (excluding: {', '.join(not_list)})"
    elif isinstance(op, list):
        return " or ".join(op)
    else:
        return op


def normalize_op_to_list(op: Any, spans: List[Dict[str, Any]]) -> List[str]:
    """
    Normalize an op specification to a list of operation names

    Args:
        op: Operation specification (string, list, or dict with pattern/not)
        spans: Available spans (needed for pattern matching)

    Returns:
        List of operation names
    """
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

        return list(matching_ops)
    elif isinstance(op, str):
        return [op]
    else:
        return op


def validate_span_attributes(span: Dict[str, Any], required_attributes: Dict[str, Any]) -> Dict[str, List]:
    """
    Validate span attributes and collect errors

    Args:
        span: The span to validate
        required_attributes: Required attributes to check

    Returns:
        Dict with 'missing' and 'mismatched' arrays
    """
    errors = {"missing": [], "mismatched": []}

    for attr, expected_value in required_attributes.items():
        if expected_value is True:
            # Just check presence
            if not has_attribute(span, attr):
                errors["missing"].append(attr)
        else:
            # Check value matches
            if not attribute_matches(span, attr, expected_value):
                actual_value = get_attribute(span, attr)
                # Treat None as missing, not mismatch
                if actual_value is None:
                    errors["missing"].append(attr)
                else:
                    errors["mismatched"].append({
                        "attr": attr,
                        "expected": expected_value,
                        "actual": actual_value
                    })

    return errors


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


def validate_schema(attr_value: Any, schema: Dict[str, Any]) -> bool:
    """
    Validate an attribute against a schema object

    Args:
        attr_value: The actual attribute value
        schema: Schema object with validation rules

    Returns:
        True if value matches schema

    Supported schema formats:
        - {"type": "json_array", "min_length": 2, "items_have": ["role", "content"]}
        - {"type": "json_array", "length": 2, "items_have": ["role"]}
        - {"type": "plain_string", "min_length": 1, "pattern": "*hello*"}
    """
    if not schema or not isinstance(schema, dict):
        return False

    # Handle plain_string type
    if schema.get("type") == "plain_string":
        # Must be a string
        if not isinstance(attr_value, str):
            return False

        # Must NOT be valid JSON
        try:
            json.loads(attr_value)
            return False  # It's valid JSON, so it's not a plain string
        except (json.JSONDecodeError, ValueError):
            # Good - not JSON, it's a plain string
            pass

        # Validate min_length
        if "min_length" in schema and len(attr_value) < schema["min_length"]:
            return False

        # Validate max_length
        if "max_length" in schema and len(attr_value) > schema["max_length"]:
            return False

        # Validate pattern
        if "pattern" in schema and not matches_pattern(attr_value, schema["pattern"]):
            return False

        return True

    # Handle json_array type
    if schema.get("type") == "json_array":
        # Parse JSON if it's a string
        if isinstance(attr_value, str):
            try:
                parsed = json.loads(attr_value)
            except (json.JSONDecodeError, ValueError):
                return False  # Not valid JSON
        else:
            parsed = attr_value

        # Check if it's an array
        if not isinstance(parsed, list):
            return False

        # Validate length
        if "length" in schema and len(parsed) != schema["length"]:
            return False

        if "min_length" in schema and len(parsed) < schema["min_length"]:
            return False

        if "max_length" in schema and len(parsed) > schema["max_length"]:
            return False

        # Validate items_have (each item must have these properties)
        if "items_have" in schema and isinstance(schema["items_have"], list):
            for item in parsed:
                if not isinstance(item, dict):
                    return False
                for required_prop in schema["items_have"]:
                    if required_prop not in item:
                        return False

        return True

    # Unknown schema type
    return False


def attribute_matches(span: Dict[str, Any], attribute_name: str, value: Any) -> bool:
    """Check if a span has an attribute with a specific value"""
    attr_value = get_attribute(span, attribute_name)

    if attr_value is None:
        return False

    # Check if value is a schema object
    if isinstance(value, dict) and "type" in value:
        return validate_schema(attr_value, value)

    # Otherwise use pattern matching
    return matches_pattern(attr_value, value)


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


def get_span(spans: List[Dict[str, Any]], op: Any, required_attributes: Dict[str, Any] = None, used_spans: set = None) -> Dict[str, Any]:
    """
    Get a single span by operation name(s) and/or attributes
    Raises if zero or more than one span is found

    Args:
        spans: List of span objects
        op: Operation name (string), list of operation names, or dict with pattern/not
        required_attributes: Optional dict of attributes to filter by
        used_spans: Set of span IDs already used (for matching multiple spans in order)

    Returns:
        The matching span

    Raises:
        ValueError: If zero or multiple spans found
    """
    # Normalize op to a list of operation names
    op_list = normalize_op_to_list(op, spans)

    # Filter by operation name(s)
    matching = [s for s in spans if s.get("op") in op_list]

    # Exclude already-used spans if used_spans is provided
    if used_spans is not None:
        matching = [s for s in matching if s.get("span_id") not in used_spans]

    # Further filter by attributes if specified
    if required_attributes:
        matching = [s for s in matching if contains_attributes(s, required_attributes)]

    if len(matching) == 0:
        op_desc = format_op_description(op)

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
        # If used_spans is provided, we're matching in order - return first match
        if used_spans is not None:
            return matching[0]

        # Otherwise, multiple matches is an error
        op_desc = format_op_description(op)
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


def validate_transactions(transactions: List[Dict[str, Any]], expectations: Dict[str, Any], errors: List[str]) -> None:
    """
    Validate transaction count

    Args:
        transactions: Captured transactions
        expectations: Fixture expectations
        errors: Error list to append to
    """
    if "transactions" in expectations:
        min_count = expectations["transactions"].get("min_count")
        if min_count is not None and len(transactions) < min_count:
            errors.append(f"Expected at least {min_count} transaction(s), got {len(transactions)}")


def validate_span_counts(spans: List[Dict[str, Any]], expectations: Dict[str, Any], errors: List[str]) -> None:
    """
    Validate span count

    Args:
        spans: Captured spans
        expectations: Fixture expectations
        errors: Error list to append to
    """
    if "spans" in expectations:
        count = expectations["spans"].get("count")
        min_count = expectations["spans"].get("min_count")
        min_span_count = min_count if min_count is not None else count
        if min_span_count is not None and len(spans) < min_span_count:
            errors.append(f"Expected at least {min_span_count} span(s), got {len(spans)}")


def validate_events(events: List[Dict[str, Any]], expectations: Dict[str, Any], errors: List[str]) -> None:
    """
    Validate events

    Args:
        events: Captured events
        expectations: Fixture expectations
        errors: Error list to append to
    """
    if "events" in expectations:
        error_count = expectations["events"].get("error_count")
        if error_count is not None:
            actual_error_count = len([e for e in events if e.get("level") == "error"])
            if actual_error_count != error_count:
                errors.append(f"Expected {error_count} error event(s), got {actual_error_count}")


def validate_span_relationships(items: List[Dict[str, Any]], span_map: Dict[str, Dict[str, Any]], errors: List[str]) -> None:
    """
    Validate parent-child relationships between spans

    Args:
        items: Span item expectations from fixture
        span_map: Dict of fixture ID to matched span
        errors: Error list to append to
    """
    for item_expectation in items:
        if "parent" in item_expectation:
            child_span = span_map.get(item_expectation["id"])
            parent_span = span_map.get(item_expectation["parent"])

            if child_span and parent_span:
                if not is_child_of(child_span, parent_span):
                    errors.append(
                        f'Span with op="{format_op_description(item_expectation["op"])}" should be child of '
                        f'span with id="{item_expectation["parent"]}"'
                    )


def validate_span_items(spans: List[Dict[str, Any]], items: List[Dict[str, Any]], errors: List[str]) -> Dict[str, Dict[str, Any]]:
    """
    Validate individual span items from fixture expectations

    Args:
        spans: Captured spans
        items: Span item expectations from fixture
        errors: Error list to append to

    Returns:
        Dict of fixture ID to matched span
    """
    span_map = {}
    span_errors = {}
    used_spans = set()

    # Match each expected span
    for item_expectation in items:
        fixture_id = item_expectation["id"]
        expected_op = format_op_description(item_expectation["op"])

        try:
            # Get span by operation and attributes (pass used_spans to match in order)
            required_attrs = item_expectation.get("required_attributes")
            span = get_span(spans, item_expectation["op"], required_attrs, used_spans)
            span_map[fixture_id] = span

            # Mark this span as used
            if span.get("span_id"):
                used_spans.add(span["span_id"])

            # Validate required attributes and collect errors
            if required_attrs:
                if fixture_id not in span_errors:
                    span_errors[fixture_id] = {"expected_op": expected_op, "actual_op": span.get("op"), "missing": [], "mismatched": []}

                span_error = span_errors[fixture_id]

                # Validate attributes and collect errors
                attr_errors = validate_span_attributes(span, required_attrs)
                span_error["missing"].extend(attr_errors["missing"])
                span_error["mismatched"].extend(attr_errors["mismatched"])
        except Exception as e:
            error_msg = str(e)
            # get_span threw an error - check if it's about missing attributes or missing span
            if "but missing required attributes" in error_msg:
                # Span exists but has attribute issues - extract the details
                required_attrs = item_expectation.get("required_attributes")
                if required_attrs:
                    # Find the span by op only (without attribute filtering)
                    op_list = normalize_op_to_list(item_expectation["op"], spans)
                    matching_span = next((s for s in spans if s.get("op") in op_list), None)

                    if matching_span:
                        if fixture_id not in span_errors:
                            span_errors[fixture_id] = {"expected_op": expected_op, "actual_op": matching_span.get("op"), "missing": [], "mismatched": []}

                        span_error = span_errors[fixture_id]

                        # Validate attributes and collect errors
                        attr_errors = validate_span_attributes(matching_span, required_attrs)
                        span_error["missing"].extend(attr_errors["missing"])
                        span_error["mismatched"].extend(attr_errors["mismatched"])
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

    return span_map


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
    validate_transactions(transactions, fixture["expectations"], errors)

    # Validate span counts
    validate_span_counts(spans, fixture["expectations"], errors)

    # Validate individual spans and relationships
    if "spans" in fixture["expectations"] and "items" in fixture["expectations"]["spans"]:
        items = fixture["expectations"]["spans"]["items"]
        span_map = validate_span_items(spans, items, errors)
        validate_span_relationships(items, span_map, errors)

    # Validate events
    validate_events(events, fixture["expectations"], errors)

    return {"passed": len(errors) == 0, "errors": errors, "fixture": fixture}
