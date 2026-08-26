# For humans

This repository assesses Sentry AI instrumentation by running real SDK operations and evaluating the captured telemetry.

## The gist

- Framework configuration expands into target variants.
- One generated assessment program runs an ordered probe catalog for each variant.
- A local span collector receives Sentry envelopes.
- Evaluators produce atomic observations and severity-ranked findings.
- Native JSON and HTML reports preserve targets, variants, probes, findings, runtime failures, and span evidence.

Product telemetry defects do not stop later probes. Setup, protocol, provider, collector, or process failures can make a variant incomplete and block the remaining probes.

## Coverage

Assessments inspect capabilities including:

- GenAI client, agent, and tool spans
- span hierarchy and operation names
- request and response models
- token usage
- modern, legacy, missing, and malformed messages
- streaming and blocking operations
- sync and async Python execution
- provider and tool errors
- conversation IDs
- long-input trimming
- deprecated and unknown convention attributes

The collector does not verify Relay ingestion or server-side enrichment such as model cost.

## Adding an integration

- Add `config.json` and `assessment.njk` under `src/runner/templates/{llm|agents}/{platform}/<framework>/`.
- Keep equivalent JavaScript and Python operations aligned.
- Pin framework versions in `config.json`.
- Keep the shared probe catalog intact so every integration is evaluated consistently.
- Build, run unit checks, list discovery, and render the target before executing provider calls.

See `README.md`, `docs/ARCHITECTURE.md`, and `TESTING.md` for commands and design details.
