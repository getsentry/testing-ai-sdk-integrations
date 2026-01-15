"""
Simple test for validator - verifies schema validation works
"""

import sys
import json
from pathlib import Path

# Add test utils to path
test_utils_path = Path(__file__).parent
sys.path.insert(0, str(test_utils_path))

from validator import attribute_matches

print("\n=== Python Validator Schema Tests ===\n")

passed = 0
failed = 0

# Test 1: JSON array with correct length
span = {
    "data": {
        "gen_ai.request.messages": json.dumps(
            [{"role": "system", "content": "Hello"}, {"role": "user", "content": "Hi"}]
        )
    }
}

schema = {"type": "json_array", "length": 2, "items_have": ["role", "content"]}
result = attribute_matches(span, "gen_ai.request.messages", schema)

if result == True:
    print("✓ Test 1: Exact length match (2 == 2)")
    passed += 1
else:
    print("✗ Test 1: FAILED - Should match length 2")
    failed += 1

# Test 2: JSON array with insufficient length
span = {
    "data": {"gen_ai.request.messages": json.dumps([{"role": "user", "content": "Hi"}])}
}

schema = {"type": "json_array", "min_length": 2, "items_have": ["role"]}
result = attribute_matches(span, "gen_ai.request.messages", schema)

if result == False:
    print("✓ Test 2: Min length violation (1 < 2)")
    passed += 1
else:
    print("✗ Test 2: FAILED - Should reject length < min_length")
    failed += 1

# Test 3: Missing required property in items
span = {
    "data": {
        "gen_ai.request.messages": json.dumps(
            [
                {"role": "user"},  # Missing 'content'
                {"role": "system", "content": "Hi"},
            ]
        )
    }
}

schema = {"type": "json_array", "items_have": ["role", "content"]}
result = attribute_matches(span, "gen_ai.request.messages", schema)

if result == False:
    print("✓ Test 3: Missing required property in item")
    passed += 1
else:
    print('✗ Test 3: FAILED - Should detect missing "content" property')
    failed += 1

# Test 4: Regular string matching (backward compatibility)
span = {"data": {"gen_ai.request.model": "gpt-4"}}
result = attribute_matches(span, "gen_ai.request.model", "gpt-4")

if result == True:
    print("✓ Test 4: Regular string matching still works")
    passed += 1
else:
    print("✗ Test 4: FAILED - String matching broken")
    failed += 1

# Test 5: Wildcard pattern matching (backward compatibility)
span = {"data": {"gen_ai.response.model": "gpt-4-turbo-preview"}}
result = attribute_matches(span, "gen_ai.response.model", "gpt-4*")

if result == True:
    print("✓ Test 5: Wildcard pattern matching still works")
    passed += 1
else:
    print("✗ Test 5: FAILED - Wildcard matching broken")
    failed += 1

# Test 6: Plain string (not JSON)
span = {"data": {"gen_ai.response.text": "Hello world"}}
schema = {"type": "plain_string", "min_length": 1}
result = attribute_matches(span, "gen_ai.response.text", schema)

if result == True:
    print("✓ Test 6: Plain string validation passes")
    passed += 1
else:
    print("✗ Test 6: FAILED - Plain string should pass")
    failed += 1

# Test 7: JSON string rejected as plain_string
span = {"data": {"gen_ai.response.text": "[1, 2, 3]"}}
schema = {"type": "plain_string"}
result = attribute_matches(span, "gen_ai.response.text", schema)

if result == False:
    print("✓ Test 7: JSON string rejected as plain_string")
    passed += 1
else:
    print("✗ Test 7: FAILED - Should reject JSON strings")
    failed += 1

# Test 8: Plain string with pattern
span = {"data": {"gen_ai.system": "You are a helpful assistant"}}
schema = {"type": "plain_string", "pattern": "*helpful*"}
result = attribute_matches(span, "gen_ai.system", schema)

if result == True:
    print("✓ Test 8: Plain string with pattern match")
    passed += 1
else:
    print("✗ Test 8: FAILED - Pattern should match")
    failed += 1

# Test 9: Plain string min_length violation
span = {"data": {"gen_ai.response.text": "Hi"}}
schema = {"type": "plain_string", "min_length": 10}
result = attribute_matches(span, "gen_ai.response.text", schema)

if result == False:
    print("✓ Test 9: Plain string min_length violation (2 < 10)")
    passed += 1
else:
    print("✗ Test 9: FAILED - Should reject string shorter than min_length")
    failed += 1

# ============================================================================
# Number Schema with lte Constraint Tests
# ============================================================================

print("\n--- Number Schema with lte Constraint Tests ---\n")

# Test 10: Valid lte constraint (50 <= 100)
span = {
    "data": {"gen_ai.usage.input_tokens": 100, "gen_ai.usage.input_tokens.cached": 50}
}
schema = {"type": "number", "lte": "gen_ai.usage.input_tokens"}
result = attribute_matches(span, "gen_ai.usage.input_tokens.cached", schema)

if result == True:
    print("✓ Test 10: Valid lte constraint (50 <= 100)")
    passed += 1
else:
    print("✗ Test 10: FAILED - Should pass when value <= other")
    failed += 1

# Test 11: Invalid lte constraint (100 > 50)
span = {
    "data": {"gen_ai.usage.input_tokens": 50, "gen_ai.usage.input_tokens.cached": 100}
}
schema = {"type": "number", "lte": "gen_ai.usage.input_tokens"}
result = attribute_matches(span, "gen_ai.usage.input_tokens.cached", schema)

if result == False:
    print("✓ Test 11: Invalid lte constraint detected (100 > 50)")
    passed += 1
else:
    print("✗ Test 11: FAILED - Should fail when value > other")
    failed += 1

# Test 12: Edge case - lte with equal values (100 <= 100)
span = {
    "data": {"gen_ai.usage.input_tokens": 100, "gen_ai.usage.input_tokens.cached": 100}
}
schema = {"type": "number", "lte": "gen_ai.usage.input_tokens"}
result = attribute_matches(span, "gen_ai.usage.input_tokens.cached", schema)

if result == True:
    print("✓ Test 12: Edge case - lte with equal values (100 <= 100)")
    passed += 1
else:
    print("✗ Test 12: FAILED - Should pass when value == other")
    failed += 1

# Test 13: lte constraint passes when other attribute is missing
span = {"data": {"gen_ai.usage.input_tokens.cached": 100}}
schema = {"type": "number", "lte": "gen_ai.usage.input_tokens"}
result = attribute_matches(span, "gen_ai.usage.input_tokens.cached", schema)

if result == True:
    print("✓ Test 13: lte passes when other attribute is missing")
    passed += 1
else:
    print("✗ Test 13: FAILED - Should pass when other attribute is missing")
    failed += 1

# Test 14: Number schema fails for non-number values
span = {
    "data": {
        "gen_ai.usage.input_tokens": 100,
        "gen_ai.usage.input_tokens.cached": "not a number",
    }
}
schema = {"type": "number", "lte": "gen_ai.usage.input_tokens"}
result = attribute_matches(span, "gen_ai.usage.input_tokens.cached", schema)

if result == False:
    print("✓ Test 14: Number schema fails for non-number values")
    passed += 1
else:
    print("✗ Test 14: FAILED - Should fail for non-number values")
    failed += 1

# Test 15: Number schema without lte constraint (just type check)
span = {"data": {"gen_ai.usage.input_tokens": 100}}
schema = {"type": "number"}
result = attribute_matches(span, "gen_ai.usage.input_tokens", schema)

if result == True:
    print("✓ Test 15: Number schema without lte constraint passes")
    passed += 1
else:
    print("✗ Test 15: FAILED - Should pass when only checking type")
    failed += 1

# Test 16: Valid lte for output tokens reasoning (150 <= 200)
span = {
    "data": {
        "gen_ai.usage.output_tokens": 200,
        "gen_ai.usage.output_tokens.reasoning": 150,
    }
}
schema = {"type": "number", "lte": "gen_ai.usage.output_tokens"}
result = attribute_matches(span, "gen_ai.usage.output_tokens.reasoning", schema)

if result == True:
    print("✓ Test 16: Valid lte for output tokens reasoning (150 <= 200)")
    passed += 1
else:
    print("✗ Test 16: FAILED - Should pass when value <= other")
    failed += 1

# Test 17: Invalid lte for output tokens reasoning (150 > 100)
span = {
    "data": {
        "gen_ai.usage.output_tokens": 100,
        "gen_ai.usage.output_tokens.reasoning": 150,
    }
}
schema = {"type": "number", "lte": "gen_ai.usage.output_tokens"}
result = attribute_matches(span, "gen_ai.usage.output_tokens.reasoning", schema)

if result == False:
    print("✓ Test 17: Invalid lte for output tokens reasoning detected (150 > 100)")
    passed += 1
else:
    print("✗ Test 17: FAILED - Should fail when value > other")
    failed += 1

print(f"\n{passed} passed, {failed} failed")
sys.exit(1 if failed > 0 else 0)
