# Sentry AI SDK Integration Assessments

Assesses Sentry instrumentation for LLM SDKs and agent frameworks across JavaScript, Python, Next.js, and Cloudflare Workers.

Each run expands framework configurations into runtime variants, executes isolated probe attempts, collects Sentry spans locally, and evaluates the captured GenAI telemetry. Product gaps remain visible as findings instead of failing the run like conventional tests.

## Requirements

- Node.js 22+
- npm 10+
- Python 3.10+ for unit checks and Python targets; [uv](https://docs.astral.sh/uv/) for Python target environments
- API keys for the providers being assessed

Copy `.env.example` to `.env` and add the required keys:

```bash
cp .env.example .env
npm install
npm run build
```

## Run Assessments

The assessment runner is the repository's `npm test` command:

```bash
# List targets and variant counts
npm test -- list

# Run all assessments
npm test
npm test -- run

# Render programs without calling providers
npm test -- setup
npm test -- render
```

Filter the assessment variant matrix:

```bash
npm test -- --framework openai
npm test -- --platform python
npm test -- --platform js
npm test -- --type llm
npm test -- --category agents
npm test -- --sync
npm test -- --option apiStyle=responses
npm test -- --probe llm.baseline
npm test -- --framework openai --framework 'vercel-*' --platform node --quick
npm test -- -j=4 --verbose
npm test -- --framework openai --open
```

`--platform js` includes Node.js, Next.js, and Cloudflare Workers. Repeat framework, platform, category, or probe filters to match any selected value. `--probe` is a debugging filter and does not add a probe-level report row. Use `--quick` to run one representative variant per target for a faster overview.

Use local Sentry SDK checkouts with `--sentry-python <path>` or `--sentry-javascript <path>`; see [docs/LOCAL_SENTRY_SDK.md](docs/LOCAL_SENTRY_SDK.md).

`npm run assess -- ...` remains an alias for the same runner.

### Execution Controls

The default is six concurrent variants, with at most two probe processes per
endpoint pool (OpenRouter or Google). OpenAI- and Anthropic-compatible adapters
share the OpenRouter limit; model vendor is not a separate credential pool.
Explicit `--parallel` values are honored, including values below six.

```bash
npm test -- run --parallel 6 --endpoint-limit openrouter=2 --endpoint-limit google=2
npm test -- run --probe-timeout 240 --retries 0
```

Each probe has a process deadline: 180 seconds by default, 300 seconds for
Cloudflare and Pydantic AI, or `executionTimeoutMs` from its config. The CLI
`--probe-timeout` override is in seconds. A deadline terminates the process tree,
not just the waiting promise. Independent probes continue in fresh processes;
all calls within a conversation probe share one process.

An eligible failed probe is retried once. Confirmed 429/5xx/network failures use
backoff and jitter, honoring `Retry-After`; delays above 120 seconds are not
shortened or retried automatically. Confirmed port collisions restart Wrangler
on a new port. Timeout and flush retries are **diagnostic recovery**, not proof
of a provider or infrastructure fault. SDK-default retries remain inside each
probe deadline. Use `--retries 0` to disable assessment-level retries.

## Assessment Model

The report hierarchy is:

```text
Assessment report
└── Target: platform/category/framework
    └── Variant: versions, execution environments, and options
        └── Probe: independent assessment scenario
            └── Attempts, calls, tool executions, findings, and span evidence
```

Setup or rendering failures can prevent execution. A failed probe does not block
independent later probes. Streaming and blocking calls run within a probe rather
than creating separate variants. The report distinguishes successful calls,
expected errors, failures, cancellations, and calls never executed.

Telemetry is evaluated against actual execution. Failed calls do not require
successful-response fields, and uncertain delivery does not establish that a
missing span was never emitted. Tool arguments and results are compared against
independent callback records, not the arguments the model was asked to produce.
Model deviations are reported separately. Findings and execution failures from
earlier attempts remain visible after recovery.

### Scores

Scoring contract v4 scores observed telemetry from 0 to 100 across telemetry
domains, independently of execution coverage. Span volume does not affect the score: repeated spans add evidence but
not positive points. Each domain uses its worst applicable finding, with quality
values of 95 for info, 80 for minor, 50 for major, and 20 for critical findings.
Healthy domains score 100.

The worst finding also limits the final score:

| Worst finding | Maximum score |
| ------------- | ------------: |
| Critical      |            59 |
| Major         |            75 |
| Minor         |            90 |
| Info          |            95 |
| None          |           100 |

No usable telemetry means `telemetryScore: null` (shown as `—`), not a passing
result. Unknown scores are excluded from target and overall averages. Target
scores average assessed variants; the overall score averages assessed targets
so each integration has equal influence. Incomplete execution remains out of
spec regardless of its telemetry score. Earlier scoring contracts are retained
in history but are not comparable with v4.

The dashboard presents the numeric score and finding count without adding a
quality label. Scores of 85 and above use green consistently across framework,
target, and variant rows. Incomplete execution remains visually distinct from
product findings.

## Reports

Each run writes:

```text
test-results/assessment-report-<timestamp>.json
test-results/assessment-report-<timestamp>.html
```

The JSON report is the source of truth. The standalone HTML dashboard shows one compact row per platform/framework target with its icon, score, and finding count. Internal variants, probes, trace trees, and runtime evidence remain available in the expandable detail view.

Regenerate a dashboard from an existing assessment report:

```bash
npm run report -- test-results/assessment-report-<timestamp>.json
```

Programs, logs, dependency snapshots, and immutable `attempt.json` evidence are
stored under `runs/<platform>/<category>/<framework>/<variant>/executions/<executionId>/`.
Each probe has separate `attempt-1/` and, when retried, `attempt-2/` directories.

## GitHub Action

Use the repository action anywhere the previous integration runner was used. It now
runs assessments and returns native report metrics:

```yaml
- id: assess
  uses: getsentry/testing-ai-sdk-integrations@main
  with:
    platform: node
    framework: openai
    parallel: 4
    openai-api-key: ${{ secrets.OPENAI_API_KEY }}
    openrouter-api-key: ${{ secrets.OPENROUTER_API_KEY }}
    google-genai-api-key: ${{ secrets.GOOGLE_GENAI_API_KEY }}
```

Outputs include `report-path`, `targets`, `variants`, `complete`, `incomplete`,
`recovered`, `critical`, `major`, `minor`, `info`, and `health`. Product findings do not fail
the action. Incomplete execution returns a nonzero exit code.

The daily workflow publishes native JSON and HTML reports plus schema-v4 trend
history. Same-day runs and GitHub reruns have distinct archives at
`reports/<date>/<runId>-<runAttempt>-<executionId>/`, containing `index.html` and
losslessly compressed `assessment.json.gz`. Root and date HTML URLs redirect to
the latest report; their `assessment.json` endpoints remain uncompressed aliases. Execution evidence and reports are retained as separate,
attempt-specific GitHub artifacts for 90 days. Deployment stops if existing
history or archived reports cannot be preserved; new assessment artifacts are
still uploaded. Legacy dated reports are copied into immutable archives before
their aliases change; historical date aliases remain available. The assessment dashboard shows the overall score chart below the search
bar and uses the same score styling and sparklines for frameworks, targets, and
variants. The pull request workflow compares stable finding and capability IDs
on comparable completed calls and tool outcomes. Execution failures and model
behavior are reported separately from instrumentation regressions.

## How It Works

1. `src/runner/framework-discovery.ts` discovers framework configurations.
2. `src/assessment/matrix.ts` resolves framework versions, Sentry versions, execution environments, and options into variants.
3. `src/assessment/program-renderer.ts` renders a variant plan and each probe attempt.
4. Platform runners execute probes in isolated processes with endpoint limits and bounded recovery.
5. `src/span-collector/server.ts` receives and partitions Sentry spans.
6. Evaluators create capability observations and severity-ranked findings.
7. Aggregation writes native JSON and HTML assessment reports.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the architecture and [TESTING.md](TESTING.md) for validation commands.

## Adding a Framework

Create a framework directory under:

```text
src/runner/templates/{llm|agents}/{node|python|nextjs|cloudflare}/<framework>/
```

Add `config.json` and an assessment adapter such as `assessment.njk`, then validate discovery and rendering:

```bash
npm run build
npm test -- list --framework <framework>
npm test -- render --framework <framework>
```

Keep model expectations and framework options explicit. Do not hide known telemetry gaps to make an assessment look healthy.
