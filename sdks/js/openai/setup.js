/**
 * Setup file for OpenAI SDK tests
 *
 * Initializes Sentry with OpenAI-specific integrations.
 */

const Sentry = require("@sentry/node");
const { config } = require("dotenv");
const { resolve } = require("path");
const { createMockTransport } = require("../_test-utils/mock-transport.cjs");

// Load environment variables
config({ quiet: true, path: resolve(__dirname, "../../../.env") });

// Initialize Sentry with OpenAI integration
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

module.exports = { Sentry };
