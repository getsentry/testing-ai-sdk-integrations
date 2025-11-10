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

  // Log captured spans in verbose mode
  if (process.env.SENTRY_AI_TEST_VERBOSE === 'true') {
    console.log('\n    === Captured Spans (Verbose) ===');
    if (spans.length === 0) {
      console.log('    No spans captured');
    } else {
      spans.forEach((span, index) => {
        console.log(`    Span ${index + 1}:`);
        console.log(`      op: ${span.op || 'N/A'}`);
        console.log(`      description: ${span.description || 'N/A'}`);
        console.log(`      span_id: ${span.span_id || 'N/A'}`);
        console.log(`      parent_span_id: ${span.parent_span_id || 'N/A'}`);
        if (span.data && Object.keys(span.data).length > 0) {
          console.log(`      data keys: ${Object.keys(span.data).join(', ')}`);
        }
      });
    }
    console.log('    === End Captured Spans ===\n');
  }

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
      const spanErrors = new Map(); // op -> { missing: [], mismatched: [] }

      for (const itemExpectation of items) {
        const opKey = Array.isArray(itemExpectation.op) ? itemExpectation.op.join(" or ") : itemExpectation.op;

        try {
          // Get span by operation and attributes
          const requiredAttrs = itemExpectation.required_attributes;
          const span = getSpan(spans, itemExpectation.op, requiredAttrs);
          spanMap.set(itemExpectation.id, span);

          // Validate required attributes and collect errors
          if (requiredAttrs) {
            if (!spanErrors.has(opKey)) {
              spanErrors.set(opKey, { missing: [], mismatched: [] });
            }
            const spanError = spanErrors.get(opKey);

            for (const [attr, expectedValue] of Object.entries(requiredAttrs)) {
              if (expectedValue === true) {
                if (!hasAttribute(span, attr)) {
                  spanError.missing.push(attr);
                }
              } else {
                if (!attributeMatches(span, attr, expectedValue)) {
                  const actualValue = getAttribute(span, attr);
                  spanError.mismatched.push({
                    attr,
                    expected: expectedValue,
                    actual: actualValue
                  });
                }
              }
            }
          }
        } catch (error) {
          // getSpan threw an error - check if it's about missing attributes or missing span
          if (error.message.includes('but missing required attributes')) {
            // Span exists but has attribute issues - extract the details
            const requiredAttrs = itemExpectation.required_attributes;
            if (requiredAttrs) {
              // Find the span by op only (without attribute filtering)
              const opList = Array.isArray(itemExpectation.op) ? itemExpectation.op : [itemExpectation.op];
              const matchingSpan = spans.find((s) => opList.includes(s.op));

              if (matchingSpan) {
                if (!spanErrors.has(opKey)) {
                  spanErrors.set(opKey, { missing: [], mismatched: [] });
                }
                const spanError = spanErrors.get(opKey);

                // Check each attribute
                for (const [attr, expectedValue] of Object.entries(requiredAttrs)) {
                  if (expectedValue === true) {
                    if (!hasAttribute(matchingSpan, attr)) {
                      spanError.missing.push(attr);
                    }
                  } else {
                    if (!attributeMatches(matchingSpan, attr, expectedValue)) {
                      const actualValue = getAttribute(matchingSpan, attr);
                      spanError.mismatched.push({
                        attr,
                        expected: expectedValue,
                        actual: actualValue
                      });
                    }
                  }
                }
              }
            }
          } else if (error.message.includes('No span found with op=')) {
            // Span doesn't exist at all
            if (!spanErrors.has(opKey)) {
              spanErrors.set(opKey, { missing: [], mismatched: [], notFound: true });
            }
          } else {
            // Other error - just append it
            errors.push(error.message);
          }
        }
      }

      // Format span errors in a structured way
      for (const [op, errorDetails] of spanErrors) {
        if (errorDetails.notFound) {
          errors.push(`    ${op}: span not found`);
        } else if (errorDetails.missing.length > 0 || errorDetails.mismatched.length > 0) {
          let errorMsg = `    ${op}:`;

          for (const attr of errorDetails.missing) {
            errorMsg += `\n       ${attr}: missing`;
          }

          for (const mismatch of errorDetails.mismatched) {
            errorMsg += `\n       ${mismatch.attr}: mismatch (expected: ${JSON.stringify(mismatch.expected)}, got: ${JSON.stringify(mismatch.actual)})`;
          }

          errors.push(errorMsg);
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
