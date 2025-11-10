/**
 * Fixture loader - loads JSON test fixtures from shared/fixtures/
 */

const fs = require("fs");
const path = require("path");

/**
 * Load a fixture by spec ID and variant
 *
 * @param {string} specId - The spec ID (e.g., "1-simple", "2-simple-with-error")
 * @param {string} variant - The fixture variant (e.g., "agentic", "low-level")
 * @returns {Object} The parsed fixture object
 * @throws {Error} If fixture file not found
 */
function loadFixture(specId, variant = "agentic") {
  // Fixtures are in shared/specs/{specId}/fixture-{variant}.json
  const fixturePath = path.join(__dirname, "../../../specs", specId, `fixture-${variant}.json`);

  if (!fs.existsSync(fixturePath)) {
    throw new Error(`Fixture not found: ${specId} (variant: ${variant}) at ${fixturePath}`);
  }

  const content = fs.readFileSync(fixturePath, "utf-8");
  return JSON.parse(content);
}

module.exports = {
  loadFixture,
};
