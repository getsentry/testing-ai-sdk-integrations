# Using Local Sentry SDK for Development

This guide explains how to use local, editable installations of Sentry SDKs instead of installing from package registries.

## Prerequisites

### Python

- **uv** package manager installed (`pip install uv` or `brew install uv`)
- Local clone of `sentry-python` repository

### JavaScript

- Local clone of `sentry-javascript` repository
- Built packages (run `yarn build` in the repo)

### PHP (Laravel)

- **Composer** installed
- Local clone of `sentry-laravel` repository (for `--sentry-laravel`)
- Optionally, local clone of `sentry-php` repository (for `--sentry-php`, core SDK)

## Usage

### Python SDK

Run tests with the `--sentry-python` flag:

```bash
npm start run -- --framework openai --sentry-python ~/sentry-python
```

### JavaScript SDK

Run tests with the `--sentry-javascript` flag:

```bash
npm start run -- --framework some-js-framework --sentry-javascript ~/sentry-javascript
```

### PHP SDK (sentry-laravel)

Run tests with the `--sentry-laravel` flag:

```bash
npm start run -- --framework laravel --sentry-laravel ~/sentry-laravel
```

> **Note:** `--sentry-laravel` points to the `sentry/sentry-laravel` package (the Laravel integration).
> `--sentry-php` is a separate flag for the core `sentry/sentry-php` SDK (reserved for future use).

## How It Works

When using local SDK paths:

1. The CLI sets environment variables (`SENTRY_PYTHON_PATH`, `SENTRY_JAVASCRIPT_PATH`, or `SENTRY_LARAVEL_PATH`)
2. The framework's `sentryVersion` is set to `"local"`
3. Work directories use `sentry-local` instead of version number:
   - Example: `runs/python/openai-1.57.0-sentry-local/`
4. Python: `uv pip install -e <path>` for editable install
5. JavaScript: `npm link <path>/packages/node` to link local SDK
6. PHP (Laravel): Composer path repository with symlink to local `sentry-laravel`

## Benefits

- ✅ **Live changes**: Edits to local SDK are immediately reflected
- ✅ **Faster development**: No need to rebuild/reinstall after each SDK change
- ✅ **Easy debugging**: Add print statements or breakpoints in Sentry code
- ✅ **Test unreleased features**: Test local changes before they're published
- ✅ **Clear directory names**: `sentry-local` indicates local SDK usage

## Example Output

```bash
$ npm start run -- --framework openai --sentry-python ~/sentry-python

Using local Sentry Python SDK: /Users/you/sentry-python

Testing 1 framework(s) with 1 test(s)

[openai] Running: Basic LLM Test
   Setting up Python environment in runs/python/openai-1.57.0-sentry-local...
  Using uv for dependency management
  ✓ pyproject.toml generated
  ✓ Virtual environment created
  Installing dependencies...
  Installing local Sentry SDK from: /Users/you/sentry-python
  ✓ Dependencies installed
```

## Clearing Cache

To force reinstallation (e.g., after switching branches in sentry-python):

```bash
rm -rf runs/
npm start run -- --framework openai --sentry-python ~/sentry-python
```

## Fallback

If `uv` is not available for Python, the runner automatically falls back to using `pip`:

```bash
pip install -e "${SENTRY_PYTHON_PATH}"
```
