/**
 * Simple test for validator - verifies schema validation works
 */

const { attributeMatches } = require('./validator.cjs');

console.log('\n=== JS Validator Schema Tests ===\n');

let passed = 0;
let failed = 0;

// Test 1: JSON array with correct length
{
  const span = {
    data: {
      'gen_ai.request.messages': JSON.stringify([
        { role: 'system', content: 'Hello' },
        { role: 'user', content: 'Hi' }
      ])
    }
  };

  const schema = { type: 'json_array', length: 2, items_have: ['role', 'content'] };
  const result = attributeMatches(span, 'gen_ai.request.messages', schema);

  if (result === true) {
    console.log('✓ Test 1: Exact length match (2 == 2)');
    passed++;
  } else {
    console.log('✗ Test 1: FAILED - Should match length 2');
    failed++;
  }
}

// Test 2: JSON array with insufficient length
{
  const span = {
    data: {
      'gen_ai.request.messages': JSON.stringify([
        { role: 'user', content: 'Hi' }
      ])
    }
  };

  const schema = { type: 'json_array', min_length: 2, items_have: ['role'] };
  const result = attributeMatches(span, 'gen_ai.request.messages', schema);

  if (result === false) {
    console.log('✓ Test 2: Min length violation (1 < 2)');
    passed++;
  } else {
    console.log('✗ Test 2: FAILED - Should reject length < min_length');
    failed++;
  }
}

// Test 3: Missing required property in items
{
  const span = {
    data: {
      'gen_ai.request.messages': JSON.stringify([
        { role: 'user' },  // Missing 'content'
        { role: 'system', content: 'Hi' }
      ])
    }
  };

  const schema = { type: 'json_array', items_have: ['role', 'content'] };
  const result = attributeMatches(span, 'gen_ai.request.messages', schema);

  if (result === false) {
    console.log('✓ Test 3: Missing required property in item');
    passed++;
  } else {
    console.log('✗ Test 3: FAILED - Should detect missing "content" property');
    failed++;
  }
}

// Test 4: Regular string matching (backward compatibility)
{
  const span = { data: { 'gen_ai.request.model': 'gpt-4' } };
  const result = attributeMatches(span, 'gen_ai.request.model', 'gpt-4');

  if (result === true) {
    console.log('✓ Test 4: Regular string matching still works');
    passed++;
  } else {
    console.log('✗ Test 4: FAILED - String matching broken');
    failed++;
  }
}

// Test 5: Wildcard pattern matching (backward compatibility)
{
  const span = { data: { 'gen_ai.response.model': 'gpt-4-turbo-preview' } };
  const result = attributeMatches(span, 'gen_ai.response.model', 'gpt-4*');

  if (result === true) {
    console.log('✓ Test 5: Wildcard pattern matching still works');
    passed++;
  } else {
    console.log('✗ Test 5: FAILED - Wildcard matching broken');
    failed++;
  }
}

// Test 6: Plain string (not JSON)
{
  const span = { data: { 'gen_ai.response.text': 'Hello world' } };
  const schema = { type: 'plain_string', min_length: 1 };
  const result = attributeMatches(span, 'gen_ai.response.text', schema);

  if (result === true) {
    console.log('✓ Test 6: Plain string validation passes');
    passed++;
  } else {
    console.log('✗ Test 6: FAILED - Plain string should pass');
    failed++;
  }
}

// Test 7: JSON string rejected as plain_string
{
  const span = { data: { 'gen_ai.response.text': '[1, 2, 3]' } };
  const schema = { type: 'plain_string' };
  const result = attributeMatches(span, 'gen_ai.response.text', schema);

  if (result === false) {
    console.log('✓ Test 7: JSON string rejected as plain_string');
    passed++;
  } else {
    console.log('✗ Test 7: FAILED - Should reject JSON strings');
    failed++;
  }
}

// Test 8: Plain string with pattern
{
  const span = { data: { 'gen_ai.system': 'You are a helpful assistant' } };
  const schema = { type: 'plain_string', pattern: '*helpful*' };
  const result = attributeMatches(span, 'gen_ai.system', schema);

  if (result === true) {
    console.log('✓ Test 8: Plain string with pattern match');
    passed++;
  } else {
    console.log('✗ Test 8: FAILED - Pattern should match');
    failed++;
  }
}

// Test 9: Plain string min_length violation
{
  const span = { data: { 'gen_ai.response.text': 'Hi' } };
  const schema = { type: 'plain_string', min_length: 10 };
  const result = attributeMatches(span, 'gen_ai.response.text', schema);

  if (result === false) {
    console.log('✓ Test 9: Plain string min_length violation (2 < 10)');
    passed++;
  } else {
    console.log('✗ Test 9: FAILED - Should reject string shorter than min_length');
    failed++;
  }
}

// ============================================================================
// Number Schema with lte Constraint Tests
// ============================================================================

console.log('\n--- Number Schema with lte Constraint Tests ---\n');

// Test 10: Valid lte constraint (50 <= 100)
{
  const span = {
    data: {
      'gen_ai.usage.input_tokens': 100,
      'gen_ai.usage.input_tokens.cached': 50
    }
  };
  const schema = { type: 'number', lte: 'gen_ai.usage.input_tokens' };
  const result = attributeMatches(span, 'gen_ai.usage.input_tokens.cached', schema);

  if (result === true) {
    console.log('✓ Test 10: Valid lte constraint (50 <= 100)');
    passed++;
  } else {
    console.log('✗ Test 10: FAILED - Should pass when value <= other');
    failed++;
  }
}

// Test 11: Invalid lte constraint (100 > 50)
{
  const span = {
    data: {
      'gen_ai.usage.input_tokens': 50,
      'gen_ai.usage.input_tokens.cached': 100
    }
  };
  const schema = { type: 'number', lte: 'gen_ai.usage.input_tokens' };
  const result = attributeMatches(span, 'gen_ai.usage.input_tokens.cached', schema);

  if (result === false) {
    console.log('✓ Test 11: Invalid lte constraint detected (100 > 50)');
    passed++;
  } else {
    console.log('✗ Test 11: FAILED - Should fail when value > other');
    failed++;
  }
}

// Test 12: Edge case - lte with equal values (100 <= 100)
{
  const span = {
    data: {
      'gen_ai.usage.input_tokens': 100,
      'gen_ai.usage.input_tokens.cached': 100
    }
  };
  const schema = { type: 'number', lte: 'gen_ai.usage.input_tokens' };
  const result = attributeMatches(span, 'gen_ai.usage.input_tokens.cached', schema);

  if (result === true) {
    console.log('✓ Test 12: Edge case - lte with equal values (100 <= 100)');
    passed++;
  } else {
    console.log('✗ Test 12: FAILED - Should pass when value == other');
    failed++;
  }
}

// Test 13: lte constraint passes when other attribute is missing
{
  const span = {
    data: {
      'gen_ai.usage.input_tokens.cached': 100
    }
  };
  const schema = { type: 'number', lte: 'gen_ai.usage.input_tokens' };
  const result = attributeMatches(span, 'gen_ai.usage.input_tokens.cached', schema);

  if (result === true) {
    console.log('✓ Test 13: lte passes when other attribute is missing');
    passed++;
  } else {
    console.log('✗ Test 13: FAILED - Should pass when other attribute is missing');
    failed++;
  }
}

// Test 14: Number schema fails for non-number values
{
  const span = {
    data: {
      'gen_ai.usage.input_tokens': 100,
      'gen_ai.usage.input_tokens.cached': 'not a number'
    }
  };
  const schema = { type: 'number', lte: 'gen_ai.usage.input_tokens' };
  const result = attributeMatches(span, 'gen_ai.usage.input_tokens.cached', schema);

  if (result === false) {
    console.log('✓ Test 14: Number schema fails for non-number values');
    passed++;
  } else {
    console.log('✗ Test 14: FAILED - Should fail for non-number values');
    failed++;
  }
}

// Test 15: Number schema without lte constraint (just type check)
{
  const span = {
    data: {
      'gen_ai.usage.input_tokens': 100
    }
  };
  const schema = { type: 'number' };
  const result = attributeMatches(span, 'gen_ai.usage.input_tokens', schema);

  if (result === true) {
    console.log('✓ Test 15: Number schema without lte constraint passes');
    passed++;
  } else {
    console.log('✗ Test 15: FAILED - Should pass when only checking type');
    failed++;
  }
}

// Test 16: Valid lte for output tokens reasoning (150 <= 200)
{
  const span = {
    data: {
      'gen_ai.usage.output_tokens': 200,
      'gen_ai.usage.output_tokens.reasoning': 150
    }
  };
  const schema = { type: 'number', lte: 'gen_ai.usage.output_tokens' };
  const result = attributeMatches(span, 'gen_ai.usage.output_tokens.reasoning', schema);

  if (result === true) {
    console.log('✓ Test 16: Valid lte for output tokens reasoning (150 <= 200)');
    passed++;
  } else {
    console.log('✗ Test 16: FAILED - Should pass when value <= other');
    failed++;
  }
}

// Test 17: Invalid lte for output tokens reasoning (150 > 100)
{
  const span = {
    data: {
      'gen_ai.usage.output_tokens': 100,
      'gen_ai.usage.output_tokens.reasoning': 150
    }
  };
  const schema = { type: 'number', lte: 'gen_ai.usage.output_tokens' };
  const result = attributeMatches(span, 'gen_ai.usage.output_tokens.reasoning', schema);

  if (result === false) {
    console.log('✓ Test 17: Invalid lte for output tokens reasoning detected (150 > 100)');
    passed++;
  } else {
    console.log('✗ Test 17: FAILED - Should fail when value > other');
    failed++;
  }
}

// ============================================================================
// Optional Schema Attribute Tests
// ============================================================================

console.log('\n--- Optional Schema Attribute Tests ---\n');

// Test 18: Optional attribute missing - should pass
{
  const span = {
    data: {
      'gen_ai.usage.input_tokens': 100
      // gen_ai.usage.input_tokens.cached is NOT present
    }
  };
  const schema = { type: 'number', lte: 'gen_ai.usage.input_tokens', optional: true };
  const result = attributeMatches(span, 'gen_ai.usage.input_tokens.cached', schema);

  if (result === true) {
    console.log('✓ Test 18: Optional attribute missing - passes');
    passed++;
  } else {
    console.log('✗ Test 18: FAILED - Should pass when optional attribute is missing');
    failed++;
  }
}

// Test 19: Optional attribute present and valid - should pass
{
  const span = {
    data: {
      'gen_ai.usage.input_tokens': 100,
      'gen_ai.usage.input_tokens.cached': 50
    }
  };
  const schema = { type: 'number', lte: 'gen_ai.usage.input_tokens', optional: true };
  const result = attributeMatches(span, 'gen_ai.usage.input_tokens.cached', schema);

  if (result === true) {
    console.log('✓ Test 19: Optional attribute present and valid (50 <= 100) - passes');
    passed++;
  } else {
    console.log('✗ Test 19: FAILED - Should pass when optional attribute is present and valid');
    failed++;
  }
}

// Test 20: Optional attribute present but invalid - should fail
{
  const span = {
    data: {
      'gen_ai.usage.input_tokens': 50,
      'gen_ai.usage.input_tokens.cached': 100  // Invalid: 100 > 50
    }
  };
  const schema = { type: 'number', lte: 'gen_ai.usage.input_tokens', optional: true };
  const result = attributeMatches(span, 'gen_ai.usage.input_tokens.cached', schema);

  if (result === false) {
    console.log('✓ Test 20: Optional attribute present but invalid (100 > 50) - fails');
    passed++;
  } else {
    console.log('✗ Test 20: FAILED - Should fail when optional attribute is present but invalid');
    failed++;
  }
}

// Test 21: Required (non-optional) attribute missing - should fail
{
  const span = {
    data: {
      'gen_ai.usage.input_tokens': 100
      // gen_ai.usage.input_tokens.cached is NOT present
    }
  };
  const schema = { type: 'number', lte: 'gen_ai.usage.input_tokens' };  // No optional: true
  const result = attributeMatches(span, 'gen_ai.usage.input_tokens.cached', schema);

  if (result === false) {
    console.log('✓ Test 21: Required (non-optional) attribute missing - fails');
    passed++;
  } else {
    console.log('✗ Test 21: FAILED - Should fail when required attribute is missing');
    failed++;
  }
}

// Test 22: Optional with json_array type - missing attribute
{
  const span = {
    data: {
      // gen_ai.request.messages is NOT present
    }
  };
  const schema = { type: 'json_array', min_length: 1, optional: true };
  const result = attributeMatches(span, 'gen_ai.request.messages', schema);

  if (result === true) {
    console.log('✓ Test 22: Optional json_array attribute missing - passes');
    passed++;
  } else {
    console.log('✗ Test 22: FAILED - Should pass when optional json_array attribute is missing');
    failed++;
  }
}

// Test 23: Optional with plain_string type - missing attribute
{
  const span = {
    data: {
      // gen_ai.response.text is NOT present
    }
  };
  const schema = { type: 'plain_string', min_length: 1, optional: true };
  const result = attributeMatches(span, 'gen_ai.response.text', schema);

  if (result === true) {
    console.log('✓ Test 23: Optional plain_string attribute missing - passes');
    passed++;
  } else {
    console.log('✗ Test 23: FAILED - Should pass when optional plain_string attribute is missing');
    failed++;
  }
}

// ============================================================================
// JSON Array length_lte Constraint Tests
// ============================================================================

console.log('\n--- JSON Array length_lte Constraint Tests ---\n');

// Test 24: Valid length_lte constraint (array length 2 <= original_length 5)
{
  const span = {
    data: {
      'gen_ai.request.messages': JSON.stringify([
        { role: 'system', content: 'Hello' },
        { role: 'user', content: 'Hi' }
      ]),
      'gen_ai.request.messages.original_length': 5
    }
  };
  const schema = { type: 'json_array', length_lte: 'gen_ai.request.messages.original_length' };
  const result = attributeMatches(span, 'gen_ai.request.messages', schema);

  if (result === true) {
    console.log('✓ Test 24: Valid length_lte constraint (array length 2 <= original_length 5)');
    passed++;
  } else {
    console.log('✗ Test 24: FAILED - Should pass when array length <= other attribute');
    failed++;
  }
}

// Test 25: Invalid length_lte constraint (array length 3 > original_length 2)
{
  const span = {
    data: {
      'gen_ai.request.messages': JSON.stringify([
        { role: 'system', content: 'Hello' },
        { role: 'user', content: 'Hi' },
        { role: 'assistant', content: 'Bye' }
      ]),
      'gen_ai.request.messages.original_length': 2
    }
  };
  const schema = { type: 'json_array', length_lte: 'gen_ai.request.messages.original_length' };
  const result = attributeMatches(span, 'gen_ai.request.messages', schema);

  if (result === false) {
    console.log('✓ Test 25: Invalid length_lte constraint detected (array length 3 > original_length 2)');
    passed++;
  } else {
    console.log('✗ Test 25: FAILED - Should fail when array length > other attribute');
    failed++;
  }
}

// Test 26: Edge case - length_lte with equal values (array length 3 <= original_length 3)
{
  const span = {
    data: {
      'gen_ai.request.messages': JSON.stringify([
        { role: 'system', content: 'Hello' },
        { role: 'user', content: 'Hi' },
        { role: 'assistant', content: 'Bye' }
      ]),
      'gen_ai.request.messages.original_length': 3
    }
  };
  const schema = { type: 'json_array', length_lte: 'gen_ai.request.messages.original_length' };
  const result = attributeMatches(span, 'gen_ai.request.messages', schema);

  if (result === true) {
    console.log('✓ Test 26: Edge case - length_lte with equal values (array length 3 <= original_length 3)');
    passed++;
  } else {
    console.log('✗ Test 26: FAILED - Should pass when array length == other attribute');
    failed++;
  }
}

// Test 27: length_lte passes when other attribute is missing
{
  const span = {
    data: {
      'gen_ai.request.messages': JSON.stringify([
        { role: 'user', content: 'Hi' }
      ])
      // gen_ai.request.messages.original_length is NOT present
    }
  };
  const schema = { type: 'json_array', length_lte: 'gen_ai.request.messages.original_length' };
  const result = attributeMatches(span, 'gen_ai.request.messages', schema);

  if (result === true) {
    console.log('✓ Test 27: length_lte passes when other attribute is missing');
    passed++;
  } else {
    console.log('✗ Test 27: FAILED - Should pass when other attribute is missing');
    failed++;
  }
}

// Test 28: length_lte combined with items_have
{
  const span = {
    data: {
      'gen_ai.request.messages': JSON.stringify([
        { role: 'system', content: 'Hello' },
        { role: 'user', content: 'Hi' }
      ]),
      'gen_ai.request.messages.original_length': 5
    }
  };
  const schema = { 
    type: 'json_array', 
    length_lte: 'gen_ai.request.messages.original_length',
    items_have: ['role', 'content']
  };
  const result = attributeMatches(span, 'gen_ai.request.messages', schema);

  if (result === true) {
    console.log('✓ Test 28: length_lte combined with items_have - passes');
    passed++;
  } else {
    console.log('✗ Test 28: FAILED - Should pass with valid length_lte and items_have');
    failed++;
  }
}

// Test 29: length_lte passes but items_have fails
{
  const span = {
    data: {
      'gen_ai.request.messages': JSON.stringify([
        { role: 'system' },  // Missing 'content'
        { role: 'user', content: 'Hi' }
      ]),
      'gen_ai.request.messages.original_length': 5
    }
  };
  const schema = { 
    type: 'json_array', 
    length_lte: 'gen_ai.request.messages.original_length',
    items_have: ['role', 'content']
  };
  const result = attributeMatches(span, 'gen_ai.request.messages', schema);

  if (result === false) {
    console.log('✓ Test 29: length_lte passes but items_have fails - overall fails');
    passed++;
  } else {
    console.log('✗ Test 29: FAILED - Should fail when items_have validation fails');
    failed++;
  }
}

// ============================================================================
// JSON Array contains Constraint Tests
// ============================================================================

console.log('\n--- JSON Array contains Constraint Tests ---\n');

// Test 30: Valid contains - JSON string contains "[Blob substitute]"
{
  const span = {
    data: {
      'gen_ai.request.messages': JSON.stringify([
        { role: 'user', content: [{ type: 'text', text: 'Describe this image' }, { type: 'image', data: '[Blob substitute]' }] }
      ])
    }
  };
  const schema = { type: 'json_array', contains: '[Blob substitute]' };
  const result = attributeMatches(span, 'gen_ai.request.messages', schema);

  if (result === true) {
    console.log('✓ Test 30: Valid contains - JSON string contains "[Blob substitute]"');
    passed++;
  } else {
    console.log('✗ Test 30: FAILED - Should pass when JSON contains the substring');
    failed++;
  }
}

// Test 31: Invalid contains - JSON string does not contain "[Blob substitute]"
{
  const span = {
    data: {
      'gen_ai.request.messages': JSON.stringify([
        { role: 'user', content: 'Hello world' }
      ])
    }
  };
  const schema = { type: 'json_array', contains: '[Blob substitute]' };
  const result = attributeMatches(span, 'gen_ai.request.messages', schema);

  if (result === false) {
    console.log('✓ Test 31: Invalid contains - JSON string does not contain "[Blob substitute]"');
    passed++;
  } else {
    console.log('✗ Test 31: FAILED - Should fail when JSON does not contain the substring');
    failed++;
  }
}

// Test 32: contains combined with min_length
{
  const span = {
    data: {
      'gen_ai.request.messages': JSON.stringify([
        { role: 'system', content: 'You are helpful' },
        { role: 'user', content: '[Blob substitute]' }
      ])
    }
  };
  const schema = { type: 'json_array', min_length: 2, contains: '[Blob substitute]' };
  const result = attributeMatches(span, 'gen_ai.request.messages', schema);

  if (result === true) {
    console.log('✓ Test 32: contains combined with min_length - passes');
    passed++;
  } else {
    console.log('✗ Test 32: FAILED - Should pass with valid contains and min_length');
    failed++;
  }
}

// Test 33: contains passes but min_length fails
{
  const span = {
    data: {
      'gen_ai.request.messages': JSON.stringify([
        { role: 'user', content: '[Blob substitute]' }
      ])
    }
  };
  const schema = { type: 'json_array', min_length: 3, contains: '[Blob substitute]' };
  const result = attributeMatches(span, 'gen_ai.request.messages', schema);

  if (result === false) {
    console.log('✓ Test 33: contains passes but min_length fails - overall fails');
    passed++;
  } else {
    console.log('✗ Test 33: FAILED - Should fail when min_length validation fails');
    failed++;
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
