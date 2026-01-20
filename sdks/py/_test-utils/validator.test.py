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

# ============================================================================
# Optional Schema Attribute Tests
# ============================================================================

print("\n--- Optional Schema Attribute Tests ---\n")

# Test 18: Optional attribute missing - should pass
span = {
    "data": {
        "gen_ai.usage.input_tokens": 100
        # gen_ai.usage.input_tokens.cached is NOT present
    }
}
schema = {"type": "number", "lte": "gen_ai.usage.input_tokens", "optional": True}
result = attribute_matches(span, "gen_ai.usage.input_tokens.cached", schema)

if result == True:
    print("✓ Test 18: Optional attribute missing - passes")
    passed += 1
else:
    print("✗ Test 18: FAILED - Should pass when optional attribute is missing")
    failed += 1

# Test 19: Optional attribute present and valid - should pass
span = {
    "data": {
        "gen_ai.usage.input_tokens": 100,
        "gen_ai.usage.input_tokens.cached": 50,
    }
}
schema = {"type": "number", "lte": "gen_ai.usage.input_tokens", "optional": True}
result = attribute_matches(span, "gen_ai.usage.input_tokens.cached", schema)

if result == True:
    print("✓ Test 19: Optional attribute present and valid (50 <= 100) - passes")
    passed += 1
else:
    print(
        "✗ Test 19: FAILED - Should pass when optional attribute is present and valid"
    )
    failed += 1

# Test 20: Optional attribute present but invalid - should fail
span = {
    "data": {
        "gen_ai.usage.input_tokens": 50,
        "gen_ai.usage.input_tokens.cached": 100,  # Invalid: 100 > 50
    }
}
schema = {"type": "number", "lte": "gen_ai.usage.input_tokens", "optional": True}
result = attribute_matches(span, "gen_ai.usage.input_tokens.cached", schema)

if result == False:
    print("✓ Test 20: Optional attribute present but invalid (100 > 50) - fails")
    passed += 1
else:
    print(
        "✗ Test 20: FAILED - Should fail when optional attribute is present but invalid"
    )
    failed += 1

# Test 21: Required (non-optional) attribute missing - should fail
span = {
    "data": {
        "gen_ai.usage.input_tokens": 100
        # gen_ai.usage.input_tokens.cached is NOT present
    }
}
schema = {"type": "number", "lte": "gen_ai.usage.input_tokens"}  # No optional: True
result = attribute_matches(span, "gen_ai.usage.input_tokens.cached", schema)

if result == False:
    print("✓ Test 21: Required (non-optional) attribute missing - fails")
    passed += 1
else:
    print("✗ Test 21: FAILED - Should fail when required attribute is missing")
    failed += 1

# Test 22: Optional with json_array type - missing attribute
span = {
    "data": {
        # gen_ai.request.messages is NOT present
    }
}
schema = {"type": "json_array", "min_length": 1, "optional": True}
result = attribute_matches(span, "gen_ai.request.messages", schema)

if result == True:
    print("✓ Test 22: Optional json_array attribute missing - passes")
    passed += 1
else:
    print(
        "✗ Test 22: FAILED - Should pass when optional json_array attribute is missing"
    )
    failed += 1

# Test 23: Optional with plain_string type - missing attribute
span = {
    "data": {
        # gen_ai.response.text is NOT present
    }
}
schema = {"type": "plain_string", "min_length": 1, "optional": True}
result = attribute_matches(span, "gen_ai.response.text", schema)

if result == True:
    print("✓ Test 23: Optional plain_string attribute missing - passes")
    passed += 1
else:
    print(
        "✗ Test 23: FAILED - Should pass when optional plain_string attribute is missing"
    )
    failed += 1

# ============================================================================
# JSON Array length_lte Constraint Tests
# ============================================================================

print("\n--- JSON Array length_lte Constraint Tests ---\n")

# Test 24: Valid length_lte constraint (array length 2 <= original_length 5)
span = {
    "data": {
        "gen_ai.request.messages": json.dumps(
            [{"role": "system", "content": "Hello"}, {"role": "user", "content": "Hi"}]
        ),
        "gen_ai.request.messages.original_length": 5,
    }
}
schema = {"type": "json_array", "length_lte": "gen_ai.request.messages.original_length"}
result = attribute_matches(span, "gen_ai.request.messages", schema)

if result == True:
    print(
        "✓ Test 24: Valid length_lte constraint (array length 2 <= original_length 5)"
    )
    passed += 1
else:
    print("✗ Test 24: FAILED - Should pass when array length <= other attribute")
    failed += 1

# Test 25: Invalid length_lte constraint (array length 3 > original_length 2)
span = {
    "data": {
        "gen_ai.request.messages": json.dumps(
            [
                {"role": "system", "content": "Hello"},
                {"role": "user", "content": "Hi"},
                {"role": "assistant", "content": "Bye"},
            ]
        ),
        "gen_ai.request.messages.original_length": 2,
    }
}
schema = {"type": "json_array", "length_lte": "gen_ai.request.messages.original_length"}
result = attribute_matches(span, "gen_ai.request.messages", schema)

if result == False:
    print(
        "✓ Test 25: Invalid length_lte constraint detected (array length 3 > original_length 2)"
    )
    passed += 1
else:
    print("✗ Test 25: FAILED - Should fail when array length > other attribute")
    failed += 1

# Test 26: Edge case - length_lte with equal values (array length 3 <= original_length 3)
span = {
    "data": {
        "gen_ai.request.messages": json.dumps(
            [
                {"role": "system", "content": "Hello"},
                {"role": "user", "content": "Hi"},
                {"role": "assistant", "content": "Bye"},
            ]
        ),
        "gen_ai.request.messages.original_length": 3,
    }
}
schema = {"type": "json_array", "length_lte": "gen_ai.request.messages.original_length"}
result = attribute_matches(span, "gen_ai.request.messages", schema)

if result == True:
    print(
        "✓ Test 26: Edge case - length_lte with equal values (array length 3 <= original_length 3)"
    )
    passed += 1
else:
    print("✗ Test 26: FAILED - Should pass when array length == other attribute")
    failed += 1

# Test 27: length_lte passes when other attribute is missing
span = {
    "data": {
        "gen_ai.request.messages": json.dumps([{"role": "user", "content": "Hi"}])
        # gen_ai.request.messages.original_length is NOT present
    }
}
schema = {"type": "json_array", "length_lte": "gen_ai.request.messages.original_length"}
result = attribute_matches(span, "gen_ai.request.messages", schema)

if result == True:
    print("✓ Test 27: length_lte passes when other attribute is missing")
    passed += 1
else:
    print("✗ Test 27: FAILED - Should pass when other attribute is missing")
    failed += 1

# Test 28: length_lte combined with items_have
span = {
    "data": {
        "gen_ai.request.messages": json.dumps(
            [{"role": "system", "content": "Hello"}, {"role": "user", "content": "Hi"}]
        ),
        "gen_ai.request.messages.original_length": 5,
    }
}
schema = {
    "type": "json_array",
    "length_lte": "gen_ai.request.messages.original_length",
    "items_have": ["role", "content"],
}
result = attribute_matches(span, "gen_ai.request.messages", schema)

if result == True:
    print("✓ Test 28: length_lte combined with items_have - passes")
    passed += 1
else:
    print("✗ Test 28: FAILED - Should pass with valid length_lte and items_have")
    failed += 1

# Test 29: length_lte passes but items_have fails
span = {
    "data": {
        "gen_ai.request.messages": json.dumps(
            [
                {"role": "system"},  # Missing 'content'
                {"role": "user", "content": "Hi"},
            ]
        ),
        "gen_ai.request.messages.original_length": 5,
    }
}
schema = {
    "type": "json_array",
    "length_lte": "gen_ai.request.messages.original_length",
    "items_have": ["role", "content"],
}
result = attribute_matches(span, "gen_ai.request.messages", schema)

if result == False:
    print("✓ Test 29: length_lte passes but items_have fails - overall fails")
    passed += 1
else:
    print("✗ Test 29: FAILED - Should fail when items_have validation fails")
    failed += 1

# ============================================================================
# JSON Array contains Constraint Tests
# ============================================================================

print("\n--- JSON Array contains Constraint Tests ---\n")

# Test 30: Valid contains - JSON string contains "[Blob substitute]"
span = {
    "data": {
        "gen_ai.request.messages": json.dumps(
            [
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": "Describe this image"},
                        {"type": "image", "data": "[Blob substitute]"},
                    ],
                }
            ]
        )
    }
}
schema = {"type": "json_array", "contains": "[Blob substitute]"}
result = attribute_matches(span, "gen_ai.request.messages", schema)

if result == True:
    print('✓ Test 30: Valid contains - JSON string contains "[Blob substitute]"')
    passed += 1
else:
    print("✗ Test 30: FAILED - Should pass when JSON contains the substring")
    failed += 1

# Test 31: Invalid contains - JSON string does not contain "[Blob substitute]"
span = {
    "data": {
        "gen_ai.request.messages": json.dumps(
            [{"role": "user", "content": "Hello world"}]
        )
    }
}
schema = {"type": "json_array", "contains": "[Blob substitute]"}
result = attribute_matches(span, "gen_ai.request.messages", schema)

if result == False:
    print(
        '✓ Test 31: Invalid contains - JSON string does not contain "[Blob substitute]"'
    )
    passed += 1
else:
    print("✗ Test 31: FAILED - Should fail when JSON does not contain the substring")
    failed += 1

# Test 32: contains combined with min_length
span = {
    "data": {
        "gen_ai.request.messages": json.dumps(
            [
                {"role": "system", "content": "You are helpful"},
                {"role": "user", "content": "[Blob substitute]"},
            ]
        )
    }
}
schema = {"type": "json_array", "min_length": 2, "contains": "[Blob substitute]"}
result = attribute_matches(span, "gen_ai.request.messages", schema)

if result == True:
    print("✓ Test 32: contains combined with min_length - passes")
    passed += 1
else:
    print("✗ Test 32: FAILED - Should pass with valid contains and min_length")
    failed += 1

# Test 33: contains passes but min_length fails
span = {
    "data": {
        "gen_ai.request.messages": json.dumps(
            [{"role": "user", "content": "[Blob substitute]"}]
        )
    }
}
schema = {"type": "json_array", "min_length": 3, "contains": "[Blob substitute]"}
result = attribute_matches(span, "gen_ai.request.messages", schema)

if result == False:
    print("✓ Test 33: contains passes but min_length fails - overall fails")
    passed += 1
else:
    print("✗ Test 33: FAILED - Should fail when min_length validation fails")
    failed += 1

print(f"\n{passed} passed, {failed} failed")
sys.exit(1 if failed > 0 else 0)
