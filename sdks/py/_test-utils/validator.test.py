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

print('\n=== Python Validator Schema Tests ===\n')

passed = 0
failed = 0

# Test 1: JSON array with correct length
span = {
    "data": {
        "gen_ai.request.messages": json.dumps([
            {"role": "system", "content": "Hello"},
            {"role": "user", "content": "Hi"}
        ])
    }
}

schema = {"type": "json_array", "length": 2, "items_have": ["role", "content"]}
result = attribute_matches(span, "gen_ai.request.messages", schema)

if result == True:
    print('✓ Test 1: Exact length match (2 == 2)')
    passed += 1
else:
    print('✗ Test 1: FAILED - Should match length 2')
    failed += 1

# Test 2: JSON array with insufficient length
span = {
    "data": {
        "gen_ai.request.messages": json.dumps([
            {"role": "user", "content": "Hi"}
        ])
    }
}

schema = {"type": "json_array", "min_length": 2, "items_have": ["role"]}
result = attribute_matches(span, "gen_ai.request.messages", schema)

if result == False:
    print('✓ Test 2: Min length violation (1 < 2)')
    passed += 1
else:
    print('✗ Test 2: FAILED - Should reject length < min_length')
    failed += 1

# Test 3: Missing required property in items
span = {
    "data": {
        "gen_ai.request.messages": json.dumps([
            {"role": "user"},  # Missing 'content'
            {"role": "system", "content": "Hi"}
        ])
    }
}

schema = {"type": "json_array", "items_have": ["role", "content"]}
result = attribute_matches(span, "gen_ai.request.messages", schema)

if result == False:
    print('✓ Test 3: Missing required property in item')
    passed += 1
else:
    print('✗ Test 3: FAILED - Should detect missing "content" property')
    failed += 1

# Test 4: Regular string matching (backward compatibility)
span = {"data": {"gen_ai.request.model": "gpt-4"}}
result = attribute_matches(span, "gen_ai.request.model", "gpt-4")

if result == True:
    print('✓ Test 4: Regular string matching still works')
    passed += 1
else:
    print('✗ Test 4: FAILED - String matching broken')
    failed += 1

# Test 5: Wildcard pattern matching (backward compatibility)
span = {"data": {"gen_ai.response.model": "gpt-4-turbo-preview"}}
result = attribute_matches(span, "gen_ai.response.model", "gpt-4*")

if result == True:
    print('✓ Test 5: Wildcard pattern matching still works')
    passed += 1
else:
    print('✗ Test 5: FAILED - Wildcard matching broken')
    failed += 1

# Test 6: Plain string (not JSON)
span = {"data": {"gen_ai.response.text": "Hello world"}}
schema = {"type": "plain_string", "min_length": 1}
result = attribute_matches(span, "gen_ai.response.text", schema)

if result == True:
    print('✓ Test 6: Plain string validation passes')
    passed += 1
else:
    print('✗ Test 6: FAILED - Plain string should pass')
    failed += 1

# Test 7: JSON string rejected as plain_string
span = {"data": {"gen_ai.response.text": "[1, 2, 3]"}}
schema = {"type": "plain_string"}
result = attribute_matches(span, "gen_ai.response.text", schema)

if result == False:
    print('✓ Test 7: JSON string rejected as plain_string')
    passed += 1
else:
    print('✗ Test 7: FAILED - Should reject JSON strings')
    failed += 1

# Test 8: Plain string with pattern
span = {"data": {"gen_ai.system": "You are a helpful assistant"}}
schema = {"type": "plain_string", "pattern": "*helpful*"}
result = attribute_matches(span, "gen_ai.system", schema)

if result == True:
    print('✓ Test 8: Plain string with pattern match')
    passed += 1
else:
    print('✗ Test 8: FAILED - Pattern should match')
    failed += 1

# Test 9: Plain string min_length violation
span = {"data": {"gen_ai.response.text": "Hi"}}
schema = {"type": "plain_string", "min_length": 10}
result = attribute_matches(span, "gen_ai.response.text", schema)

if result == False:
    print('✓ Test 9: Plain string min_length violation (2 < 10)')
    passed += 1
else:
    print('✗ Test 9: FAILED - Should reject string shorter than min_length')
    failed += 1

print(f'\n{passed} passed, {failed} failed')
sys.exit(1 if failed > 0 else 0)
