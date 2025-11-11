"""
Fixture loader - loads JSON test fixtures from shared/specs/
"""

import json
import os
from pathlib import Path
from typing import Dict, Any, Optional
import copy


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

    # Apply overrides if provided
    return apply_overrides(fixture, overrides)
