/**
 * Setup file for OpenAI SDK tests
 *
 * This file contains lifecycle hooks that run before/after tests.
 * Using consolidated sdk-helpers to eliminate boilerplate.
 */

const Sentry = require("@sentry/node");
const { config } = require("dotenv");
const { resolve } = require("path");
const { createSDKSetup } = require("../_test-utils/sdk-helpers.cjs");

module.exports = createSDKSetup({
  sdkName: "OpenAI",
  initSentry: (createMockTransport) => {
    config({ path: resolve(__dirname, "../../../.env") });
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
  },
  closeSentry: () => Sentry.close(),
});
