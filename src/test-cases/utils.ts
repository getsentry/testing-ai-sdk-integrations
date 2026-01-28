/**
 * Common test utilities for span validation
 */

import { expect } from 'chai';
import { CapturedSpan } from '../types.js';
import { SkipCheckError } from '../validator.js';

/**
 * Skip the current check with a reason
 * @param reason - Why the check is being skipped
 * @throws {SkipCheckError}
 * @example
 * if (!spans.length) {
 *   skip('No spans captured - cannot validate attributes');
 * }
 */
export function skip(reason: string): never {
  throw new SkipCheckError(reason);
}

/**
 * Conditionally skip the current check
 * @param condition - If true, skip the check
 * @param reason - Why the check is being skipped
 * @throws {SkipCheckError}
 * @example
 * skipIf(spans.length === 0, 'No spans captured');
 * skipIf(!config.supportsStreaming, 'Framework does not support streaming');
 */
export function skipIf(condition: boolean, reason: string): void {
  if (condition) {
    throw new SkipCheckError(reason);
  }
}

/**
 * Attribute schema for validation
 * - true: attribute must exist
 * - false: attribute must NOT exist
 * - string with '*': must match pattern (glob-style)
 * - string/number: must equal exact value
 */
export type AttributeSchema = {
  [key: string]: boolean | string | number;
};

/**
 * Extract AI spans from captured spans
 * Only supports gen_ai.* prefixed operations
 */
export function extractGenAISpans(spans: CapturedSpan[]): CapturedSpan[] {
  return spans.filter((s) => s.op && s.op.startsWith('gen_ai'));
}



/**
 * Check token usage attributes
 */
export interface TokenUsageChecks {
  /** Check for input tokens */
  hasInputTokens?: boolean;
  /** Check for output tokens */
  hasOutputTokens?: boolean;
  /** Check for total tokens */
  hasTotalTokens?: boolean;
  /** Minimum total tokens */
  minTotalTokens?: number;
  /** Check that total = input + output */
  validateSum?: boolean;
}

export function checkTokenUsage(span: CapturedSpan, checks: TokenUsageChecks = {}): void {
  const {
    hasInputTokens = true,
    hasOutputTokens = true,
    hasTotalTokens = true,
    minTotalTokens,
    validateSum = true,
  } = checks;

  if (!span.data) {
    throw new Error('Span has no data field');
  }

  // Extract token counts (only gen_ai.* prefix)
  const inputTokens = span.data['gen_ai.usage.input_tokens'];
  const outputTokens = span.data['gen_ai.usage.output_tokens'];
  const totalTokens = span.data['gen_ai.usage.total_tokens'];

  // Check presence
  if (hasInputTokens) {
    expect(inputTokens).to.exist;
    expect(inputTokens).to.be.a('number');
    expect(inputTokens).to.be.greaterThan(0);
  }

  if (hasOutputTokens) {
    expect(outputTokens).to.exist;
    expect(outputTokens).to.be.a('number');
    expect(outputTokens).to.be.greaterThan(0);
  }

  if (hasTotalTokens) {
    expect(totalTokens).to.exist;
    expect(totalTokens).to.be.a('number');
    expect(totalTokens).to.be.greaterThan(0);
  }

  // Check minimum total
  if (minTotalTokens !== undefined && totalTokens) {
    expect(totalTokens).to.be.at.least(minTotalTokens);
  }

  // Validate sum
  if (validateSum && inputTokens && outputTokens && totalTokens) {
    expect(totalTokens).to.equal(
      inputTokens + outputTokens,
      'Total tokens should equal input + output tokens'
    );
  }
}

/**
 * Check span hierarchy structure
 */
export interface SpanHierarchyChecks {
  /** Expected parent operation pattern */
  parentOp?: RegExp;
  /** Expected child operation pattern */
  childOp?: RegExp;
  /** Minimum number of children */
  minChildren?: number;
  /** Exact number of children */
  exactChildren?: number;
}

export function checkSpanStructure(spans: CapturedSpan[], checks: SpanHierarchyChecks): void {
  const { parentOp, childOp, minChildren, exactChildren } = checks;

  // Find parent span
  const parentSpan = parentOp ? spans.find((s) => s.op && s.op.match(parentOp)) : undefined;

  if (parentOp && !parentSpan) {
    throw new Error(`No parent span found matching pattern: ${parentOp}`);
  }

  // Find child spans
  let childSpans: CapturedSpan[] = [];

  if (parentSpan) {
    // Find spans that reference this parent
    childSpans = spans.filter((s) => s.parent_span_id === parentSpan.span_id);
  } else if (childOp) {
    // Just filter by operation pattern
    childSpans = spans.filter((s) => s.op && s.op.match(childOp));
  }

  // Check child count
  if (minChildren !== undefined) {
    expect(childSpans.length).to.be.at.least(
      minChildren,
      `Should have at least ${minChildren} child span(s)`
    );
  }

  if (exactChildren !== undefined) {
    expect(childSpans.length).to.equal(
      exactChildren,
      `Should have exactly ${exactChildren} child span(s)`
    );
  }

  // Validate child operations
  if (childOp) {
    childSpans.forEach((child, idx) => {
      expect(child.op).to.match(childOp, `Child span ${idx} operation should match pattern`);
    });
  }
}

/**
 * Helper to print span summary for debugging
 */
export function printSpanSummary(spans: CapturedSpan[]): void {
  console.log(`\n  Captured ${spans.length} span(s):`);
  spans.forEach((s, i) => {
    const parent = s.parent_span_id ? ` (parent: ${s.parent_span_id.substring(0, 8)})` : '';
    console.log(`    [${i}] ${s.op}${parent}`);
  });
}

/**
 * Match a value against a pattern (supports * wildcards)
 */
function matchPattern(value: string, pattern: string): boolean {
  // Escape special regex characters except *
  const regexPattern = pattern
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*');
  
  const regex = new RegExp(`^${regexPattern}$`);
  return regex.test(value);
}

/**
 * Assert attributes on spans based on schema
 * 
 * Schema format:
 * - true: attribute must exist (any value)
 * - false: attribute must NOT exist
 * - string with '*': must match pattern (e.g., "gpt-4*" matches "gpt-4-turbo")
 * - string/number: must equal exact value
 * 
 * @param spans - List of spans to check (all spans must match schema)
 * @param schema - Attribute schema to validate against
 */
export function assertAttributes(spans: CapturedSpan[], schema: AttributeSchema): void {
  if (spans.length === 0) {
    throw new Error('No spans provided to assertAttributes');
  }

  const errors: string[] = [];

  spans.forEach((span, spanIndex) => {
    if (!span.data) {
      errors.push(`Span ${spanIndex}: Missing data field`);
      return;
    }

    // Check each attribute in the schema
    for (const [attrName, expected] of Object.entries(schema)) {
      const actual = span.data[attrName];

      if (expected === true) {
        // Must exist
        if (actual === undefined || actual === null) {
          errors.push(`Span ${spanIndex}: Attribute '${attrName}' must exist but is missing`);
        }
      } else if (expected === false) {
        // Must NOT exist
        if (actual !== undefined && actual !== null) {
          errors.push(`Span ${spanIndex}: Attribute '${attrName}' must not exist but has value: ${actual}`);
        }
      } else if (typeof expected === 'string' && expected.includes('*')) {
        // Pattern matching
        if (actual === undefined || actual === null) {
          errors.push(`Span ${spanIndex}: Attribute '${attrName}' must exist for pattern matching but is missing`);
        } else if (typeof actual !== 'string') {
          errors.push(`Span ${spanIndex}: Attribute '${attrName}' must be a string for pattern matching but is: ${typeof actual}`);
        } else if (!matchPattern(actual, expected)) {
          errors.push(`Span ${spanIndex}: Attribute '${attrName}' value '${actual}' does not match pattern '${expected}'`);
        }
      } else {
        // Exact value match
        if (actual === undefined || actual === null) {
          errors.push(`Span ${spanIndex}: Attribute '${attrName}' must equal '${expected}' but is missing`);
        } else if (actual !== expected) {
          errors.push(`Span ${spanIndex}: Attribute '${attrName}' must equal '${expected}' but is '${actual}'`);
        }
      }
    }
  });

  if (errors.length > 0) {
    throw new Error(`Attribute validation failed:\n  ${errors.join('\n  ')}`);
  }
}
