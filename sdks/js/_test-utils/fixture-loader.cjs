/**
 * Fixture loader - loads JSON test fixtures from shared/specs/
 */

const fs = require("fs");
const path = require("path");

// Cache for common spans
let commonSpansCache = null;

/**
 * Load common span definitions
 *
 * @returns {Object} Common span definitions
 */
function loadCommonSpans() {
  if (commonSpansCache) {
    return commonSpansCache;
  }

  const commonSpansPath = path.join(__dirname, "../../../shared/specs/common-spans.json");

  if (!fs.existsSync(commonSpansPath)) {
    return {};
  }

  const content = fs.readFileSync(commonSpansPath, "utf-8");
  commonSpansCache = JSON.parse(content);
  return commonSpansCache;
}

/**
 * Resolve $ref in a span item
 *
 * @param {Object} spanItem - Span item that may contain $ref
 * @param {Object} commonSpans - Common span definitions
 * @returns {Object} Resolved span item
 */
function resolveRef(spanItem, commonSpans) {
  if (!spanItem.$ref) {
    return spanItem;
  }

  // Parse $ref format: "common-spans#/span_name"
  const ref = spanItem.$ref;
  if (!ref.startsWith("common-spans#/")) {
    throw new Error(`Invalid $ref format: ${ref}. Expected format: "common-spans#/span_name"`);
  }

  const spanName = ref.substring("common-spans#/".length);
  const commonSpan = commonSpans[spanName];

  if (!commonSpan) {
    throw new Error(`Common span not found: ${spanName}`);
  }

  // Merge common span with overrides from the reference
  // Properties in spanItem (except $ref) override common span properties
  const { $ref, ...overrides } = spanItem;
  return { ...commonSpan, ...overrides };
}

/**
 * Apply overrides to a fixture object
 *
 * @param {Object} fixture - The fixture object to modify
 * @param {Object} overrides - Key-value pairs to override in the fixture
 * @returns {Object} The modified fixture object
 */
function applyOverrides(fixture, overrides) {
  if (!overrides || Object.keys(overrides).length === 0) {
    return fixture;
  }

  // Deep clone to avoid mutating original
  const result = JSON.parse(JSON.stringify(fixture));

  for (const [key, value] of Object.entries(overrides)) {
    // Handle special "model" shorthand - applies to inputs.model
    if (key === "model") {
      if (result.inputs) {
        result.inputs.model = value;
      }
      continue;
    }

    // Handle dot-notation paths in expectations (e.g., "gen_ai.request.model")
    // These override values in required_attributes
    if (result.expectations && result.expectations.spans && result.expectations.spans.items) {
      for (const spanItem of result.expectations.spans.items) {
        if (spanItem.required_attributes && key in spanItem.required_attributes) {
          spanItem.required_attributes[key] = value;
        }
      }
    }
  }

  return result;
}

/**
 * Load a fixture by spec ID and variant
 *
 * @param {string} specId - The spec ID (e.g., "1-simple", "2-simple-with-error")
 * @param {string} variant - The fixture variant (e.g., "agentic", "low-level")
 * @param {Object} overrides - Optional key-value overrides to apply to the fixture
 * @returns {Object} The parsed fixture object
 * @throws {Error} If fixture file not found
 */
function loadFixture(specId, variant = "agentic", overrides = null) {
  // Fixtures are in shared/specs/{specId}/fixture-{variant}.json
  // Path from sdks/js/_test-utils/ to shared/specs/
  const fixturePath = path.join(__dirname, "../../../shared/specs", specId, `fixture-${variant}.json`);

  if (!fs.existsSync(fixturePath)) {
    throw new Error(`Fixture not found: ${specId} (variant: ${variant}) at ${fixturePath}`);
  }

  const content = fs.readFileSync(fixturePath, "utf-8");
  const fixture = JSON.parse(content);

  // Resolve $ref references in span items
  if (fixture.expectations?.spans?.items) {
    const commonSpans = loadCommonSpans();
    fixture.expectations.spans.items = fixture.expectations.spans.items.map(item =>
      resolveRef(item, commonSpans)
    );
  }

  // Apply overrides if provided
  return applyOverrides(fixture, overrides);
}

module.exports = {
  loadFixture,
};
