# Testing and Validation

Assessment findings are expected output. Do not suppress findings to improve a score.

## Fast Validation

After changing TypeScript or templates:

```bash
npm run build
npm run test:unit
npm test -- list
```

Render a focused target without provider calls:

```bash
npm test -- render --framework openai --platform node
npm test -- render --framework openai --platform python --sync
```

Inspect generated programs under `runs/`. Unit checks parse every matrix variant,
exercise JavaScript/Python lifecycle helpers, verify process-tree cancellation,
and test retry, scoring, comparison, and same-day archive behavior without
provider calls.

## Focused Assessment Runs

```bash
# One framework
npm test -- --framework openai --verbose

# One platform or category
npm test -- --platform python
npm test -- --type agents

# One Python execution branch
npm test -- --sync
npm test -- --async

# One option branch
npm test -- --framework openai --option apiStyle=responses

# Fast representative overview
npm test -- --framework openai --framework 'vercel-*' --platform node --quick

# Bounded parallel execution (explicit low values are honored)
npm test -- --framework openai -j=4 --endpoint-limit openrouter=2

# Diagnose without assessment-level retries; deadline is in seconds
npm test -- --framework openai --probe-timeout 240 --retries 0

# Exercise real Sentry SDKs without provider calls
npm test -- run --framework manual --parallel 2
```

Use `--open` to open the generated dashboard after the run.

## Validation Expectations

Before finishing a change:

1. Run TypeScript and unit validation.
2. List or render every affected framework.
3. Run representative JavaScript and Python variants when provider credentials are available.
4. Inspect the native JSON and HTML reports.
5. Confirm unrecovered execution failures remain out of spec and independent probes continue.
6. Inspect every retry attempt, not just the final result. Recovery must not erase findings.
7. For agent changes, verify tool callback arguments/results in both supported call modes; model deviations are not telemetry corruption.

## Reports and Logs

- Stable dependency environments: `runs/<platform>/<category>/<framework>/<variant>/`
- Run evidence: `executions/<executionId>/dependencies.json`, `setup.log`, and the rendered variant plan
- Probe attempts: `executions/<executionId>/<probeId>/attempt-N/{assessment.js|assessment.py,assessment.log,attempt.json}`
- Native reports: `test-results/assessment-report-*.json`
- Dashboards: `test-results/assessment-report-*.html`

Regenerate HTML from an existing native report:

```bash
npm run report -- test-results/assessment-report-<timestamp>.json
```

## Failure Policy

A report is produced even when product findings exist. The runner exits nonzero when variants are incomplete because setup, rendering, execution, collection, or protocol handling failed.

A recovered timeout or flush failure is still evidence, not proof of an external
root cause. Completion, observed telemetry quality, call coverage, and model
behavior must be reviewed separately. Never interpret fewer executed calls as
an improvement; comparisons require matching execution coverage.

Do not skip a failing assessment to make CI green. Fix the integration, evaluator, harness, or runtime problem and preserve the evidence that explains the result.
