"""
Fixtures - Test fixture system for validating Sentry captures

Usage:
    from shared.test_utils.py.fixtures import load_fixture, validate_fixture

    fixture = load_fixture('G1')
    result = validate_fixture('G1', spans, transactions)
    assert result['passed'], result['errors']
"""

from .fixture_loader import load_fixture
from .validator import validate_fixture

__all__ = ['load_fixture', 'validate_fixture']
