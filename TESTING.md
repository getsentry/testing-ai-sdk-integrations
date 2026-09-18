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

Inspect generated programs under `runs/`.

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

# Bounded parallel execution
npm test -- --framework openai -j=4
```

Use `--open` to open the generated dashboard after the run.

## Validation Expectations

Before finishing a change:

1. Run TypeScript and unit validation.
2. List or render every affected framework.
3. Run representative JavaScript and Python variants when provider credentials are available.
4. Inspect the native JSON and HTML reports.
5. Confirm runtime failures remain out of spec and product findings do not stop later probes.

## Reports and Logs

- Generated programs and execution logs: `runs/`
- Native reports: `test-results/assessment-report-*.json`
- Dashboards: `test-results/assessment-report-*.html`

Regenerate HTML from an existing native report:

```bash
npm run report -- test-results/assessment-report-<timestamp>.json
```

## Failure Policy

A report is produced even when product findings exist. The runner exits nonzero when variants are incomplete because setup, rendering, execution, collection, or protocol handling failed.

Do not skip a failing assessment to make CI green. Fix the integration, evaluator, harness, or runtime problem and preserve the evidence that explains the result.
