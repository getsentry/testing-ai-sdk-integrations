/**
 * Fixture validator - validates captured Sentry data against fixtures
 *
 * Includes assertion helpers for querying and verifying spans
 */

const { loadFixture } = require("./fixture-loader.cjs");

// ============================================================================
// ASSERTION HELPERS
// ============================================================================

/**
 * Format an op specification as a human-readable description
 *
 * @param {string|Array<string>|Object} op - Operation specification
 * @returns {string} Human-readable description
 */
function formatOpDescription(op) {
  if (typeof op === "object" && !Array.isArray(op)) {
    return `${op.pattern} (excluding: ${(op.not || []).join(", ")})`;
  }
  return Array.isArray(op) ? op.join(" or ") : op;
}

/**
 * Normalize an op specification to a list of operation names
 *
 * @param {string|Array<string>|Object} op - Operation specification
 * @param {Array} spans - Available spans (needed for pattern matching)
 * @returns {Array<string>} List of operation names
 */
function normalizeOpToList(op, spans) {
  if (typeof op === "object" && !Array.isArray(op)) {
    // Object format: { pattern: "gen_ai.*", not: ["gen_ai.invoke_agent", ...] }
    const pattern = op.pattern;
    const notList = op.not || [];

    // Get all unique op values from spans that match the pattern but not in the exclusion list
    const matchingOps = new Set();
    spans.forEach((s) => {
      if (s.op && matchesPattern(s.op, pattern) && !notList.includes(s.op)) {
        matchingOps.add(s.op);
      }
    });

    return Array.from(matchingOps);
  }

  // String or array format
  return Array.isArray(op) ? op : [op];
}

/**
 * Validate span attributes and collect errors
 *
 * @param {Object} span - The span to validate
 * @param {Object} requiredAttributes - Required attributes to check
 * @returns {Object} Object with {missing: [], mismatched: []} arrays
 */
function validateSpanAttributes(span, requiredAttributes) {
  const errors = { missing: [], mismatched: [] };

  for (const [attr, expectedValue] of Object.entries(requiredAttributes)) {
    if (expectedValue === true) {
      // Just check presence
      if (!hasAttribute(span, attr)) {
        errors.missing.push(attr);
      }
    } else {
      // Check value matches
      if (!attributeMatches(span, attr, expectedValue)) {
        const actualValue = getAttribute(span, attr);
        // Treat undefined/null as missing, not mismatch
        if (actualValue === undefined || actualValue === null) {
          errors.missing.push(attr);
        } else {
          errors.mismatched.push({
            attr,
            expected: expectedValue,
            actual: actualValue,
          });
        }
      }
    }
  }

  return errors;
}

/**
 * Get a single span by operation name(s) and/or attributes
 * Throws if zero or more than one span is found
 *
 * @param {Array} spans - Array of span objects
 * @param {string|Array<string>|Object} op - Operation name (string), array of operation names, or object with pattern/not
 * @param {Object} [requiredAttributes] - Optional object of attributes to filter by
 * @param {Set} [usedSpans] - Set of span IDs already used (for matching multiple spans in order)
 * @returns {Object} The matching span
 * @throws {Error} If zero or multiple spans found
 */
function getSpan(spans, op, requiredAttributes, usedSpans) {
  // Normalize op to a list of operation names
  const opList = normalizeOpToList(op, spans);

  // Filter by operation name(s)
  let matching = spans.filter((s) => opList.includes(s.op));

  // Exclude already-used spans if usedSpans is provided
  if (usedSpans) {
    matching = matching.filter((s) => !usedSpans.has(s.span_id));
  }

  // Further filter by attributes if specified
  if (requiredAttributes) {
    matching = matching.filter((s) =>
      containsAttributes(s, requiredAttributes)
    );
  }

  if (matching.length === 0) {
    const opDesc = formatOpDescription(op);

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
      const isVerbose = process.env.SENTRY_AI_TEST_VERBOSE === "true";
      let errorMsg = `Found span with op="${opDesc}" but missing required attributes`;

      if (requiredAttributes) {
        const span = spansWithOp[0];
        const spanData = span.data || {};

        // Concise mode: Just show what's missing/mismatched
        if (!isVerbose) {
          const missing = [];
          const mismatched = [];

          for (const [attr, expectedVal] of Object.entries(
            requiredAttributes
          )) {
            const actualVal = getAttribute(span, attr);

            if (actualVal === undefined) {
              missing.push(attr);
            } else if (expectedVal !== true && actualVal !== expectedVal) {
              mismatched.push(
                `${attr} (expected: ${JSON.stringify(
                  expectedVal
                )}, got: ${JSON.stringify(actualVal)})`
              );
            }
          }

          if (missing.length > 0) {
            errorMsg += `\n  Missing: ${missing.join(", ")}`;
          }
          if (mismatched.length > 0) {
            errorMsg += `\n  Mismatched: ${mismatched.join(", ")}`;
          }
          errorMsg += `\n  (run with --verbose for full details)`;
        } else {
          // Verbose mode: Show everything
          errorMsg += `\n  Required attributes:`;
          for (const [attr, val] of Object.entries(requiredAttributes)) {
            errorMsg += `\n    - ${attr}: ${
              val === true ? "(any value)" : JSON.stringify(val)
            }`;
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
    // If usedSpans is provided, we're matching in order - return first match
    if (usedSpans) {
      return matching[0];
    }

    // Otherwise, multiple matches is an error
    const opDesc = formatOpDescription(op);
    let errorMsg = `Found ${matching.length} spans matching op="${opDesc}", expected exactly 1`;

    errorMsg += `\n  Matching spans:`;
    matching.forEach((s, i) => {
      errorMsg += `\n    ${i + 1}. op="${s.op}" span_id=${(
        s.span_id || "?"
      ).substring(0, 8)}`;
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
  if (
    span.data &&
    typeof span.data === "object" &&
    attributeName in span.data
  ) {
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
 * Check if a value matches a pattern with wildcard support
 *
 * Wildcard patterns:
 * - "foo*" matches any string that begins with "foo"
 * - "*foo" matches any string that ends with "foo"
 * - "*foo*" matches any string that contains "foo"
 * - "foo" matches exactly "foo" (no wildcards)
 *
 * @param {*} actualValue - The actual value to test
 * @param {*} pattern - The expected value or pattern (may contain wildcards)
 * @returns {boolean} True if the value matches the pattern
 */
function matchesPattern(actualValue, pattern) {
  // If pattern is not a string, use strict equality
  if (typeof pattern !== "string") {
    return actualValue === pattern;
  }

  // Convert actual value to string for pattern matching
  const actualStr = String(actualValue);

  // Check for wildcard patterns
  if (pattern.includes("*")) {
    // *foo* - contains
    if (pattern.startsWith("*") && pattern.endsWith("*")) {
      const substring = pattern.slice(1, -1);
      // If substring is empty (pattern is "*" or "**"), no match
      if (substring === "" || substring === "*") {
        return false;
      }
      return actualStr.includes(substring);
    }
    // foo* - starts with
    else if (pattern.endsWith("*")) {
      const prefix = pattern.slice(0, -1);
      // If prefix is empty (pattern is just "*"), no match
      if (prefix === "") {
        return false;
      }
      return actualStr.startsWith(prefix);
    }
    // *foo - ends with
    else if (pattern.startsWith("*")) {
      const suffix = pattern.slice(1);
      // If suffix is empty (pattern is just "*"), no match
      if (suffix === "") {
        return false;
      }
      return actualStr.endsWith(suffix);
    }
  }

  // No wildcards, use strict equality
  return actualValue === pattern;
}

/**
 * Validate an attribute against a schema object
 *
 * @param {*} attrValue - The actual attribute value
 * @param {Object} schema - Schema object with validation rules
 * @param {Object} span - The span object (needed for cross-attribute constraints like lte)
 * @returns {boolean} True if value matches schema
 *
 * Supported schema formats:
 * - { type: "json_array", min_length: 2, items_have: ["role", "content"] }
 * - { type: "json_array", length: 2, items_have: ["role"] }
 * - { type: "plain_string", min_length: 1, pattern: "*hello*" }
 * - { type: "number", lte: "other.attribute.name" } - value must be <= other attribute
 */
function validateSchema(attrValue, schema, span = null) {
  if (!schema || typeof schema !== "object") {
    return false;
  }

  // Handle plain_string type
  if (schema.type === "plain_string") {
    // Must be a string
    if (typeof attrValue !== "string") {
      return false;
    }

    // Must NOT be valid JSON
    try {
      JSON.parse(attrValue);
      return false; // It's valid JSON, so it's not a plain string
    } catch (e) {
      // Good - not JSON, it's a plain string
    }

    // Validate min_length
    if (
      schema.min_length !== undefined &&
      attrValue.length < schema.min_length
    ) {
      return false;
    }

    // Validate max_length
    if (
      schema.max_length !== undefined &&
      attrValue.length > schema.max_length
    ) {
      return false;
    }

    // Validate pattern
    if (
      schema.pattern !== undefined &&
      !matchesPattern(attrValue, schema.pattern)
    ) {
      return false;
    }

    return true;
  }

  // Handle json_array type
  if (schema.type === "json_array") {
    // Parse JSON if it's a string
    let parsed;
    if (typeof attrValue === "string") {
      try {
        parsed = JSON.parse(attrValue);
      } catch (e) {
        return false; // Not valid JSON
      }
    } else {
      parsed = attrValue;
    }

    // Check if it's an array
    if (!Array.isArray(parsed)) {
      return false;
    }

    // Validate length
    if (schema.length !== undefined && parsed.length !== schema.length) {
      return false;
    }

    if (schema.min_length !== undefined && parsed.length < schema.min_length) {
      return false;
    }

    if (schema.max_length !== undefined && parsed.length > schema.max_length) {
      return false;
    }

    // Validate items_have (each item must have these properties)
    if (schema.items_have && Array.isArray(schema.items_have)) {
      for (const item of parsed) {
        if (typeof item !== "object" || item === null) {
          return false;
        }
        for (const requiredProp of schema.items_have) {
          if (!(requiredProp in item)) {
            return false;
          }
        }
      }
    }

    return true;
  }

  // Handle number type with constraints
  if (schema.type === "number") {
    // Must be a number
    if (typeof attrValue !== "number") {
      return false;
    }

    // Validate lte (less than or equal to another attribute)
    if (schema.lte !== undefined && span !== null) {
      const otherValue = getAttribute(span, schema.lte);
      // Only validate if the other attribute exists and is a number
      if (otherValue !== undefined && typeof otherValue === "number") {
        if (attrValue > otherValue) {
          return false;
        }
      }
    }

    return true;
  }

  // Unknown schema type
  return false;
}

/**
 * Check if a span has an attribute with a specific value
 *
 * @param {Object} span - The span to check
 * @param {string} attributeName - Name of the attribute (can use dot notation for nested, e.g., "data.ai.model")
 * @param {*} value - Expected value (uses strict equality, wildcard pattern, or schema validation)
 * @returns {boolean} True if attribute exists and matches value
 */
function attributeMatches(span, attributeName, value) {
  const attrValue = getAttribute(span, attributeName);

  // Check if value is a schema object with optional flag
  if (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    value.type
  ) {
    // If attribute is missing and schema marks it as optional, that's OK
    if (attrValue === undefined && value.optional === true) {
      return true;
    }
    if (attrValue === undefined) {
      return false;
    }
    return validateSchema(attrValue, value, span);
  }

  // For non-schema values, missing attribute means no match
  if (attrValue === undefined) {
    return false;
  }

  // Otherwise use pattern matching
  return matchesPattern(attrValue, value);
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
 *   'gen_ai.request.model': 'gpt-5-nano',  // checks value matches
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

// ============================================================================
// VALIDATOR
// ============================================================================

/**
 * Validate transaction count
 *
 * @param {Array} transactions - Captured transactions
 * @param {Object} expectations - Fixture expectations
 * @param {Array} errors - Error array to append to
 */
function validateTransactions(transactions, expectations, errors) {
  if (expectations.transactions) {
    const { min_count } = expectations.transactions;
    if (min_count !== undefined && transactions.length < min_count) {
      errors.push(
        `Expected at least ${min_count} transaction(s), got ${transactions.length}`
      );
    }
  }
}

/**
 * Validate span count
 *
 * @param {Array} spans - Captured spans
 * @param {Object} expectations - Fixture span expectations
 * @param {Array} errors - Error array to append to
 */
function validateSpanCounts(spans, expectations, errors) {
  if (expectations.spans) {
    const { count, min_count } = expectations.spans;
    const minSpanCount = min_count !== undefined ? min_count : count;
    if (minSpanCount !== undefined && spans.length < minSpanCount) {
      errors.push(`Expected at least ${minSpanCount} span(s), got ${spans.length}`);
    }
  }
}

/**
 * Validate events
 *
 * @param {Array} events - Captured events
 * @param {Object} expectations - Fixture expectations
 * @param {Array} errors - Error array to append to
 */
function validateEvents(events, expectations, errors) {
  if (expectations.events) {
    const { error_count } = expectations.events;
    if (error_count !== undefined) {
      const actualErrorCount = events.filter((e) => e.level === "error").length;
      if (actualErrorCount !== error_count) {
        errors.push(`Expected ${error_count} error event(s), got ${actualErrorCount}`);
      }
    }
  }
}

/**
 * Validate parent-child relationships between spans
 *
 * @param {Array} items - Span item expectations from fixture
 * @param {Map} spanMap - Map of fixture ID to matched span
 * @param {Array} errors - Error array to append to
 */
function validateSpanRelationships(items, spanMap, errors) {
  for (const itemExpectation of items) {
    if (itemExpectation.parent) {
      const childSpan = spanMap.get(itemExpectation.id);
      const parentSpan = spanMap.get(itemExpectation.parent);

      if (childSpan && parentSpan) {
        if (!isChildOf(childSpan, parentSpan)) {
          errors.push(
            `Span with op="${formatOpDescription(itemExpectation.op)}" should be child of span with id="${itemExpectation.parent}"`
          );
        }
      }
    }
  }
}

/**
 * Validate individual span items from fixture expectations
 *
 * @param {Array} spans - Captured spans
 * @param {Array} items - Span item expectations from fixture
 * @param {Array} errors - Error array to append to
 * @returns {Map} Map of fixture ID to matched span
 */
function validateSpanItems(spans, items, errors) {
  const spanMap = new Map();
  const spanErrors = new Map();
  const usedSpans = new Set();

  // Match each expected span
  for (const itemExpectation of items) {
    const fixtureId = itemExpectation.id;
    const expectedOp = formatOpDescription(itemExpectation.op);

    try {
      // Get span by operation and attributes (pass usedSpans to match in order)
      const requiredAttrs = itemExpectation.required_attributes;
      const span = getSpan(spans, itemExpectation.op, requiredAttrs, usedSpans);
      spanMap.set(fixtureId, span);

      // Mark this span as used
      if (span.span_id) {
        usedSpans.add(span.span_id);
      }

      // Validate required attributes and collect errors
      if (requiredAttrs) {
        if (!spanErrors.has(fixtureId)) {
          spanErrors.set(fixtureId, {
            expectedOp,
            actualOp: span.op,
            missing: [],
            mismatched: [],
          });
        }
        const spanError = spanErrors.get(fixtureId);

        // Validate attributes and collect errors
        const attrErrors = validateSpanAttributes(span, requiredAttrs);
        spanError.missing.push(...attrErrors.missing);
        spanError.mismatched.push(...attrErrors.mismatched);
      }
    } catch (error) {
      // getSpan threw an error - check if it's about missing attributes or missing span
      if (error.message.includes("but missing required attributes")) {
        // Span exists but has attribute issues - extract the details
        const requiredAttrs = itemExpectation.required_attributes;
        if (requiredAttrs) {
          // Find the span by op only (without attribute filtering)
          const opList = normalizeOpToList(itemExpectation.op, spans);
          const matchingSpan = spans.find((s) => opList.includes(s.op));

          if (matchingSpan) {
            if (!spanErrors.has(fixtureId)) {
              spanErrors.set(fixtureId, {
                expectedOp,
                actualOp: matchingSpan.op,
                missing: [],
                mismatched: [],
              });
            }
            const spanError = spanErrors.get(fixtureId);

            // Validate attributes and collect errors
            const attrErrors = validateSpanAttributes(matchingSpan, requiredAttrs);
            spanError.missing.push(...attrErrors.missing);
            spanError.mismatched.push(...attrErrors.mismatched);
          }
        }
      } else if (error.message.includes("No span found with op=")) {
        // Span doesn't exist at all
        if (!spanErrors.has(fixtureId)) {
          spanErrors.set(fixtureId, {
            expectedOp,
            actualOp: null,
            missing: [],
            mismatched: [],
            notFound: true,
          });
        }
      } else {
        // Other error - just append it
        errors.push(error.message);
      }
    }
  }

  // Format span errors in a structured way
  for (const [fixtureId, errorDetails] of spanErrors) {
    if (errorDetails.notFound) {
      errors.push(
        `    ${fixtureId} (expected: ${errorDetails.expectedOp}): span not found`
      );
    } else if (
      errorDetails.missing.length > 0 ||
      errorDetails.mismatched.length > 0
    ) {
      let errorMsg = `    ${fixtureId} (${errorDetails.actualOp}):`;

      for (const attr of errorDetails.missing) {
        errorMsg += `\n       ${attr}: missing`;
      }

      for (const mismatch of errorDetails.mismatched) {
        errorMsg += `\n       ${
          mismatch.attr
        }: mismatch (expected: ${JSON.stringify(
          mismatch.expected
        )}, got: ${JSON.stringify(mismatch.actual)})`;
      }

      errors.push(errorMsg);
    }
  }

  return spanMap;
}

/**
 * Validate captured Sentry data against a fixture
 *
 * @param {string} specId - The spec ID (e.g., "1-simple")
 * @param {Array} spans - Captured spans
 * @param {Array} transactions - Captured transactions
 * @param {Array} events - Captured events (optional)
 * @param {string} variant - The fixture variant (e.g., "agentic", "low-level")
 * @param {Object} overrides - Optional SDK config overrides to apply to fixture expectations
 * @returns {Object} Validation result with { passed, errors }
 */
function validateFixture(
  specId,
  spans,
  transactions,
  events = [],
  variant = "agentic",
  overrides = null
) {
  const fixture = loadFixture(specId, variant, overrides);
  const errors = [];

  // Log captured spans in verbose mode
  if (process.env.SENTRY_AI_TEST_VERBOSE === "true") {
    console.log("\n    === Captured Spans (Verbose) ===");
    if (spans.length === 0) {
      console.log("    No spans captured");
    } else {
      spans.forEach((span, index) => {
        console.log(`    Span ${index + 1}:`);
        console.log(`      op: ${span.op || "N/A"}`);
        console.log(`      description: ${span.description || "N/A"}`);
        console.log(`      span_id: ${span.span_id || "N/A"}`);
        console.log(`      parent_span_id: ${span.parent_span_id || "N/A"}`);
        if (span.data && Object.keys(span.data).length > 0) {
          console.log(`      data keys: ${Object.keys(span.data).join(", ")}`);
        }
      });
    }
    console.log("    === End Captured Spans ===\n");
  }

  // Validate transactions
  validateTransactions(transactions, fixture.expectations, errors);

  // Validate span counts
  validateSpanCounts(spans, fixture.expectations, errors);

  // Validate individual spans and relationships
  if (fixture.expectations.spans?.items) {
    const spanMap = validateSpanItems(spans, fixture.expectations.spans.items, errors);
    validateSpanRelationships(fixture.expectations.spans.items, spanMap, errors);
  }

  // Validate events
  validateEvents(events, fixture.expectations, errors);

  return {
    passed: errors.length === 0,
    errors,
    fixture,
  };
}

module.exports = {
  validateFixture,
  attributeMatches,  // Used by validator.test.cjs
};
