"""
Fixture loader - loads JSON test fixtures from shared/specs/
"""

import json
import os
from pathlib import Path
from typing import Dict, Any, Optional
import copy

# Cache for common spans
_common_spans_cache = None


def load_common_spans() -> Dict[str, Any]:
    """
    Load common span definitions

    Returns:
        Common span definitions
    """
    global _common_spans_cache

    if _common_spans_cache is not None:
        return _common_spans_cache

    current_dir = Path(__file__).parent
    common_spans_path = current_dir / "../../../shared/specs/common-spans.json"
    common_spans_path = common_spans_path.resolve()

    if not common_spans_path.exists():
        return {}

    with open(common_spans_path, "r", encoding="utf-8") as f:
        _common_spans_cache = json.load(f)

    return _common_spans_cache


def resolve_ref(span_item: Dict[str, Any], common_spans: Dict[str, Any]) -> Dict[str, Any]:
    """
    Resolve $ref in a span item

    Args:
        span_item: Span item that may contain $ref
        common_spans: Common span definitions

    Returns:
        Resolved span item
    """
    if "$ref" not in span_item:
        return span_item

    # Parse $ref format: "common-spans#/span_name"
    ref = span_item["$ref"]
    if not ref.startswith("common-spans#/"):
        raise ValueError(f'Invalid $ref format: {ref}. Expected format: "common-spans#/span_name"')

    span_name = ref[len("common-spans#/"):]
    common_span = common_spans.get(span_name)

    if not common_span:
        raise ValueError(f"Common span not found: {span_name}")

    # Merge common span with overrides from the reference
    # Properties in span_item (except $ref) override common span properties
    overrides = {k: v for k, v in span_item.items() if k != "$ref"}
    return {**common_span, **overrides}


def apply_overrides(fixture: Dict[str, Any], overrides: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Apply overrides to a fixture object

    Args:
        fixture: The fixture object to modify
        overrides: Key-value pairs to override in the fixture

    Returns:
        The modified fixture object
    """
    if not overrides or len(overrides) == 0:
        return fixture

    # Deep clone to avoid mutating original
    result = copy.deepcopy(fixture)

    for key, value in overrides.items():
        # Handle special "model" shorthand - applies to inputs.model
        if key == "model":
            if "inputs" in result:
                result["inputs"]["model"] = value
            continue

        # Handle dot-notation paths in expectations (e.g., "gen_ai.request.model")
        # These override values in required_attributes
        if "expectations" in result and "spans" in result["expectations"]:
            if "items" in result["expectations"]["spans"]:
                for span_item in result["expectations"]["spans"]["items"]:
                    if "required_attributes" in span_item and key in span_item["required_attributes"]:
                        span_item["required_attributes"][key] = value

    return result


def load_fixture(spec_id: str, variant: str = "agentic", overrides: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """
    Load a fixture by spec ID and variant

    Args:
        spec_id: The spec ID (e.g., "1-simple", "2-simple-with-error")
        variant: The fixture variant (e.g., "agentic", "low-level")
        overrides: Optional key-value overrides to apply to the fixture

    Returns:
        The parsed fixture object

    Raises:
        FileNotFoundError: If fixture file not found
    """
    # Fixtures are in shared/specs/{spec_id}/fixture-{variant}.json
    # Path from sdks/py/_test-utils/ to shared/specs/
    current_dir = Path(__file__).parent
    fixture_path = current_dir / "../../../shared/specs" / spec_id / f"fixture-{variant}.json"
    fixture_path = fixture_path.resolve()

    if not fixture_path.exists():
        raise FileNotFoundError(f"Fixture not found: {spec_id} (variant: {variant}) at {fixture_path}")

    with open(fixture_path, "r", encoding="utf-8") as f:
        fixture = json.load(f)

    # Resolve $ref references in span items
    if "expectations" in fixture and "spans" in fixture["expectations"]:
        if "items" in fixture["expectations"]["spans"]:
            common_spans = load_common_spans()
            fixture["expectations"]["spans"]["items"] = [
                resolve_ref(item, common_spans)
                for item in fixture["expectations"]["spans"]["items"]
            ]

    # Apply overrides if provided
    return apply_overrides(fixture, overrides)
