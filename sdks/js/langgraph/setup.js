/**
 * Setup file for LangGraph SDK tests
 *
 * Initializes Sentry with LangChain-specific integrations (LangGraph uses LangChain).
 */

const Sentry = require("@sentry/node");
const { createTransport } = require("@sentry/core");
const { config } = require("dotenv");
const { resolve } = require("path");
const { createMockTransport } = require("../_test-utils/mock-transport.cjs");

// Load environment variables
config({ quiet: true, path: resolve(__dirname, "../../../.env") });

// Initialize Sentry with LangChain integration (LangGraph uses LangChain under the hood)
Sentry.init({
  dsn: process.env.SENTRY_DSN || "https://public@127.0.0.1/1",
  tracesSampleRate: 1.0,
  transport: createMockTransport(createTransport),
  sendDefaultPii: true,
  integrations: [
    Sentry.langGraphIntegration({
      recordInputs: true,
      recordOutputs: true,
    }),
  ],
});

module.exports = { Sentry };
