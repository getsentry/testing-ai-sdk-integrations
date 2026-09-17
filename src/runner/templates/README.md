# Framework assessment templates

Framework adapters turn the shared probe catalog into a variant plan and isolated probe programs.

## Layout

```text
templates/
├── base.node.assessment.njk
├── base.python.assessment.njk
├── base.nextjs.assessment.njk
├── base.cloudflare.assessment.njk
├── llm/<platform>/<framework>/
│   ├── config.json
│   └── assessment.njk
└── agents/<platform>/<framework>/
    ├── config.json
    └── assessment.njk
```

Supported platforms are `node`, `python`, `nextjs`, and `cloudflare`.

## Adapter contract

An adapter extends its platform assessment base and implements framework-specific operations:

```njk
{% extends "base.node.assessment.njk" %}

{% block dynamic_imports %}
const { Client } = await import("example-sdk");
const client = new Client();
{% endblock %}

{% block probe %}
for (const request of probe.input.calls) {
  await runAssessmentCall(probe, request, async () => {
    const response = await client.complete({
      model: request.model,
      messages: request.messages,
      stream: request.streaming,
    });
    if (request.streaming) {
      for await (const _chunk of response) {}
    }
  });
}
{% endblock %}
```

The base harness owns assessment spans, lifecycle events, error boundaries, and
Sentry flushing. The executor owns isolation, deadlines, retries, and continuation
of independent probes. Adapters must not recreate that control flow.

Wrap every canonical SDK call with `runAssessmentCall(probe, request, callback)`
or Python's `with assessment_call(probe, request)`. Use the actual streaming API
and consume the entire stream, including error events; labeling a blocking call
as streaming is not coverage. Keep conversation calls within the same probe.

Wrap tool callbacks with `runAssessmentTool(definition, args, callback, toolCallId)`
or `assessment_tool(definition, arguments)`. Record inputs before execution and
actual returns/errors, independently of Sentry spans. Python adapters can use
`execute_assessment_tool` for the catalog's synthetic tools. Use
`AssessmentToolError` only for the catalog's intentional tool failure. Do not
swallow unrelated provider, SDK, or harness errors.

Use `captureExpectedError` / `capture_expected_error` only for intentional
provider-error probes. They accept model-related HTTP 400/404/422, not authentication,
rate-limit, transient server, or unclassified errors. Lifecycle helpers must
finish before the probe flushes.

Available blocks:

- `dynamic_imports` and `probe` on every platform
- `sentry_integrations` on Cloudflare

The renderer supplies `targetId`, `variantId`, `probes`, `isAsync`, version-specific template options, and each resolved config option as top-level values.

## Configuration

Minimal `config.json`:

```json
{
  "name": "example",
  "platform": "node",
  "streamingMode": "both",
  "dependencies": [{"package": "example-sdk", "version": "framework"}],
  "versions": ["1.0.0"],
  "sentryVersions": ["latest"]
}
```

Python configs may set `executionMode` to `sync`, `async`, or `both`. Options create framework-specific variant axes and may override model expectations. `executionTimeoutMs` sets the per-probe process deadline (default 180 seconds, or 300 seconds for Cloudflare). `--probe-timeout` overrides it for a run.

Register the real endpoint/credential pool in `assessmentEndpoint` in
`src/assessment/executor.ts` when adding a framework. Adapters using the same
OpenRouter key must share its limit, regardless of model vendor.

Use moving major-version selectors so scheduled assessments pick up the latest minor and patch releases without crossing a stable major. For example, use `"7"` for npm packages and `">=1,<2"` for Python packages. Keep synthetic `manual` adapter versions fixed.

When framework versions need different companion packages or adapter APIs, keep them in one target and use version overrides:

```json
{
  "versions": ["6", "7"],
  "versionOverrides": {
    "6": {"templateOptions": {"apiStyle": "v6"}},
    "7": {
      "dependencies": {"example-provider": "4.0.0"},
      "templateOptions": {"apiStyle": "v7"}
    }
  }
}
```

Dependency overrides replace versions for packages already listed in `dependencies`. Template options are exposed to `assessment.njk` but do not create an additional variant axis.

Model expectations may contain `*` wildcards when providers append versions or other suffixes to served model names.

## Validation

```bash
npm run build
npm run test:unit
npm test -- list --framework <name>
npm test -- render --framework <name>
```

Inspect the generated `assessment.js` or `assessment.py` under `runs/`. Do not edit generated files.
