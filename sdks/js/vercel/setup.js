/**
 * Setup file for Vercel AI SDK tests
 *
 * Initializes Sentry with Vercel AI-specific integrations.
 */

const Sentry = require("@sentry/node");
const { config } = require("dotenv");
const { resolve } = require("path");
const { createMockTransport } = require("../_test-utils/mock-transport.cjs");

// Load environment variables
config({ path: resolve(__dirname, ".env") });

// Initialize Sentry with Vercel AI integration
Sentry.init({
  dsn: process.env.SENTRY_DSN || "https://public@127.0.0.1/1",
  tracesSampleRate: 1.0,
  transport: createMockTransport,
  sendDefaultPii: true,
  integrations: [
    Sentry.vercelAIIntegration({
      recordInputs: true,
      recordOutputs: true,
    }),
  ],
});

module.exports = { Sentry };
