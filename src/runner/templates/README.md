# Framework assessment templates

Framework adapters turn the shared probe catalog into one executable program per resolved variant.

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
  await client.complete({
    model: request.model,
    messages: request.messages,
    stream: request.streaming,
  });
}
{% endblock %}
```

The base harness owns probe ordering, root assessment spans, lifecycle events, error boundaries, blocking behavior, and Sentry flushing. Adapters must not recreate that control flow.

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

Python configs may set `executionMode` to `sync`, `async`, or `both`. Options create framework-specific variant axes and may override model expectations.

When framework versions need different companion packages or adapter APIs, keep them in one target and use version overrides:

```json
{
  "versions": ["6.0.0", "7.0.0"],
  "versionOverrides": {
    "6.0.0": {"templateOptions": {"apiStyle": "v6"}},
    "7.0.0": {
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
