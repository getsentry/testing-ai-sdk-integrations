/**
 * Setup file for OpenAI SDK tests
 *
 * This file contains lifecycle hooks that run before/after tests:
 * - beforeAll: Runs once before all test cases
 * - beforeEach: Runs before each test case
 * - afterEach: Runs after each test case
 * - afterAll: Runs once after all test cases
 */

const Sentry = require("@sentry/node");
const { config } = require("dotenv");
const { resolve } = require("path");
const {
  createMockTransport,
  getMockTransport,
  clearMockTransport,
} = require("../../../shared/test-utils/js/mock-transport.js");

/**
 * Runs once before all test cases
 * Initialize Sentry with mock transport
 */
async function beforeAll() {
  console.log("🔧 Setting up OpenAI SDK tests...");

  // Load environment variables from root .env file
  config({ path: resolve(__dirname, "../../../.env") });

  // Initialize Sentry with mock transport
  Sentry.init({
    dsn: process.env.SENTRY_DSN || "https://public@127.0.0.1/1",
    tracesSampleRate: 1.0,
    transport: createMockTransport,
    sendDefaultPii: true,
    integrations: [
      Sentry.openAIIntegration({
        recordInputs: true,
        recordOutputs: true,
      }),
    ],
  });

  console.log("  ✓ Sentry initialized with mock transport");
}

/**
 * Runs before each test case
 * Reset mock transport and clear any state
 */
async function beforeEach() {
  console.log("  ↻ Resetting test state...");
  clearMockTransport();
}

/**
 * Runs after each test case
 * Clean up any resources
 */
async function afterEach() {
  console.log("  ✓ Cleaning up...");
}

/**
 * Runs once after all test cases
 * Teardown Sentry and clean up
 */
async function afterAll() {
  console.log("🧹 Tearing down OpenAI SDK tests...");
  await Sentry.close();
}

/**
 * Helper function to get mock transport for assertions
 */
function getMockSentryTransport() {
  return getMockTransport();
}

module.exports = {
  beforeAll,
  beforeEach,
  afterEach,
  afterAll,
  getMockSentryTransport,
};
