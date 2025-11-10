/**
 * Assertion helpers for Sentry span verification
 *
 * Provides utilities to query and assert on captured Sentry spans
 */

/**
 * Get a single span by operation name(s) and/or attributes
 * Throws if zero or more than one span is found
 *
 * @param {Array} spans - Array of span objects
 * @param {string|Array<string>} op - Operation name (string) or array of operation names to search for
 * @param {Object} [requiredAttributes] - Optional object of attributes to filter by
 * @returns {Object} The matching span
 * @throws {Error} If zero or multiple spans found
 */
function getSpan(spans, op, requiredAttributes) {
  // Normalize op to an array
  const opList = Array.isArray(op) ? op : [op];

  // Filter by operation name(s)
  let matching = spans.filter((s) => opList.includes(s.op));

  // Further filter by attributes if specified
  if (requiredAttributes) {
    matching = matching.filter((s) => containsAttributes(s, requiredAttributes));
  }

  if (matching.length === 0) {
    const opDesc = Array.isArray(op) ? op.join(" or ") : op;

    // Check if any spans with the op exist (without attribute filtering)
    const spansWithOp = spans.filter((s) => opList.includes(s.op));

    if (spansWithOp.length === 0) {
      // No spans with that op at all
      let errorMsg = `No span found with op="${opDesc}"`;
      errorMsg += `\n  Available spans:`;
      spans.forEach((s, i) => {
        errorMsg += `\n    ${i + 1}. op="${s.op}"`;
      });
      throw new Error(errorMsg);
    } else {
      // Spans with that op exist, but don't match required attributes
      const isVerbose = process.env.SENTRY_AI_TEST_VERBOSE === 'true';
      let errorMsg = `Found span with op="${opDesc}" but missing required attributes`;

      if (requiredAttributes) {
        const span = spansWithOp[0];
        const spanData = span.data || {};

        // Concise mode: Just show what's missing/mismatched
        if (!isVerbose) {
          const missing = [];
          const mismatched = [];

          for (const [attr, expectedVal] of Object.entries(requiredAttributes)) {
            const actualVal = getAttribute(span, attr);

            if (actualVal === undefined) {
              missing.push(attr);
            } else if (expectedVal !== true && actualVal !== expectedVal) {
              mismatched.push(`${attr} (expected: ${JSON.stringify(expectedVal)}, got: ${JSON.stringify(actualVal)})`);
            }
          }

          if (missing.length > 0) {
            errorMsg += `\n  Missing: ${missing.join(', ')}`;
          }
          if (mismatched.length > 0) {
            errorMsg += `\n  Mismatched: ${mismatched.join(', ')}`;
          }
          errorMsg += `\n  (run with --verbose for full details)`;
        } else {
          // Verbose mode: Show everything
          errorMsg += `\n  Required attributes:`;
          for (const [attr, val] of Object.entries(requiredAttributes)) {
            errorMsg += `\n    - ${attr}: ${val === true ? "(any value)" : JSON.stringify(val)}`;
          }

          errorMsg += `\n  Span's actual attributes:`;
          const dataKeys = Object.keys(spanData);
          if (dataKeys.length > 0) {
            dataKeys.forEach((key) => {
              errorMsg += `\n    - ${key}: ${JSON.stringify(spanData[key])}`;
            });
          } else {
            errorMsg += `\n    (no attributes)`;
          }
        }
      }

      throw new Error(errorMsg);
    }
  }

  if (matching.length > 1) {
    const opDesc = Array.isArray(op) ? op.join(" or ") : op;
    let errorMsg = `Found ${matching.length} spans matching op="${opDesc}", expected exactly 1`;

    errorMsg += `\n  Matching spans:`;
    matching.forEach((s, i) => {
      errorMsg += `\n    ${i + 1}. op="${s.op}" span_id=${(s.span_id || "?").substring(0, 8)}`;
    });

    throw new Error(errorMsg);
  }

  return matching[0];
}

/**
 * Get all spans matching an operation name
 *
 * @param {Array} spans - Array of span objects
 * @param {string} op - Operation name to search for
 * @returns {Array} Array of matching spans (may be empty)
 */
function getSpans(spans, op) {
  return spans.filter((s) => s.op === op);
}

/**
 * Check if one span is a child of another
 *
 * @param {Object} childSpan - The potential child span
 * @param {Object} parentSpan - The potential parent span
 * @returns {boolean} True if childSpan is a child of parentSpan
 */
function isChildOf(childSpan, parentSpan) {
  if (!childSpan || !parentSpan) {
    return false;
  }

  // Check if child's parent_span_id matches parent's span_id
  return childSpan.parent_span_id === parentSpan.span_id;
}

/**
 * Get an attribute value from a span
 * First checks span.data for the attribute, then checks span directly
 *
 * @param {Object} span - The span to check
 * @param {string} attributeName - Name of the attribute (e.g., "gen_ai.request.model")
 * @returns {*} The attribute value, or undefined if not found
 */
function getAttribute(span, attributeName) {
  if (!span) {
    return undefined;
  }

  // First check in span.data (where Sentry stores span attributes)
  if (span.data && typeof span.data === "object" && attributeName in span.data) {
    return span.data[attributeName];
  }

  // Then check directly on span using dot notation
  const parts = attributeName.split(".");
  let current = span;

  for (const part of parts) {
    if (current && typeof current === "object" && part in current) {
      current = current[part];
    } else {
      return undefined;
    }
  }

  return current;
}

/**
 * Check if a span has an attribute (regardless of value)
 *
 * @param {Object} span - The span to check
 * @param {string} attributeName - Name of the attribute (can use dot notation for nested, e.g., "data.ai.model")
 * @returns {boolean} True if attribute exists
 */
function hasAttribute(span, attributeName) {
  return getAttribute(span, attributeName) !== undefined;
}

/**
 * Check if a span has an attribute with a specific value
 *
 * @param {Object} span - The span to check
 * @param {string} attributeName - Name of the attribute (can use dot notation for nested, e.g., "data.ai.model")
 * @param {*} value - Expected value (uses strict equality)
 * @returns {boolean} True if attribute exists and matches value
 */
function attributeMatches(span, attributeName, value) {
  const attrValue = getAttribute(span, attributeName);
  return attrValue !== undefined && attrValue === value;
}

/**
 * Check if a span contains multiple attributes
 *
 * @param {Object} span - The span to check
 * @param {Object} attributes - Object mapping attribute names to expected values
 *   - If value is `true`, only checks attribute presence
 *   - Otherwise checks attribute matches the value exactly
 * @returns {boolean} True if all attributes match
 *
 * @example
 * assert(containsAttributes(span, {
 *   'gen_ai.request.model': 'gpt-4o-mini',  // checks value matches
 *   'gen_ai.response.text': true,            // just checks presence
 *   'gen_ai.usage.input_tokens': true,
 * }));
 */
function containsAttributes(span, attributes) {
  for (const [attrName, expectedValue] of Object.entries(attributes)) {
    if (expectedValue === true) {
      // Just check presence
      if (!hasAttribute(span, attrName)) {
        return false;
      }
    } else {
      // Check value matches
      if (!attributeMatches(span, attrName, expectedValue)) {
        return false;
      }
    }
  }

  return true;
}

module.exports = {
  getSpan,
  getSpans,
  isChildOf,
  getAttribute,
  hasAttribute,
  attributeMatches,
  containsAttributes,
};
