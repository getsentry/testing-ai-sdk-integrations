# Using Local Sentry SDK for Development

This guide explains how to use a local copy of the Sentry SDK (Python or JavaScript) when running tests, instead of installing from package repositories. This is useful when you're developing changes to the Sentry SDK and want to test them against AI SDK integrations.

## Quick Start

### Python SDK

If you have the Sentry Python SDK cloned adjacent to this repository:

```bash
# Setup all Python SDKs with local Sentry SDK
cd shared/orchestration
npm run cli setup -- --local-sentry-python ../../../sentry-python

# Run tests with local Sentry SDK
npm run cli run -- --all --local-sentry-python ../../../sentry-python
```

### JavaScript SDK

If you have the Sentry JavaScript SDK cloned adjacent to this repository:

```bash
# Setup all JavaScript SDKs with local Sentry SDK
cd shared/orchestration
npm run cli setup -- --local-sentry-javascript ../../../sentry-javascript

# Run tests with local Sentry SDK
npm run cli run -- --all --local-sentry-javascript ../../../sentry-javascript
```

### Both SDKs

You can use both flags simultaneously to test with local versions of both SDKs:

```bash
# Setup with both local SDKs
npm run cli setup -- --local-sentry-python ../../../sentry-python --local-sentry-javascript ../../../sentry-javascript

# Run tests with both local SDKs
npm run cli run -- --all --local-sentry-python ../../../sentry-python --local-sentry-javascript ../../../sentry-javascript
```

## How It Works

When you use the `--local-sentry-sdk` flag:

### Python SDKs

1. The orchestrator validates the provided path
2. For each Python SDK, it:
   - Installs the local Sentry SDK as editable: `pip install -e /path/to/sentry-python`
   - Installs other dependencies from `requirements.txt` (excluding sentry-sdk)
3. Tests run with your local Sentry SDK code
4. Changes to the Sentry SDK source are immediately reflected (no reinstall needed)

**Important:** Your `requirements.txt` files remain unmodified, keeping git status clean.

### JavaScript SDKs

1. The orchestrator validates the provided path (must be sentry-javascript monorepo)
2. For each JavaScript SDK, it:
   - Reads `package.json` to find which `@sentry/*` packages are used
   - Links each package: `npm link /path/to/sentry-javascript/packages/node`
   - Installs other dependencies normally
3. Tests run with your local Sentry SDK code
4. Changes to the Sentry SDK source are immediately reflected (no rebuild needed)

**Important:** Your `package.json` files remain unmodified, keeping git status clean.

## Setup Command

Install all dependencies with local Sentry SDKs:

```bash
# For Python SDK
npm run cli setup -- --local-sentry-python <path>

# For JavaScript SDK
npm run cli setup -- --local-sentry-javascript <path>

# For both
npm run cli setup -- --local-sentry-python <path> --local-sentry-javascript <path>
```

### Path Requirements

**For Python SDK (`sentry-python`):**
- Can be relative (e.g., `../sentry-python`) or absolute
- Must point to the Sentry Python SDK repository root
- Must contain:
  - `setup.py` (valid Python package)
  - `sentry_sdk/` directory (the actual package)

**For JavaScript SDK (`sentry-javascript`):**
- Can be relative (e.g., `../sentry-javascript`) or absolute
- Must point to the Sentry JavaScript SDK monorepo root
- Must contain:
  - `packages/` directory (monorepo structure)
  - Root `package.json` (workspace configuration)

### Examples

```bash
# Python SDK - Relative path (adjacent to repo)
npm run cli setup -- --local-sentry-python ../sentry-python

# Python SDK - Absolute path
npm run cli setup -- --local-sentry-python /Users/username/dev/sentry-python

# JavaScript SDK - Relative path (adjacent to repo)
npm run cli setup -- --local-sentry-javascript ../sentry-javascript

# JavaScript SDK - Absolute path
npm run cli setup -- --local-sentry-javascript /Users/username/dev/sentry-javascript
```

## Run Command

Run tests with local Sentry SDKs:

```bash
# For Python SDK
npm run cli run [filter] -- --local-sentry-python <path>

# For JavaScript SDK
npm run cli run [filter] -- --local-sentry-javascript <path>

# For both
npm run cli run [filter] -- --local-sentry-python <path> --local-sentry-javascript <path>
```

**Examples:**
```bash
# Run all tests with local Python SDK
npm run cli run -- --all --local-sentry-python ../sentry-python

# Run all tests with local JavaScript SDK
npm run cli run -- --all --local-sentry-javascript ../sentry-javascript

# Run all tests with both local SDKs
npm run cli run -- --all --local-sentry-python ../sentry-python --local-sentry-javascript ../sentry-javascript

# Run specific Python SDK with local Sentry
npm run cli run py/openai -- --local-sentry-python ../sentry-python

# Run specific JavaScript SDK with local Sentry
npm run cli run js/openai -- --local-sentry-javascript ../sentry-javascript

# Run specific test case with local Python SDK
npm run cli run -- --case 1-simple --local-sentry-python ../sentry-python
```

## Verifying Local Installs

### Python SDK (Editable Install)

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

### JavaScript SDK (npm link)

Check if npm link is active:

```bash
# From any JavaScript SDK directory
cd sdks/js/openai
ls -la node_modules/@sentry/node
```

**Expected output (linked):**
```
lrwxr-xr-x  ... node_modules/@sentry/node -> /path/to/sentry-javascript/packages/node
```

**Expected output (npm registry):**
```
drwxr-xr-x  ... node_modules/@sentry/node
```

Or use npm to check:

```bash
npm ls @sentry/node
# Linked shows: @sentry/node@X.Y.Z -> /path/to/sentry-javascript/packages/node
```

## Reverting to Package Registry Versions

### Python SDK

To switch back to the PyPI version:

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

### JavaScript SDK

To switch back to the npm registry version:

```bash
# Option 1: Unlink specific package, then setup normally
cd sdks/js/openai
npm unlink @sentry/node
cd ../../../shared/orchestration
npm run cli setup

# Option 2: Delete node_modules and recreate
cd sdks/js/openai
rm -rf node_modules package-lock.json
cd ../../../shared/orchestration
npm run cli setup
```

## Upgrading Packages with Local Installs

The upgrade command protects you from accidentally overwriting local installs.

### Python SDK Example

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

### JavaScript SDK Example

```bash
npm run cli upgrade @sentry/node 8.50.0
```

**Output when npm link is active:**
```
  js/openai - Skipping (npm linked)
    To upgrade, first unlink:
    cd sdks/js/openai && npm unlink @sentry/node
    Then run: npm run cli setup
```

### Behavior

The upgrade command will:
- Skip all SDKs with local Sentry SDK installs (editable or linked)
- Show clear instructions on how to remove the local install
- Continue upgrading other packages normally

## Troubleshooting

### Python SDK Errors

#### Error: Local Sentry SDK path does not exist

**Problem:** The path you provided doesn't exist.

**Solution:** Check the path and try again:
```bash
ls ../sentry-python  # Should show the repository contents
```

#### Error: Local Sentry SDK path is not a directory

**Problem:** The path points to a file, not a directory.

**Solution:** Provide the repository root directory:
```bash
# Wrong
--local-sentry-sdk ../sentry-python/setup.py

# Correct
--local-sentry-sdk ../sentry-python
```

#### Error: Local Sentry SDK path missing setup.py

**Problem:** The directory isn't a valid Python package.

**Solution:** Ensure you're pointing to the Sentry SDK repository root:
```bash
ls ../sentry-python/setup.py  # Should exist
```

#### Error: Local Sentry SDK path missing sentry_sdk/ directory

**Problem:** The package doesn't contain the sentry_sdk module.

**Solution:** Make sure you're using the correct repository:
```bash
ls ../sentry-python/sentry_sdk/  # Should show the package
```

### JavaScript SDK Errors

#### Error: Local Sentry JavaScript SDK path missing packages/ directory

**Problem:** The path doesn't point to the sentry-javascript monorepo.

**Solution:** Ensure you're pointing to the monorepo root:
```bash
ls ../sentry-javascript/packages/  # Should show all @sentry/* packages
```

#### Error: Local Sentry JavaScript SDK path missing root package.json

**Problem:** The directory isn't a valid npm workspace/monorepo.

**Solution:** Verify the monorepo structure:
```bash
ls ../sentry-javascript/package.json  # Should exist
cat ../sentry-javascript/package.json | grep workspaces  # Should have workspaces
```

#### Warning: Package not found in local SDK, using npm

**Problem:** The JavaScript SDK doesn't have a specific package you're trying to link.

**Solution:** This is informational - the orchestrator will fall back to npm for that package. This can happen with:
- New or experimental packages not yet in your local SDK
- Renamed packages
- Packages from other scopes

```bash
# Verify which packages exist in your local SDK
ls ../sentry-javascript/packages/
```

### General Issues

#### Tests fail after switching to local SDK

**Problem:** Your local Sentry SDK has breaking changes or bugs.

**Solution for Python:**
1. Check your local Sentry SDK changes
2. Revert to PyPI version to confirm tests pass:
   ```bash
   cd sdks/py/openai
   .venv/bin/pip uninstall sentry-sdk
   .venv/bin/pip install sentry-sdk==2.43.0
   ```

**Solution for JavaScript:**
1. Check your local Sentry SDK changes
2. Revert to npm registry version to confirm tests pass:
   ```bash
   cd sdks/js/openai
   npm unlink @sentry/node
   npm install @sentry/node@8.0.0
   ```

## Common Workflows

### Developing a Sentry SDK Feature

**Python:**

```bash
# 1. Setup with local SDK
npm run cli setup -- --local-sentry-python ../sentry-python

# 2. Make changes to sentry-python code
# (edit files in ../sentry-python/)

# 3. Run tests (changes are automatically picked up)
npm run cli run -- --all --local-sentry-python ../sentry-python

# 4. When done, revert to PyPI version
for sdk in sdks/py/*/; do
  cd "$sdk"
  .venv/bin/pip uninstall sentry-sdk -y
  .venv/bin/pip install sentry-sdk==2.43.0
  cd -
done
```

**JavaScript:**

```bash
# 1. Setup with local SDK
npm run cli setup -- --local-sentry-javascript ../sentry-javascript

# 2. Make changes to sentry-javascript code
# (edit files in ../sentry-javascript/packages/*)

# 3. Run tests (changes are automatically picked up)
npm run cli run -- --all --local-sentry-javascript ../sentry-javascript

# 4. When done, revert to npm registry version
for sdk in sdks/js/*/; do
  cd "$sdk"
  for pkg in node_modules/@sentry/*; do
    if [ -L "$pkg" ]; then
      npm unlink "$(basename $(dirname $pkg))/$(basename $pkg)"
    fi
  done
  npm install
  cd -
done
```

### Testing a Specific Sentry SDK Branch

**Python:**

```bash
# 1. Clone and checkout branch
cd ..
git clone https://github.com/getsentry/sentry-python.git
cd sentry-python
git checkout feature/my-new-integration

# 2. Setup tests with this branch
cd ../testing-ai-sdk-integrations/shared/orchestration
npm run cli setup -- --local-sentry-python ../sentry-python

# 3. Run tests
npm run cli run -- --all --local-sentry-python ../sentry-python
```

**JavaScript:**

```bash
# 1. Clone and checkout branch
cd ..
git clone https://github.com/getsentry/sentry-javascript.git
cd sentry-javascript
git checkout feature/my-new-integration

# 2. Build the SDK (important for JavaScript!)
npm install && npm run build

# 3. Setup tests with this branch
cd ../testing-ai-sdk-integrations/shared/orchestration
npm run cli setup -- --local-sentry-javascript ../sentry-javascript

# 4. Run tests
npm run cli run -- --all --local-sentry-javascript ../sentry-javascript
```

### Multiple Developers with Different SDK Locations

Each developer can use their own path without affecting others:

```bash
# Developer A (macOS) - Python SDK
npm run cli setup -- --local-sentry-python /Users/alice/dev/sentry-python

# Developer B (Linux) - Python SDK
npm run cli setup -- --local-sentry-python /home/bob/projects/sentry-python

# Developer C (Windows) - JavaScript SDK
npm run cli setup -- --local-sentry-javascript C:/dev/sentry-javascript

# Developer D - Both SDKs
npm run cli setup -- --local-sentry-python ../sentry-python --local-sentry-javascript ../sentry-javascript
```

The `requirements.txt` and `package.json` files are never modified, so there are no git conflicts.

## Technical Details

### Python: Why Editable Installs?

Editable installs (`pip install -e`) create a link to your local code instead of copying files to `site-packages`. This means:
- ✅ Changes to Sentry SDK source are immediately reflected
- ✅ No need to reinstall after each change
- ✅ Easy to develop and test simultaneously

**Where Are Editable Installs Stored?**

Editable install metadata is stored in:
- `.venv/lib/python3.x/site-packages/sentry-sdk.egg-link` (points to your local path)
- `.venv/lib/python3.x/site-packages/__editable__.sentry_sdk-*.pth`

### JavaScript: Why npm link?

npm link creates symbolic links in `node_modules` to your local code. This means:
- ✅ Changes to Sentry SDK source are immediately reflected (if already built)
- ✅ Works with TypeScript source maps for debugging
- ✅ Preserves monorepo structure

**Where Are Links Stored?**

npm link creates symlinks in:
- `node_modules/@sentry/node` → `/path/to/sentry-javascript/packages/node`
- `node_modules/@sentry/core` → `/path/to/sentry-javascript/packages/core`
- etc.

**Important Note:** For TypeScript changes in sentry-javascript, you may need to rebuild:
```bash
cd ../sentry-javascript && npm run build
```

### Impact on CI/Production

**Zero impact** - local installs only affect your local development environment:
- `requirements.txt` and `package.json` files remain unchanged
- CI always installs from PyPI/npm (exact versions)
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
