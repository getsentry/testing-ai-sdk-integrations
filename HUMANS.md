This repo (hopefully) contains everything needed to test Sentry SDK AI integrations for Python and JavaScript.

Quick start and other goodies can be found in (./README.md).

The entire repo was made with Claude Code, and all of the major changes (like refactorings, adding SDKs, etc.) should be done by an agent. Most directories contain README.md files that the agent is instructed to read and update when needed. `.claude/settings.json` make sure it can't read this file or your `.env`

### The Gist

- There is a separate project directory for every integration, ensuring they are independent of each other.
- The setup file contains code that should be executed before the tests and, in most cases, contains only Sentry SDK initialization with the correct options and mock transport.
- Every test performs real LLM calls.
- After it is done, the mock transport is used to extract all of the envelopes the SDK would send.
- The validator then extracts relevant spans and checks against the fixture.
- The result is reported in CTRF as JSON, HTML, and printed in the console.

#### What this can do:

Assert that AI integrations:

- correctly initialize
- capture all relevant spans in correct order/hierarchy
- correctly capture available attributes

#### What this can't do:

Assert that:

- captured spans are accepted by Relay
- attributes added/derived during ingestion are present and correct (model cost and span buffer)

### JS vs. Py

Some parts of the test logic are implemented twice (once for JS and once for Python). They can never be exactly the same, but it is vital that they are as close to each other as possible in terms of overall functionality, file names, function names, variable names, etc.

### Adding another AI SDK integration

- Should be a matter of prompting an agent to do so.
- Make sure to repeat that it should be consistent with the other SDKs.
- Double-check if it wrote BS tests just to have them pass.
- Make sure it DID NOT change any fixtures or validators to make the tests pass.
- Make sure the package versions are pinned.

### Adding more test cases

- The fixture should be written and double-checked by a human.
- The case should be implemented for all SDKs where it makes sense.
- If needed, it can be split into 2 flavors - "agentic" and "low-level."

### Versioning

- Every SDK has an independent Sentry SDK installation. This can be using the CLI but if you do so, make sure that the bersion is bumped everywhere.
