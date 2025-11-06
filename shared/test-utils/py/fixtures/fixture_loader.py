"""
Fixture loader - loads JSON test fixtures from shared/fixtures/
"""

import json
import os
from pathlib import Path
from typing import Dict, Any


def load_fixture(spec_id: str) -> Dict[str, Any]:
    """
    Load a fixture by spec ID

    Args:
        spec_id: The spec ID (e.g., "G1", "G2", "S1")

    Returns:
        The parsed fixture object

    Raises:
        FileNotFoundError: If fixture file not found
    """
    # Fixtures are in shared/fixtures/ (language-agnostic)
    current_dir = Path(__file__).parent
    fixture_path = current_dir / "../../../fixtures" / f"{spec_id}.json"
    fixture_path = fixture_path.resolve()

    if not fixture_path.exists():
        raise FileNotFoundError(f"Fixture not found: {spec_id}.json at {fixture_path}")

    with open(fixture_path, "r", encoding="utf-8") as f:
        return json.load(f)
