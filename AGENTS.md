# Agent Instructions

## Purpose

- This repository assesses Sentry instrumentation for LLM SDKs and agent frameworks.
- Product findings are expected output; never hide findings to improve a score.

## Commands

| Task | Command |
| --- | --- |
| Install | `npm install` |
| Build | `npm run build` |
| Unit checks | `npm run test:unit` |
| List targets | `npm test -- list` |
| Render without executing | `npm test -- render --framework <name>` |
| Run a target | `npm test -- run --framework <name>` |
| Run one probe | `npm test -- run --framework <name> --probe <probe-id>` |

## Structure

- `src/assessment/`: matrix, execution, protocol, aggregation, and report types.
- `src/probes/`: canonical assessment inputs.
- `src/evaluation/`: telemetry normalizers, evaluators, and findings.
- `src/runner/templates/`: framework assessment adapters and configs.
- `src/span-collector/`: local Sentry envelope collector.
- `src/reporters/`: native JSON and HTML assessment reporting.
- `dist/`, `runs/`, and `test-results/` are generated; do not edit them directly.

## Conventions

- Use TypeScript ES modules with `.js` import extensions.
- Add frameworks under `src/runner/templates/{llm|agents}/{node|python|nextjs|cloudflare}/` with `config.json` and `assessment.njk`.
- Keep JavaScript and Python probe behavior aligned where both SDKs support a capability.
- Run the shared probe catalog consistently for every integration.
- Put API keys in `.env`; never commit secrets.
- Use config `options` for real API variations instead of duplicating framework directories.

## References

| Need | File |
| --- | --- |
| Setup and CLI | `README.md` |
| Architecture | `docs/ARCHITECTURE.md` |
| Validation workflow | `TESTING.md` |
| Template contract | `src/runner/templates/README.md` |
| Local SDK assessment | `docs/LOCAL_SENTRY_SDK.md` |
