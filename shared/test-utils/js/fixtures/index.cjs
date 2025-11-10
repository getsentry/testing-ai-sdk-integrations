/**
 * Fixtures - Test fixture system for validating Sentry captures
 *
 * Usage:
 *   const { validateFixture } = require('../../../shared/test-utils/js/fixtures');
 *   const result = validateFixture('G1', spans, transactions);
 *   assert(result.passed, result.errors.join('\n'));
 */

const { loadFixture } = require("./fixture-loader.cjs");
const { validateFixture } = require("./validator.cjs");

module.exports = {
  loadFixture,
  validateFixture,
};
