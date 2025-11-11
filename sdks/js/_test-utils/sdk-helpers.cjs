/**
 * Consolidated SDK Test Helpers for JavaScript
 *
 * This module provides utilities to eliminate boilerplate in SDK test implementations:
 * - Setup factory for lifecycle hooks
 * - Test orchestration wrapper
 * - Config override handling
 * - Assertion helpers
 *
 * NOTE: This file does NOT require @sentry/node or dotenv to avoid dependencies.
 * Instead, setup files pass configured functions/objects.
 */

const {
  createMockTransport,
  getMockTransport,
  clearMockTransport,
} = require("./mock-transport.cjs");
const {
  validateFixture,
  loadFixture,
} = require("./fixtures/index.cjs");

/**
 * Creates a complete setup module with lifecycle hooks for an SDK
 *
 * @param {Object} options - Configuration options
 * @param {string} options.sdkName - Name of the SDK (for logging)
 * @param {Function} options.initSentry - Function that initializes Sentry (receives createMockTransport)
 * @param {Function} options.closeSentry - Function that closes Sentry
 * @returns {Object} Module with beforeAll, beforeEach, afterEach, afterAll, getMockSentryTransport
 *
 * @example
 * // In sdks/js/openai/setup.js:
 * const Sentry = require('@sentry/node');
 * const { config } = require('dotenv');
 * const { resolve } = require('path');
 * const { createSDKSetup } = require('../../../shared/test-utils/js/sdk-helpers.cjs');
 *
 * module.exports = createSDKSetup({
 *   sdkName: 'OpenAI',
 *   initSentry: (createMockTransport) => {
 *     config({ path: resolve(__dirname, '../../../.env') });
 *     Sentry.init({
 *       dsn: process.env.SENTRY_DSN || 'https://public@127.0.0.1/1',
 *       tracesSampleRate: 1.0,
 *       transport: createMockTransport,
 *       sendDefaultPii: true,
 *       integrations: [Sentry.openAIIntegration({ recordInputs: true, recordOutputs: true })],
 *     });
 *   },
 *   closeSentry: () => Sentry.close(),
 * });
 */
function createSDKSetup({ sdkName, initSentry, closeSentry }) {
  async function beforeAll() {
    console.log(`🔧 Setting up ${sdkName} tests...`);

    // Initialize Sentry with mock transport
    initSentry(createMockTransport);

    console.log("  ✓ Sentry initialized with mock transport");
  }

  async function beforeEach() {
    console.log("  ↻ Resetting test state...");
    clearMockTransport();
  }

  async function afterEach() {
    console.log("  ✓ Cleaning up...");
  }

  async function afterAll() {
    console.log(`🧹 Tearing down ${sdkName} tests...`);
    await closeSentry();
  }

  function getMockSentryTransport() {
    return getMockTransport();
  }

  return {
    beforeAll,
    beforeEach,
    afterEach,
    afterAll,
    getMockSentryTransport,
  };
}

/**
 * Loads config override from environment variable
 *
 * @returns {Object|null} Parsed config object or null if not set/invalid
 */
function loadConfigOverride() {
  // Check both possible environment variable names (for backwards compatibility)
  const overrideJson = process.env.SDK_CONFIG_OVERRIDES || process.env.SENTRY_AI_TEST_CONFIG_OVERRIDE;
  if (!overrideJson) {
    return null;
  }

  try {
    return JSON.parse(overrideJson);
  } catch (error) {
    console.warn(`⚠️  Failed to parse config override: ${error.message}`);
    return null;
  }
}

/**
 * Extracts inputs from fixture with optional config override
 *
 * @param {string} specId - Test spec ID (e.g., "1-simple")
 * @param {string} frameworkType - Framework type ("agentic" or "low-level")
 * @returns {Object} Fixture inputs (potentially overridden)
 */
function getFixtureInputs(specId, frameworkType) {
  const fixture = loadFixture(specId, frameworkType);
  const configOverride = loadConfigOverride();

  // Merge config override if present
  if (configOverride) {
    return { ...fixture.inputs, ...configOverride };
  }

  return fixture.inputs;
}

/**
 * Extracts all transport data (spans, transactions, events)
 *
 * @param {Function} getMockSentryTransport - Function to get mock transport
 * @returns {Object} Object with spans, transactions, events arrays
 */
function getTransportData(getMockSentryTransport) {
  const transport = getMockSentryTransport();
  return {
    spans: transport.getSpans(),
    transactions: transport.getTransactions(),
    events: transport.getEvents(),
  };
}

/**
 * Validates captured Sentry data against fixture expectations
 *
 * @param {string} specId - Test spec ID
 * @param {Array} spans - Captured spans
 * @param {Array} transactions - Captured transactions
 * @param {Array} events - Captured events
 * @param {string} frameworkType - Framework type
 * @throws {Error} If validation fails
 */
function assertSentryFixture(specId, spans, transactions, events, frameworkType) {
  console.log(
    `    Captured: ${spans.length} spans, ${transactions.length} transactions, ${events.length} events`
  );

  const result = validateFixture(specId, spans, transactions, events, frameworkType);

  if (!result.passed) {
    console.log("    ✗ Validation failed:");
    result.errors.forEach((error) => console.log(`      - ${error}`));
    throw new Error(`Fixture validation failed:\n${result.errors.join("\n")}`);
  }

  console.log("    ✓ All fixture validations passed");
}

/**
 * Orchestrates a complete test case execution
 *
 * Handles:
 * - Fixture loading
 * - Span wrapping
 * - Flushing
 * - Validation
 * - Error handling
 *
 * @param {string} specId - Test spec ID (e.g., "1-simple")
 * @param {string} frameworkType - Framework type ("agentic" or "low-level")
 * @param {Function} testLogic - Async function containing SDK-specific test logic
 * @param {Function} getMockSentryTransport - Function to get mock transport
 * @returns {Function} Test function ready to be exported
 *
 * @example
 * // In sdks/js/openai/cases/1-simple.js:
 * const { runTestCase } = require('../../../../shared/test-utils/js/sdk-helpers.cjs');
 * const { getMockSentryTransport } = require('../setup');
 * const { Configuration, OpenAIApi } = require('openai');
 *
 * async function testLogic(inputs) {
 *   const { model, system, prompt } = inputs;
 *   const openai = new OpenAIApi(new Configuration({ apiKey: process.env.OPENAI_API_KEY }));
 *   const response = await openai.createChatCompletion({ model, messages: [...] });
 *   return response.data;
 * }
 *
 * module.exports = runTestCase('1-simple', 'low-level', testLogic, getMockSentryTransport);
 */
function runTestCase(specId, frameworkType, testLogic, getMockSentryTransport, startSpan, flushSentry) {
  return async function () {
    console.log(`    Running ${specId}: ${getTestDescription(specId)}`);

    // Create main span for this test
    await startSpan(
      { name: `${specId}-test`, op: "test" },
      async () => {
        // Load inputs from fixture
        const inputs = getFixtureInputs(specId, frameworkType);

        // Run the SDK-specific test logic
        await testLogic(inputs);
      }
    );

    // Flush Sentry to ensure all events are sent to transport
    await flushSentry(2000);

    // Small buffer to ensure transport has processed everything
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Verify Sentry captured the expected data
    const { spans, transactions, events } = getTransportData(getMockSentryTransport);
    assertSentryFixture(specId, spans, transactions, events, frameworkType);

    console.log(`    ✓ ${specId} completed`);
  };
}

/**
 * Gets human-readable description for a test spec
 *
 * @param {string} specId - Test spec ID
 * @returns {string} Description
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
  createSDKSetup,
  runTestCase,
  loadConfigOverride,
  getFixtureInputs,
  getTransportData,
  assertSentryFixture,
  getTestDescription,
};
