/**
 * Python-specific test runner
 * Handles Python environment setup, dependency installation, and test execution.
 * Requires uv (https://docs.astral.sh/uv/) for dependency management.
 */

import * as path from 'path';
import * as fs from 'fs/promises';
import { exec, execFile } from 'child_process';
import { promisify } from 'util';
import { RunnerContext } from '../types.js';
import { allocatePort } from './port-allocator.js';

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

export class PythonRunner {
  /**
   * Check if Python environment needs initial setup (no venv at all).
   */
  async needsSetup(workDir: string, _context?: RunnerContext): Promise<boolean> {
    const pythonPath = path.join(workDir, '.venv', 'bin', 'python');
    try {
      await fs.access(pythonPath, fs.constants.X_OK);
      await execFileAsync(pythonPath, ['--version']);
      return false;
    } catch {
      // Remove broken venv so it gets recreated cleanly
      try {
        await fs.rm(path.join(workDir, '.venv'), { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
      return true;
    }
  }

  /**
   * Setup Python virtual environment and install dependencies from scratch.
   */
  async setupEnvironment(context: RunnerContext): Promise<void> {
    await this.syncDependencies(context);
  }

  /**
   * Sync dependencies against pyproject.toml via uv sync.
   * Idempotent: creates venv on first run, fast no-op when already up to date.
   */
  async syncDependencies(context: RunnerContext): Promise<void> {
    const verbose = context.verbose === true;

    await this.writePyprojectToml(context);
    await execAsync('uv sync', { cwd: context.workDir });
    await this.installLocalSentrySdk(context);

    if (verbose) {
      console.log('  ✓ Dependencies synced');
    }
  }

  /**
   * Write pyproject.toml to the work directory.
   */
  private async writePyprojectToml(context: RunnerContext): Promise<void> {
    const { framework } = context;
    const dependencies: string[] = [];

    if (framework.dependencies) {
      for (const dep of framework.dependencies) {
        let version = dep.version;
        if (version === 'framework') {
          version = framework.version;
        }

        if (version === 'latest') {
          dependencies.push(`"${dep.package}"`);
        } else if (/^[<>=!~]/.test(version)) {
          dependencies.push(`"${dep.package}${version}"`);
        } else {
          dependencies.push(`"${dep.package}==${version}"`);
        }
      }
    } else {
      dependencies.push(`"${framework.name}==${framework.version}"`);
    }

    // Include sentry-sdk in pyproject.toml so uv sync manages it.
    // Local editable installs (--sentry-python) are handled separately
    // via uv pip install -e after sync.
    if (framework.sentryVersion === 'latest') {
      dependencies.push(`"sentry-sdk"`);
    } else if (framework.sentryVersion !== 'local') {
      dependencies.push(`"sentry-sdk==${framework.sentryVersion}"`);
    }

    const minPythonVersion = framework.minimumPlatformVersion ?? '3.10';

    const pyproject = `[project]
name = "sentry-test-${framework.name}"
version = "0.1.0"
requires-python = ">=${minPythonVersion}"
dependencies = [
${dependencies.map(d => `    ${d},`).join('\n')}
]
`;

    await fs.writeFile(path.join(context.workDir, 'pyproject.toml'), pyproject);
  }

  /**
   * Install local sentry-sdk as editable into the venv.
   * Only needed for --sentry-python (local dev); pinned/latest versions
   * are included in pyproject.toml and handled by uv sync.
   */
  private async installLocalSentrySdk(context: RunnerContext): Promise<void> {
    const { workDir, framework } = context;
    const localSentryPath = process.env.SENTRY_PYTHON_PATH;
    if (!localSentryPath || framework.sentryVersion !== 'local') {
      return;
    }

    const verbose = context.verbose === true;
    if (verbose) {
      console.log(`  Installing local Sentry SDK from: ${localSentryPath}`);
    }
    const uvEnv = { ...process.env, VIRTUAL_ENV: path.join(workDir, '.venv') };
    await execAsync(`uv pip install -e "${localSentryPath}"`, { cwd: workDir, env: uvEnv });
  }

  /**
   * Generate test case ID from test name
   */
  private generateTestCaseId(testName: string): string {
    return testName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  /**
   * Execute Python test
   */
  async executeTest(context: RunnerContext): Promise<void> {
    const { workDir, sentryDsn, runId, isAsync, isStreaming, transportMode, resolvedOptions, testDefinition, framework } = context;
    const verbose = context.verbose === true;

    if (verbose) {
      console.log('  Executing Python test...');
    }

    const pythonPath = path.join(workDir, '.venv', 'bin', 'python');

    // Generate test case ID and determine filename (must match runner.ts logic)
    const testCaseId = this.generateTestCaseId(testDefinition.name);
    const modeParts: string[] = [];
    modeParts.push(isAsync ? 'async' : 'sync');
    if (framework.streamingMode) {
      modeParts.push(isStreaming ? 'streaming' : 'blocking');
    }
    if (transportMode) {
      modeParts.push(transportMode);
    }
    if (resolvedOptions) {
      for (const key of Object.keys(resolvedOptions).sort()) {
        modeParts.push(resolvedOptions[key]);
      }
    }
    const modeSuffix = modeParts.join('-');
    const testFile = path.join(workDir, `test-${testCaseId}-${modeSuffix}.py`);
    const logFile = path.join(workDir, `test-${testCaseId}-${modeSuffix}.log`);

    const env: Record<string, string> = {
      ...process.env as Record<string, string>,
      SENTRY_DSN: sentryDsn,
      RUN_ID: runId,
      OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || '',
      GOOGLE_GENAI_API_KEY: process.env.GOOGLE_GENAI_API_KEY || '',
    };

    // Assign a unique port for MCP SSE transport tests
    if (transportMode === 'sse') {
      env.MCP_SSE_PORT = String(await allocatePort());
    }

    try {
      const { stdout, stderr } = await execAsync(`${pythonPath} ${testFile}`, {
        cwd: workDir,
        env,
        timeout: context.timeoutMs,
      });

      // Write stdout and stderr to log file
      const logContent = [
        '=== Test Execution Log ===',
        `Timestamp: ${new Date().toISOString()}`,
        `Test: ${testDefinition.name}`,
        `Framework: ${context.framework.name}`,
        `Mode: ${modeSuffix}`,
        '',
        '=== STDOUT ===',
        stdout,
        '',
        '=== STDERR ===',
        stderr,
      ].join('\n');

      await fs.writeFile(logFile, logContent);

      if (verbose) {
        console.log(`  Log written to: ${path.basename(logFile)}`);

        if (stdout.trim()) {
          console.log('  Test output:');
          for (const line of stdout.split('\n')) {
            if (line.trim()) console.log(`    ${line}`);
          }
        }

        if (stderr) {
          console.error('  Test errors:');
          stderr.split('\n').forEach(line => {
            if (line.trim()) console.error(`    ${line}`);
          });
        }
      }
    } catch (error: any) {
      // Write error to log file even on failure
      const errorContent = [
        '=== Test Execution Failed ===',
        `Timestamp: ${new Date().toISOString()}`,
        `Test: ${testDefinition.name}`,
        `Framework: ${context.framework.name}`,
        `Mode: ${modeSuffix}`,
        '',
        '=== STDOUT ===',
        error.stdout || '',
        '',
        '=== STDERR ===',
        error.stderr || '',
        '',
        '=== ERROR ===',
        error.message,
      ].join('\n');

      try {
        await fs.writeFile(logFile, errorContent);

        if (verbose) {
          console.log(`  Log written to: ${path.basename(logFile)}`);
        }
      } catch (writeError) {
        if (verbose) {
          console.error('  Failed to write log file:', writeError);
        }
      }

      if (error.killed || error.code === 'ETIMEDOUT') {
        throw new Error(`Test execution timed out (${Math.round(context.timeoutMs / 1000)}s)`);
      }
      throw new Error(`Test execution failed: ${error.message}\n${error.stderr || ''}`);
    }
  }

  /**
   * Get Python version
   */
  async getPythonVersion(workDir: string): Promise<string> {
    const pythonPath = path.join(workDir, '.venv', 'bin', 'python');
    try {
      const { stdout } = await execAsync(`${pythonPath} --version`);
      return stdout.trim();
    } catch {
      return 'Unknown';
    }
  }
}
