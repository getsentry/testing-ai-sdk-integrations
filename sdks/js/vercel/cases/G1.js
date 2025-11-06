/**
 * G1: Basic Completion
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
} = require("../../../../shared/test-utils/js/fixtures");

module.exports = async function () {
  console.log("    Running G1: Basic Completion");

  // Create main span for this test
  await Sentry.startSpan(
    { name: "G1-basic-completion", op: "test" },
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

  console.log("    ✓ G1 completed");
};

async function runTest() {
  // Load test inputs from fixture
  const fixture = loadFixture("G1");
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

  // Debug: print span ops and attributes
  console.log(`    DEBUG: Spans:`);
  spans.forEach((s, i) => {
    const dataKeys = Object.keys(s.data || {});
    console.log(`      ${i + 1}. op="${s.op}"`);
    if (dataKeys.length > 0) {
      console.log(
        `         data: ${JSON.stringify(s.data, null, 2)
          .split("\n")
          .slice(0, 10)
          .join("\n         ")}`
      );
    }
  });

  // Validate against G1 fixture
  const result = validateFixture("G1", spans, transactions, events);

  if (!result.passed) {
    console.log("    ✗ Validation failed:");
    result.errors.forEach((error) => console.log(`      - ${error}`));
    throw new Error(`Fixture validation failed:\n${result.errors.join("\n")}`);
  }

  console.log("    ✓ All fixture validations passed");
}
