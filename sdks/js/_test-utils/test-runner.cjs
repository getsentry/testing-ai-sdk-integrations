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
    console.log(`    Running ${specId}: ${getTestDescription(specId)}`);

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

/**
 * Gets human-readable description for a test spec
 */
function getTestDescription(specId) {
  const descriptions = {
    "1-simple": "Basic Completion",
    "2-simple-with-error": "Basic Completion with Error",
    "3-multi-turn": "Multi-turn Conversation",
    "4-streaming": "Basic Streaming",
    "5-streaming-with-error": "Streaming with Error",
    "6-agent-success": "Agent Success Path",
    "7-agent-llm-error": "Agent LLM Error",
    "8-agent-tool-error": "Agent Tool Error",
  };
  return descriptions[specId] || specId;
}

module.exports = {
  runTestCase,
};
