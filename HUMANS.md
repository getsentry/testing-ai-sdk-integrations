This repo (hopefully) contains everything needed to test Sentry SDK AI integrations for Python and JavaScript.

Quick start and other goodies can be found in [README.md](./README.md).

The entire repo was made with Claude Code, and all of the major changes (like refactorings, adding SDKs, etc.) should be done by an agent. Most directories contain README.md files that the agent is instructed to read and update when needed. `.claude/settings.json` makes sure it can't read this file or your `.env`

### The Gist

- Test definitions (TypeScript) + framework templates (Nunjucks) = generated test files
- A span collector HTTP server acts as a mock Sentry endpoint
- Tests make real LLM calls and the Sentry SDK captures spans
- The validator runs check functions against captured spans
- Results are reported as CTRF JSON, HTML, and printed to the console

#### What this can do:

Assert that AI integrations:

- correctly initialize
- capture all relevant spans in correct order/hierarchy
- correctly capture available attributes (model, tokens, messages, tool calls)
- properly handle streaming vs blocking modes
- properly handle sync vs async execution (Python)
- trim long messages and redact binary content

#### What this can't do:

Assert that:

- captured spans are accepted by Relay
- attributes added/derived during ingestion are present and correct (model cost and span buffer)

### JS vs. Py

The test cases are defined once in TypeScript and then rendered for each framework using Nunjucks templates. While the templates differ between JS and Python, they aim to produce equivalent behavior. Framework-specific quirks are handled in templates and the `skip` configuration.

### Adding another AI SDK integration

- Should be a matter of prompting an agent to do so
- Make sure to repeat that it should be consistent with the other SDKs
- Double-check if it wrote BS tests just to have them pass
- Make sure it DID NOT change any check functions or skip configurations to make the tests pass
- Make sure the package versions are pinned in `config.json`

### Adding more test cases

- The check functions should be written and double-checked by a human
- The case should be implemented for all SDKs where it makes sense
- Test cases are split by type: `llm` (low-level SDKs) and `agent` (agentic frameworks)
- Use existing check functions from `checks.ts` when possible
- Add new checks to `checks.ts` if they're reusable across tests

### Versioning

- Every framework has an independent Sentry SDK version specified in `config.json`
- The `sentryVersions` array can include specific versions or `"latest"`
- Framework versions are specified in the `versions` array
- Dependencies use `"framework"` as version to inherit from the framework version
