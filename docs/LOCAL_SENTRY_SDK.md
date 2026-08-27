# Assessing a local Sentry SDK

Use local SDK checkouts instead of registry releases when validating unreleased instrumentation changes.

## Python

Requirements:

- a local `sentry-python` checkout
- `uv`

```bash
npm test -- run --framework openai --platform python \
  --sentry-python ~/repos/sentry-python
```

The CLI resolves Python variants with `sentryVersion: "local"`, sets `SENTRY_PYTHON_PATH`, and installs the checkout with `uv pip install -e` in each variant environment.

## JavaScript

Build the packages in a local `sentry-javascript` checkout first, then run:

```bash
npm test -- run --framework openai --platform node \
  --sentry-javascript ~/repos/sentry-javascript
```

The CLI resolves JavaScript variants with `sentryVersion: "local"`, sets `SENTRY_JAVASCRIPT_PATH`, and links the platform package from `packages/node`, `packages/nextjs`, or `packages/cloudflare`.

Use the same flags with render mode to inspect generated programs without installing or calling providers:

```bash
npm test -- render --framework openai --platform python \
  --sentry-python ~/repos/sentry-python
```

## Clearing environments

Generated environments are cached under `runs/`. Remove only the affected generated target directory when dependency state needs to be recreated. Do not edit files under `runs/` directly.
