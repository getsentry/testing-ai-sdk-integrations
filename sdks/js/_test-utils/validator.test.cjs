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

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
