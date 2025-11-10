"""
Fixture loader - loads JSON test fixtures from shared/fixtures/
"""

import json
import os
from pathlib import Path
from typing import Dict, Any


def load_fixture(spec_id: str, variant: str = "agentic") -> Dict[str, Any]:
    """
    Load a fixture by spec ID and variant

    Args:
        spec_id: The spec ID (e.g., "1-simple", "2-simple-with-error")
        variant: The fixture variant (e.g., "agentic", "low-level")

    Returns:
        The parsed fixture object

    Raises:
        FileNotFoundError: If fixture file not found
    """
    # Fixtures are in shared/specs/{spec_id}/fixture-{variant}.json
    current_dir = Path(__file__).parent
    fixture_path = current_dir / "../../../specs" / spec_id / f"fixture-{variant}.json"
    fixture_path = fixture_path.resolve()

    if not fixture_path.exists():
        raise FileNotFoundError(f"Fixture not found: {spec_id} (variant: {variant}) at {fixture_path}")

    with open(fixture_path, "r", encoding="utf-8") as f:
        return json.load(f)
