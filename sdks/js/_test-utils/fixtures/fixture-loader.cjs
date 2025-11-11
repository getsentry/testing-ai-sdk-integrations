/**
 * Fixture loader - loads JSON test fixtures from shared/fixtures/
 */

const fs = require("fs");
const path = require("path");

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
  // Path from sdks/js/_test-utils/fixtures/ to shared/specs/
  const fixturePath = path.join(__dirname, "../../../../shared/specs", specId, `fixture-${variant}.json`);

  if (!fs.existsSync(fixturePath)) {
    throw new Error(`Fixture not found: ${specId} (variant: ${variant}) at ${fixturePath}`);
  }

  const content = fs.readFileSync(fixturePath, "utf-8");
  const fixture = JSON.parse(content);

  // Apply overrides if provided
  return applyOverrides(fixture, overrides);
}

module.exports = {
  loadFixture,
};
