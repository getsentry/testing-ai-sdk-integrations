/**
 * Setup file for Vercel AI SDK tests
 *
 * Initializes Sentry with Vercel AI-specific integrations.
 */

const Sentry = require("@sentry/node");
const { createTransport } = require("@sentry/core");
const { config } = require("dotenv");
const { resolve } = require("path");
const { createMockTransport } = require("../_test-utils/mock-transport.cjs");

// Load environment variables
config({ quiet: true, path: resolve(__dirname, ".env") });

// Initialize Sentry.
// NOTE: AI integrations are auto-enabled in the Node.js SDK and
// therefore do not need to be configured explicitly.
Sentry.init({
  dsn: process.env.SENTRY_DSN || "https://public@127.0.0.1/1",
  tracesSampleRate: 1.0,
  transport: createMockTransport(createTransport),
  sendDefaultPii: true,
});

module.exports = { Sentry };
