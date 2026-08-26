# Architecture

## Purpose

This repository assesses Sentry instrumentation for LLM SDKs and agent frameworks. It gathers runtime evidence, identifies independent telemetry gaps, and keeps those findings separate from execution failures.

## Assessment Flow

```text
Framework config
      │
      ▼
Target and variant resolution
      │
      ▼
Assessment program rendering
      │
      ▼
Ordered probe execution
      │
      ▼
Local Sentry span collector
      │
      ▼
Normalization and evaluation
      │
      ▼
Findings, scores, JSON, and HTML
```

## Domain Hierarchy

```text
AssessmentReport
└── TargetAssessment: platform/category/framework
    └── VariantAssessment: versions, modes, and options
        ├── ProbeResult
        ├── Observation
        ├── Finding
        ├── RuntimeFailure
        └── CapturedSpan
```

Targets preserve the native report hierarchy. The HTML overview shows one compact row and one score for each platform/framework target; internal variants remain available on expansion.

## Main Components

### CLI

`src/assessment-cli.ts` is the entry point for both `npm test` and `npm run assess`. It discovers targets, applies target and variant filters, renders programs, executes variants with bounded concurrency, and writes reports.

Supported categories are `llm` and `agents`. Supported platforms are Node.js, Python, Next.js, and Cloudflare Workers. The `js` filter includes Node.js, Next.js, and Cloudflare Workers.

### Framework Discovery and Matrix

`src/runner/framework-discovery.ts` discovers framework configurations under:

```text
src/runner/templates/<category>/<platform>/<framework>/
```

`src/assessment/discovery.ts` converts discovered configuration into the
assessment schema. `src/assessment/matrix.ts` expands framework versions,
Sentry versions, execution environments, and option axes into stable variant
IDs. Streaming is not a variant axis: each canonical call runs in both blocking
and streaming modes inside one ordered assessment program, and each probe
records the call modes it exercised. Probes are not a matrix dimension.

### Probe Programs

`src/assessment/catalog.ts` defines ordered probe catalogs.
`src/probes/inputs.ts` supplies canonical provider-independent inputs.

`src/assessment/program-renderer.ts` renders one program per variant from
platform base harnesses and framework assessment adapters. The generated
harness initializes Sentry once, runs applicable probes in order, flushes
evidence, and emits prefixed JSON lifecycle and runtime-failure events. Flush
timeouts and errors stop later probes and make the variant incomplete.

`src/assessment/protocol.ts` parses those events without treating ordinary
framework output as control data.

### Execution and Collection

`src/assessment/executor.ts` coordinates rendering, environment setup,
platform execution, protocol parsing, span collection, and evaluation for one
variant. The variant identity keeps the requested Sentry version used by stable
IDs, while `resolvedSentryVersion` records the package version actually installed.
Reporters consume this data without mutating the assessment report.

Platform runners implement a shared execution contract and create isolated environments under `runs/` and preserve
execution logs. `src/span-collector/server.ts` receives Sentry envelopes under
a variant run ID and normalizes transaction-embedded and span-v2 payloads into
`CapturedSpan` objects. Malformed envelopes are recorded as collector runtime
failures instead of being discarded.

`src/assessment/partition.ts` assigns spans to probes using trace and parent
relationships.

### Evaluation

Evaluators under `src/evaluation/` convert captured spans into atomic observations. Missing or malformed telemetry is data, not an exception. Prerequisite failures block dependent observations instead of creating cascades of derivative findings.

Normalizers distinguish modern, legacy, malformed, missing, and blocked capability states. `src/evaluation/findings.ts` maps actionable observations to stable, severity-ranked findings.

### Aggregation and Scoring

`src/assessment/aggregation.ts` deduplicates findings within variants and targets, derives completion and health, computes scores, and creates the report summary.

`src/assessment/scoring.ts` calculates a severity-weighted observation average:

| Finding severity | Quality value | Weight |
| ---------------- | ------------: | -----: |
| Critical         |             0 |     10 |
| Major            |            50 |      5 |
| Minor            |            80 |      2 |
| Info             |            95 |      1 |

Healthy observations receive 100 with weight 1. Blocked observations do not
affect the score. Incomplete execution receives score 0 and the `out_of_spec`
classification. Target scores average their variants; the report score averages
targets so integrations with more variants do not dominate the user-facing
result.

### Reporting

`src/reporters/json-reporter.ts` writes the native schema-v2 JSON report. `src/reporters/assessment-html.ts` creates a standalone dashboard from the same typed data.

The dashboard shows a compact, searchable platform/framework matrix with:

- platform brand icons
- severity-weighted scores
- positive quality classifications
- runtime, version, mode, and option details
- findings, probes, trace trees, and artifacts

Scores of 85 and above use green at every report level. Red is reserved for
out-of-spec runtime execution. Product findings use yellow and amber states even
when their technical severity is critical.

### Automation

`action.yml` runs the same assessment CLI and exposes native completion, health, and finding metrics. It uploads JSON and HTML reports and creates a best-effort issue summary for incomplete execution or critical and major findings.

The daily workflow archives each native report, stores compact schema-v3
history, and publishes an overall score chart with framework, target, and
variant sparklines directly in the assessment dashboard. History entries retain scoring and matrix metadata so future scoring
changes are explicit. The pull request workflow compares matching variants by
stable finding and capability IDs. Existing findings do not fail pull requests
unless they are new or become worse.

## Completion and Product Quality

Completion and quality are separate:

- A stopping setup, rendering, process, timeout, collector, flush, or protocol failure makes a variant incomplete.
- Missing, malformed, legacy, or incorrect telemetry creates product findings but does not stop later probes.
- A report is still written when product findings exist.
- The CLI exits nonzero when requested variants are incomplete.

## Generated Files

```text
runs/<platform>/<category>/<framework>/<variant-id>/assessment.<ext>
runs/<platform>/<category>/<framework>/<variant-id>/assessment.log
test-results/assessment-report-<timestamp>.json
test-results/assessment-report-<timestamp>.html
```

Do not edit `dist/`, `runs/`, or `test-results/` directly. Rebuild, rerender, or rerun from `src/`.
