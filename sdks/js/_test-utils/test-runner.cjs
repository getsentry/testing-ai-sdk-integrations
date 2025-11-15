/**
 * Test runner helper - orchestrates test execution with minimal boilerplate
 */

const { loadFixture } = require("./fixture-loader.cjs");
const { validateFixture } = require("./validator.cjs");
const { getMockTransport } = require("./mock-transport.cjs");

/**
 * Run a test case with automatic fixture loading, span wrapping, and validation
 *
 * @param {string} specId - Test spec ID (e.g., "1-simple")
 * @param {Function} testLogic - Async function containing SDK-specific test logic
 * @param {Object} Sentry - Sentry SDK instance
 * @returns {Function} Test function ready to be exported
 */
function runTestCase(specId, testLogic, Sentry) {
  return async function () {
    const sdkPath = process.env.SDK_PATH || 'unknown';

    // Load SDK config from environment
    const sdkConfig = process.env.SDK_CONFIG
      ? JSON.parse(process.env.SDK_CONFIG)
      : null;

    if (!sdkConfig?.framework_type) {
      throw new Error(
        "SDK_CONFIG with framework_type must be provided via environment variable"
      );
    }

    const frameworkType = sdkConfig.framework_type;

    // Load config overrides from environment
    const overrides = process.env.SDK_CONFIG_OVERRIDES
      ? JSON.parse(process.env.SDK_CONFIG_OVERRIDES)
      : null;

    // Load fixture inputs with overrides applied
    const fixture = loadFixture(specId, frameworkType, overrides);

    // Log with test name from fixture
    console.log(`\n  [${sdkPath}]`);
    console.log(`    Running ${specId}: ${fixture.name || specId}`);

    // Create main span for this test
    await Sentry.startSpan({ name: `${specId}-test`, op: "test" }, async () => {
      await testLogic(fixture.inputs);
    });

    // Flush Sentry to ensure all events are sent to transport
    await Sentry.flush(2000);

    // Small buffer to ensure transport has processed everything
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Verify Sentry captured the expected data
    const transport = getMockTransport();
    const spans = transport.getSpans();
    const transactions = transport.getTransactions();
    const events = transport.getEvents();

    console.log(
      `    Captured: ${spans.length} spans, ${transactions.length} transactions, ${events.length} events`
    );

    const result = validateFixture(
      specId,
      spans,
      transactions,
      events,
      frameworkType,
      overrides
    );

    if (!result.passed) {
      console.log("    ✗ Validation failed:");
      result.errors.forEach((error) => console.log(`      - ${error}`));
      throw new Error(
        `Fixture validation failed:\n${result.errors.join("\n")}`
      );
    }

    console.log("    ✓ All fixture validations passed");
    console.log(`    ✓ ${specId} completed`);
  };
}

module.exports = {
  runTestCase,
};
