# Sentry AI SDK Integration Assessments

Assesses Sentry instrumentation for LLM SDKs and agent frameworks across JavaScript, Python, Next.js, and Cloudflare Workers.

Each run expands framework configurations into runtime variants, executes an ordered probe program, collects Sentry spans locally, and evaluates the captured GenAI telemetry. Product gaps remain visible as findings instead of failing the run like conventional tests.

## Requirements

- Node.js 22+
- npm 10+
- Python 3.10+ and [uv](https://docs.astral.sh/uv/) for Python targets
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

## Assessment Model

The report hierarchy is:

```text
Assessment report
└── Target: platform/category/framework
    └── Variant: versions, execution environments, and options
        └── Probe: one runtime operation
            └── Observations, findings, and span evidence
```

A runtime failure can stop a variant and block later probes. Product telemetry
findings do not stop execution, so one run can capture several independent
improvements. Streaming and blocking calls run together inside the same
assessment program instead of creating separate variants. Each canonical call
is executed once in each mode, and the report records the modes covered by
every probe.

### Scores

Every variant receives a score from 0 to 100 across a fixed set of telemetry
domains. Span volume does not affect the score: repeated spans add evidence but
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

A variant that never starts scores 0. Partial execution receives a positive
coverage-adjusted score and remains classified as out of spec. Target scores
average their capped variant scores. The overall score averages targets so every
integration has equal influence regardless of its variant count.

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

Generated programs and execution logs are stored under `runs/`.

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
`critical`, `major`, `minor`, `info`, and `health`. Product findings do not fail
the action. Incomplete execution returns a nonzero exit code.

The daily workflow publishes native JSON and HTML reports plus schema-v3 trend
history. The assessment dashboard shows the overall score chart below the search
bar and uses the same score styling and sparklines for frameworks, targets, and
variants. The pull request workflow compares stable finding and capability IDs
and fails only when it detects an explicit regression.

## How It Works

1. `src/runner/framework-discovery.ts` discovers framework configurations.
2. `src/assessment/matrix.ts` resolves framework versions, Sentry versions, execution environments, and options into variants.
3. `src/assessment/program-renderer.ts` renders one assessment program per variant.
4. A platform runner executes all applicable probes in order.
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
