/**
 * Fixture loader - loads JSON test fixtures from shared/fixtures/
 */

const fs = require("fs");
const path = require("path");

/**
 * Load a fixture by spec ID
 *
 * @param {string} specId - The spec ID (e.g., "G1", "G2", "S1")
 * @returns {Object} The parsed fixture object
 * @throws {Error} If fixture file not found
 */
function loadFixture(specId) {
  // Fixtures are in shared/fixtures/ (language-agnostic)
  const fixturePath = path.join(__dirname, "../../../fixtures", `${specId}.json`);

  if (!fs.existsSync(fixturePath)) {
    throw new Error(`Fixture not found: ${specId}.json at ${fixturePath}`);
  }

  const content = fs.readFileSync(fixturePath, "utf-8");
  return JSON.parse(content);
}

module.exports = {
  loadFixture,
};
