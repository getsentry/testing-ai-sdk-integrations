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
Isolated probe attempts
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
        ├── ProbeResult: latest call outcomes and coverage
        ├── ProbeAttempt: immutable execution evidence for every attempt
        ├── ModelBehavior: scenario deviations, separate from telemetry
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
and streaming modes within a probe process, and each probe
records the call modes it exercised. Probes are not a matrix dimension.

### Probe Programs

`src/assessment/catalog.ts` defines ordered probe catalogs.
`src/probes/inputs.ts` supplies canonical provider-independent inputs.

`src/assessment/program-renderer.ts` renders a variant plan and one program per
probe attempt from shared base harnesses and framework adapters. A probe keeps
all its calls in one process, initializes Sentry, flushes evidence, and emits
prefixed JSON lifecycle events. Call/tool starts and outcomes include timestamps
and independent tool arguments/results. Event IDs deduplicate Wrangler console
and HTTP-response echoes; conflicting IDs are protocol failures.

A flush failure makes delivery uncertain. It does not establish a provider or
infrastructure root cause, and does not block independent later probes.

`src/assessment/protocol.ts` parses those events without treating ordinary
framework output as control data.

### Execution and Collection

`src/assessment/executor.ts` coordinates rendering, environment setup,
platform execution, protocol parsing, span collection, and evaluation for one
variant. The variant identity keeps the requested Sentry version used by stable
IDs, while `resolvedSentryVersion` records the package version actually installed.
Reporters consume this data without mutating the assessment report.

The default global limit is six variants. Probe processes acquire a separate
endpoint slot: two for the shared OpenRouter credential pool and two for Google.
Setup and retry backoff do not hold those slots. Each probe has a process-tree
deadline (180 seconds by default, with framework/CLI overrides). A retry always
uses a new process and collector project ID.

At most one retry follows a confirmed 429/5xx/network error, port collision, or
diagnostic timeout/flush failure. Backoff honors `Retry-After` without shortening
long server delays. SDK-internal retries remain inside the deadline. Recovery
is recorded separately; earlier failures and usable findings are retained.

Platform runners reuse dependency environments under `runs/`, while programs,
logs, dependency snapshots, and `attempt.json` files are execution-specific.
`src/span-collector/server.ts` receives Sentry envelopes under
a collision-free attempt project ID and normalizes transaction-embedded and span-v2 payloads into
`CapturedSpan` objects. Malformed envelopes are recorded as collector runtime
failures instead of being discarded.

`src/assessment/partition.ts` assigns spans to probes using trace and parent
relationships.

### Evaluation

Evaluators under `src/evaluation/` convert captured spans into atomic observations. Missing or malformed telemetry is data, not an exception. Prerequisite failures block dependent observations instead of creating cascades of derivative findings.

Call evidence limits evaluation to work actually attempted. Failed calls do not
require successful-response fields. Uncertain delivery blocks absence claims,
not defects in completed spans already received. Tool telemetry is compared
against independently recorded callback inputs/results, including repeated tool
executions and both call modes. Canonical prompt deviations are model-behavior
records, not instrumentation findings.

Normalizers distinguish modern, legacy, malformed, missing, and blocked capability states. `src/evaluation/findings.ts` maps actionable observations to stable, severity-ranked findings.

### Aggregation and Scoring

`src/assessment/aggregation.ts` deduplicates findings within variants and targets, derives completion and health, computes scores, and creates the report summary.

`src/assessment/scoring.ts` scores fixed telemetry domains rather than raw span
observations. Repeated spans add evidence without adding positive points. Each
domain uses its worst applicable outcome: healthy is 100, info is 95, minor is
80, major is 50, and critical is 20. Product-blocked domains inherit a critical
capture prerequisite so missing telemetry is not excluded from the score.

Scoring contract v4 scores observed telemetry independently of execution
coverage. The worst finding caps quality at 95 for info, 90 for minor, 75 for
major, or 59 for critical. No usable observations means `telemetryScore: null`,
not a passing result. Unknown scores are excluded from averages. Target scores
average assessed variants; the report averages assessed targets. Incomplete
execution remains `out_of_spec` regardless of telemetry quality.

### Reporting

`src/reporters/json-reporter.ts` writes the native schema-v2 JSON report. `src/reporters/assessment-html.ts` creates a standalone dashboard from the same typed data.

The dashboard shows a compact, searchable platform/framework matrix with:

- platform brand icons
- domain-weighted scores
- positive quality classifications
- runtime, version, mode, and option details
- findings, probes, trace trees, and artifacts

Scores of 85 and above use green at every report level. Red is reserved for
out-of-spec runtime execution. Product findings use yellow and amber states even
when their technical severity is critical.

### Automation

`action.yml` runs the same assessment CLI and exposes native completion, health, and finding metrics. It uploads reports and execution evidence, and creates a best-effort issue summary for reproduced execution failures or critical/major findings.

The daily workflow archives each native report under a run/attempt/execution key,
stores schema-v4 history without replacing same-day attempts or older scoring contracts, and publishes an overall score chart with framework, target, and
variant sparklines directly in the assessment dashboard. History entries retain scoring and matrix metadata so future scoring
changes are explicit. The pull request workflow compares matching variants by
stable finding and capability IDs on mutually completed probes with matching
call and tool outcomes. Earlier retry findings stay in the report but are not
compared against unrelated successful attempts. Execution health is separate;
missing coverage is neither an improvement nor an instrumentation regression.

## Completion and Product Quality

Completion and quality are separate:

- Any unrecovered primary execution failure makes a variant incomplete. Missing terminal events after process termination are retained as secondary symptoms.
- Expected provider/tool errors count as exercised calls. Recovered failures remain visible without making final execution incomplete.
- Missing, malformed, legacy, or incorrect telemetry creates product findings but does not stop later probes.
- A report is still written when product findings exist.
- The CLI exits nonzero when requested variants are incomplete.

## Generated Files

```text
runs/<platform>/<category>/<framework>/<variant-id>/executions/<executionId>/assessment.<ext>
runs/<platform>/<category>/<framework>/<variant-id>/executions/<executionId>/dependencies.json
runs/<platform>/<category>/<framework>/<variant-id>/executions/<executionId>/<probeId>/attempt-N/assessment.<ext>
runs/<platform>/<category>/<framework>/<variant-id>/executions/<executionId>/<probeId>/attempt-N/assessment.log
runs/<platform>/<category>/<framework>/<variant-id>/executions/<executionId>/<probeId>/attempt-N/attempt.json
test-results/assessment-report-<timestamp>.json
test-results/assessment-report-<timestamp>.html
```

Do not edit `dist/`, `runs/`, or `test-results/` directly. Rebuild, rerender, or rerun from `src/`.
