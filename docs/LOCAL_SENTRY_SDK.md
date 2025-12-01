# Using Local Sentry SDK for Development

This guide explains how to use a local copy of the Sentry Python SDK when running tests, instead of installing from PyPI. This is useful when you're developing changes to the Sentry SDK and want to test them against AI SDK integrations.

## Quick Start

If you have the Sentry Python SDK cloned adjacent to this repository:

```bash
# Setup all Python SDKs with local Sentry SDK
cd shared/orchestration
npm run cli setup -- --local-sentry-sdk ../../../sentry-python

# Run tests with local Sentry SDK
npm run cli run -- --all --local-sentry-sdk ../../../sentry-python
```

## How It Works

When you use the `--local-sentry-sdk` flag:

1. The orchestrator validates the provided path
2. For each Python SDK, it:
   - Installs the local Sentry SDK as editable: `pip install -e /path/to/sentry-python`
   - Installs other dependencies from `requirements.txt`
3. Tests run with your local Sentry SDK code
4. Changes to the Sentry SDK source are immediately reflected (no reinstall needed)

**Important:** Your `requirements.txt` files remain unmodified, keeping git status clean.

## Setup Command

Install all dependencies with a local Sentry SDK:

```bash
npm run cli setup -- --local-sentry-sdk <path>
```

**Path requirements:**
- Can be relative (e.g., `../sentry-python`) or absolute
- Must point to the Sentry Python SDK repository root
- Must contain:
  - `setup.py` (valid Python package)
  - `sentry_sdk/` directory (the actual package)

**Example:**
```bash
# Relative path (adjacent to repo)
npm run cli setup -- --local-sentry-sdk ../sentry-python

# Absolute path
npm run cli setup -- --local-sentry-sdk /Users/username/dev/sentry-python
```

## Run Command

Run tests with a local Sentry SDK:

```bash
npm run cli run [filter] -- --local-sentry-sdk <path>
```

**Examples:**
```bash
# Run all tests with local SDK
npm run cli run -- --all --local-sentry-sdk ../sentry-python

# Run specific SDK with local Sentry
npm run cli run py/openai -- --local-sentry-sdk ../sentry-python

# Run specific test case with local Sentry
npm run cli run -- --case 1-simple --local-sentry-sdk ../sentry-python
```

## Verifying Editable Install

Check if the editable install is active:

```bash
# From any Python SDK directory
cd sdks/py/openai
.venv/bin/pip list | grep sentry-sdk
```

**Expected output (editable):**
```
sentry-sdk           2.43.0    /path/to/sentry-python
```

**Expected output (PyPI):**
```
sentry-sdk           2.43.0
```

## Reverting to PyPI Version

To switch back to the PyPI version of Sentry SDK:

```bash
# Option 1: Uninstall editable, then setup normally
cd sdks/py/openai
.venv/bin/pip uninstall sentry-sdk
cd ../../../shared/orchestration
npm run cli setup

# Option 2: Delete venv and recreate
cd sdks/py/openai
rm -rf .venv
cd ../../../shared/orchestration
npm run cli setup
```

## Upgrading Packages with Editable Installs

The upgrade command protects you from accidentally overwriting editable installs:

```bash
npm run cli upgrade sentry-sdk 2.50.0
```

**Output when editable install is active:**
```
  py/openai - Skipping (editable install active)
    To upgrade, first remove editable install:
    cd sdks/py/openai && .venv/bin/pip uninstall sentry-sdk
    Then run: npm run cli setup
```

The upgrade command will:
- Skip all SDKs with editable Sentry SDK installs
- Show clear instructions on how to remove the editable install
- Continue upgrading other packages normally

## Troubleshooting

### Error: Local Sentry SDK path does not exist

**Problem:** The path you provided doesn't exist.

**Solution:** Check the path and try again:
```bash
ls ../sentry-python  # Should show the repository contents
```

### Error: Local Sentry SDK path is not a directory

**Problem:** The path points to a file, not a directory.

**Solution:** Provide the repository root directory:
```bash
# Wrong
--local-sentry-sdk ../sentry-python/setup.py

# Correct
--local-sentry-sdk ../sentry-python
```

### Error: Local Sentry SDK path missing setup.py

**Problem:** The directory isn't a valid Python package.

**Solution:** Ensure you're pointing to the Sentry SDK repository root:
```bash
ls ../sentry-python/setup.py  # Should exist
```

### Error: Local Sentry SDK path missing sentry_sdk/ directory

**Problem:** The package doesn't contain the sentry_sdk module.

**Solution:** Make sure you're using the correct repository:
```bash
ls ../sentry-python/sentry_sdk/  # Should show the package
```

### Tests fail after switching to local SDK

**Problem:** Your local Sentry SDK has breaking changes or bugs.

**Solution:**
1. Check your local Sentry SDK changes
2. Revert to PyPI version to confirm tests pass:
   ```bash
   cd sdks/py/openai
   .venv/bin/pip uninstall sentry-sdk
   .venv/bin/pip install sentry-sdk==2.43.0
   ```

## Common Workflows

### Developing a Sentry SDK Feature

```bash
# 1. Setup with local SDK
npm run cli setup -- --local-sentry-sdk ../sentry-python

# 2. Make changes to sentry-python code
# (edit files in ../sentry-python/)

# 3. Run tests (changes are automatically picked up)
npm run cli run -- --all

# 4. When done, revert to PyPI version
for sdk in sdks/py/*/; do
  cd "$sdk"
  .venv/bin/pip uninstall sentry-sdk -y
  .venv/bin/pip install sentry-sdk==2.43.0
  cd -
done
```

### Testing a Specific Sentry SDK Branch

```bash
# 1. Clone and checkout branch
cd ..
git clone https://github.com/getsentry/sentry-python.git
cd sentry-python
git checkout feature/my-new-integration

# 2. Setup tests with this branch
cd ../testing-ai-sdk-integrations/shared/orchestration
npm run cli setup -- --local-sentry-sdk ../sentry-python

# 3. Run tests
npm run cli run -- --all
```

### Multiple Developers with Different SDK Locations

Each developer can use their own path without affecting others:

```bash
# Developer A (macOS)
npm run cli setup -- --local-sentry-sdk /Users/alice/dev/sentry-python

# Developer B (Linux)
npm run cli setup -- --local-sentry-sdk /home/bob/projects/sentry-python

# Developer C (Windows)
npm run cli setup -- --local-sentry-sdk C:/dev/sentry-python
```

The `requirements.txt` files are never modified, so there are no git conflicts.

## Technical Details

### Why Editable Installs?

Editable installs (`pip install -e`) create a link to your local code instead of copying files to `site-packages`. This means:
- ✅ Changes to Sentry SDK source are immediately reflected
- ✅ No need to reinstall after each change
- ✅ Easy to develop and test simultaneously

### Where Are Editable Installs Stored?

Editable install metadata is stored in:
- `.venv/lib/python3.x/site-packages/sentry-sdk.egg-link` (points to your local path)
- `.venv/lib/python3.x/site-packages/__editable__.sentry_sdk-*.pth`

### Impact on CI/Production

**Zero impact** - editable installs only affect your local development environment:
- `requirements.txt` files remain unchanged
- CI always installs from PyPI (exact versions)
- Other developers unaffected unless they use the flag

## Best Practices

1. **Always specify the path** - Don't rely on default locations
2. **Use relative paths when possible** - Makes commands portable across environments
3. **Revert when done** - Switch back to PyPI versions to avoid confusion
4. **Document your setup** - Let team members know if you're using local SDK
5. **Test with PyPI version** - Before submitting PRs, verify tests pass with released SDK

## See Also

- [Python SDK Development Guide](https://develop.sentry.dev/sdk/python/)
- [Main Setup Documentation](../shared/orchestration/README.md)
- [Troubleshooting Guide](./TROUBLESHOOTING.md)
