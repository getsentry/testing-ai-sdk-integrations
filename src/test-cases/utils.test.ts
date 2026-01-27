/**
 * Tests for assertAttributes utility
 */

import { assertAttributes, AttributeSchema } from './utils.js';
import { CapturedSpan } from '../types.js';

// Helper to create mock span
function createMockSpan(data: Record<string, any>): CapturedSpan {
  return {
    span_id: 'test-span-id',
    trace_id: 'test-trace-id',
    op: 'gen_ai.chat',
    description: 'Test span',
    start_timestamp: 1234567890,
    timestamp: 1234567891,
    data,
  };
}

console.log('Testing assertAttributes...\n');

// Test 1: true - attribute must exist
try {
  const spans = [createMockSpan({ 'gen_ai.request.model': 'gpt-4' })];
  const schema: AttributeSchema = { 'gen_ai.request.model': true };
  assertAttributes(spans, schema);
  console.log('✓ Test 1 passed: attribute exists');
} catch (error) {
  console.error('✗ Test 1 failed:', error instanceof Error ? error.message : error);
}

// Test 2: false - attribute must NOT exist
try {
  const spans = [createMockSpan({ 'other.attr': 'value' })];
  const schema: AttributeSchema = { 'gen_ai.request.model': false };
  assertAttributes(spans, schema);
  console.log('✓ Test 2 passed: attribute does not exist');
} catch (error) {
  console.error('✗ Test 2 failed:', error instanceof Error ? error.message : error);
}

// Test 3: Exact value match (string)
try {
  const spans = [createMockSpan({ 'gen_ai.request.model': 'gpt-4' })];
  const schema: AttributeSchema = { 'gen_ai.request.model': 'gpt-4' };
  assertAttributes(spans, schema);
  console.log('✓ Test 3 passed: exact string match');
} catch (error) {
  console.error('✗ Test 3 failed:', error instanceof Error ? error.message : error);
}

// Test 4: Exact value match (number)
try {
  const spans = [createMockSpan({ 'gen_ai.usage.input_tokens': 100 })];
  const schema: AttributeSchema = { 'gen_ai.usage.input_tokens': 100 };
  assertAttributes(spans, schema);
  console.log('✓ Test 4 passed: exact number match');
} catch (error) {
  console.error('✗ Test 4 failed:', error instanceof Error ? error.message : error);
}

// Test 5: Pattern match with wildcard
try {
  const spans = [createMockSpan({ 'gen_ai.response.model': 'gpt-4-turbo-2024-01-01' })];
  const schema: AttributeSchema = { 'gen_ai.response.model': 'gpt-4*' };
  assertAttributes(spans, schema);
  console.log('✓ Test 5 passed: wildcard pattern match');
} catch (error) {
  console.error('✗ Test 5 failed:', error instanceof Error ? error.message : error);
}

// Test 6: Pattern match with multiple wildcards
try {
  const spans = [createMockSpan({ 'gen_ai.response.model': 'gpt-4-turbo-preview' })];
  const schema: AttributeSchema = { 'gen_ai.response.model': 'gpt-*-*' };
  assertAttributes(spans, schema);
  console.log('✓ Test 6 passed: multiple wildcards');
} catch (error) {
  console.error('✗ Test 6 failed:', error instanceof Error ? error.message : error);
}

// Test 7: Should fail - attribute missing
try {
  const spans = [createMockSpan({ 'other.attr': 'value' })];
  const schema: AttributeSchema = { 'gen_ai.request.model': true };
  assertAttributes(spans, schema);
  console.error('✗ Test 7 failed: should have thrown error for missing attribute');
} catch (error) {
  console.log('✓ Test 7 passed: correctly detected missing attribute');
}

// Test 8: Should fail - attribute should not exist
try {
  const spans = [createMockSpan({ 'gen_ai.request.model': 'gpt-4' })];
  const schema: AttributeSchema = { 'gen_ai.request.model': false };
  assertAttributes(spans, schema);
  console.error('✗ Test 8 failed: should have thrown error for existing attribute');
} catch (error) {
  console.log('✓ Test 8 passed: correctly detected unwanted attribute');
}

// Test 9: Should fail - wrong value
try {
  const spans = [createMockSpan({ 'gen_ai.request.model': 'gpt-4' })];
  const schema: AttributeSchema = { 'gen_ai.request.model': 'gpt-3.5' };
  assertAttributes(spans, schema);
  console.error('✗ Test 9 failed: should have thrown error for wrong value');
} catch (error) {
  console.log('✓ Test 9 passed: correctly detected wrong value');
}

// Test 10: Should fail - pattern mismatch
try {
  const spans = [createMockSpan({ 'gen_ai.response.model': 'claude-3-opus' })];
  const schema: AttributeSchema = { 'gen_ai.response.model': 'gpt-*' };
  assertAttributes(spans, schema);
  console.error('✗ Test 10 failed: should have thrown error for pattern mismatch');
} catch (error) {
  console.log('✓ Test 10 passed: correctly detected pattern mismatch');
}

// Test 11: Multiple spans - all must match
try {
  const spans = [
    createMockSpan({ 'gen_ai.request.model': 'gpt-4' }),
    createMockSpan({ 'gen_ai.request.model': 'gpt-4' }),
  ];
  const schema: AttributeSchema = { 'gen_ai.request.model': 'gpt-4' };
  assertAttributes(spans, schema);
  console.log('✓ Test 11 passed: multiple spans all match');
} catch (error) {
  console.error('✗ Test 11 failed:', error instanceof Error ? error.message : error);
}

// Test 12: Multiple attributes in schema
try {
  const spans = [createMockSpan({
    'gen_ai.request.model': 'gpt-4',
    'gen_ai.response.model': 'gpt-4-turbo-2024-01-01',
    'gen_ai.usage.input_tokens': 100,
  })];
  const schema: AttributeSchema = {
    'gen_ai.request.model': 'gpt-4',
    'gen_ai.response.model': 'gpt-4*',
    'gen_ai.usage.input_tokens': true,
  };
  assertAttributes(spans, schema);
  console.log('✓ Test 12 passed: multiple attributes validated');
} catch (error) {
  console.error('✗ Test 12 failed:', error instanceof Error ? error.message : error);
}

console.log('\nAll tests completed!');
