/**
 * Fixture validator - validates captured Sentry data against fixtures
 */

const { loadFixture } = require("./fixture-loader.cjs");
const {
  getSpan,
  getSpans,
  containsAttributes,
  isChildOf,
  getAttribute,
  attributeMatches,
  hasAttribute,
} = require("../assertions.cjs");

/**
 * Validate captured Sentry data against a fixture
 *
 * @param {string} specId - The spec ID (e.g., "1-simple")
 * @param {Array} spans - Captured spans
 * @param {Array} transactions - Captured transactions
 * @param {Array} events - Captured events (optional)
 * @param {string} variant - The fixture variant (e.g., "agentic", "low-level")
 * @returns {Object} Validation result with { passed, errors }
 */
function validateFixture(specId, spans, transactions, events = [], variant = "agentic") {
  const fixture = loadFixture(specId, variant);
  const errors = [];

  // Validate transactions
  if (fixture.expectations.transactions) {
    const { min_count } = fixture.expectations.transactions;
    if (min_count !== undefined && transactions.length < min_count) {
      errors.push(
        `Expected at least ${min_count} transaction(s), got ${transactions.length}`
      );
    }
  }

  // Validate spans
  if (fixture.expectations.spans) {
    const { count, min_count, items } = fixture.expectations.spans;

    // Check minimum span count
    // Note: 'count' is treated as minimum, not exact
    const minSpanCount = min_count !== undefined ? min_count : count;
    if (minSpanCount !== undefined && spans.length < minSpanCount) {
      errors.push(`Expected at least ${minSpanCount} span(s), got ${spans.length}`);
    }

    // Validate individual spans and relationships
    if (items && Array.isArray(items)) {
      const spanMap = new Map(); // id -> span object

      for (const itemExpectation of items) {
        try {
          // Get span by operation and attributes
          const requiredAttrs = itemExpectation.required_attributes;
          const span = getSpan(spans, itemExpectation.op, requiredAttrs);
          spanMap.set(itemExpectation.id, span);

          // Validate required attributes (they were already used to find the span,
          // but we still need to check individual ones for error messages)
          if (requiredAttrs) {
            if (!containsAttributes(span, requiredAttrs)) {
              // Build detailed error with span info
              const spanDesc = `Span with op="${span.op}" (span_id=${(span.span_id || '?').substring(0, 8)}...)`;
              const spanData = span.data || {};

              // Get detailed error about which attribute failed
              for (const [attr, expectedValue] of Object.entries(requiredAttrs)) {
                if (expectedValue === true) {
                  if (!hasAttribute(span, attr)) {
                    errors.push(
                      `${spanDesc} missing attribute: ${attr}\n` +
                      `  Available attributes: ${Object.keys(spanData).join(', ')}`
                    );
                  }
                } else {
                  if (!attributeMatches(span, attr, expectedValue)) {
                    const actualValue = getAttribute(span, attr);
                    errors.push(
                      `${spanDesc} attribute "${attr}" mismatch:\n` +
                      `  Expected: ${JSON.stringify(expectedValue)}\n` +
                      `  Got: ${JSON.stringify(actualValue)}`
                    );
                  }
                }
              }
            }
          }
        } catch (error) {
          errors.push(error.message);
        }
      }

      // Validate parent-child relationships
      for (const itemExpectation of items) {
        if (itemExpectation.parent) {
          const childSpan = spanMap.get(itemExpectation.id);
          const parentSpan = spanMap.get(itemExpectation.parent);

          if (childSpan && parentSpan) {
            if (!isChildOf(childSpan, parentSpan)) {
              errors.push(
                `Span with op="${itemExpectation.op}" should be child of span with id="${itemExpectation.parent}"`
              );
            }
          }
        }
      }
    }
  }

  // Validate events
  if (fixture.expectations.events) {
    const { error_count } = fixture.expectations.events;
    if (error_count !== undefined) {
      const actualErrorCount = events.filter((e) => e.level === "error").length;
      if (actualErrorCount !== error_count) {
        errors.push(
          `Expected ${error_count} error event(s), got ${actualErrorCount}`
        );
      }
    }
  }

  return {
    passed: errors.length === 0,
    errors,
    fixture,
  };
}

module.exports = {
  validateFixture,
};
