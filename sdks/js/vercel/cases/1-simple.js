/**
 * 1-simple: Basic Completion
 *
 * Tests a simple chat completion request with OpenAI SDK
 * and verifies that Sentry captures the appropriate spans and AI monitoring data.
 */

const Sentry = require("@sentry/node");
const { generateText } = require("ai");
const { openai } = require("@ai-sdk/openai");
const { getMockSentryTransport } = require("../setup");
const {
  validateFixture,
  loadFixture,
} = require("../../../../shared/test-utils/js/fixtures/index.cjs");

// Framework type for this SDK (determines which fixture variant to use)
const FRAMEWORK_TYPE = "agentic";

module.exports = async function () {
  console.log("    Running 1-simple: Basic Completion");

  // Create main span for this test
  await Sentry.startSpan(
    { name: "1-simple-basic-completion", op: "test" },
    async () => {
      await runTest();
    }
  );

  // Flush Sentry to ensure all events are sent to transport
  await Sentry.flush(2000);

  // Small buffer to ensure transport has processed everything
  await new Promise((resolve) => setTimeout(resolve, 50));

  // Verify Sentry captured the expected data
  await assertSentryCaptured();

  console.log("    ✓ 1-simple completed");
};

async function runTest() {
  // Load test inputs from fixture
  const fixture = loadFixture("1-simple", FRAMEWORK_TYPE);
  const { model, system, prompt } = fixture.inputs;

  const { text } = await generateText({
    model: openai(model),
    system,
    prompt,
  });

  if (!text) {
    throw new Error("No completion returned from OpenAI");
  }

  console.log(`    Response: ${text}`);
}

async function assertSentryCaptured() {
  const transport = getMockSentryTransport();
  const spans = transport.getSpans();
  const transactions = transport.getTransactions();
  const events = transport.getEvents();

  console.log(
    `    Captured: ${spans.length} spans, ${transactions.length} transactions, ${events.length} events`
  );

  // Validate against 1-simple fixture
  const result = validateFixture("1-simple", spans, transactions, events, FRAMEWORK_TYPE);

  if (!result.passed) {
    console.log("    ✗ Validation failed:");
    result.errors.forEach((error) => console.log(`      - ${error}`));
    throw new Error(`Fixture validation failed:\n${result.errors.join("\n")}`);
  }

  console.log("    ✓ All fixture validations passed");
}
