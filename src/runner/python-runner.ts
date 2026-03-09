/**
 * Python-specific test runner
 * Handles Python environment setup, dependency installation, and test execution
 */

import * as path from 'path';
import * as fs from 'fs/promises';
import { exec } from 'child_process';
import { promisify } from 'util';
import { RunnerContext } from '../types.js';

const execAsync = promisify(exec);

export class PythonRunner {
  /**
   * Check if Python environment needs setup
   */
  async needsSetup(workDir: string): Promise<boolean> {
    const venvPath = path.join(workDir, '.venv');
    try {
      await fs.access(venvPath);
      return false;
    } catch {
      return true;
    }
  }

  /**
   * Setup Python virtual environment and install dependencies
   */
  async setupEnvironment(context: RunnerContext): Promise<void> {
    const { workDir, framework } = context;
    const verbose = context.verbose === true;
    
    if (verbose) {
      console.log(`  Setting up Python environment in ${workDir}...`);
    }

    // Check if uv is available
    const useUv = await this.isUvAvailable();
    
    if (useUv) {
      if (verbose) {
        console.log('  Using uv for dependency management');
      }
      
      // Create pyproject.toml
      const pyproject = this.generatePyprojectToml(context);
      await fs.writeFile(path.join(workDir, 'pyproject.toml'), pyproject);
      if (verbose) {
        console.log('  ✓ pyproject.toml generated');
      }
      
      // Create virtual environment with uv
      await execAsync('uv venv .venv', { cwd: workDir });
      if (verbose) {
        console.log('  ✓ Virtual environment created');
      }
      
      // Install dependencies with uv
      if (verbose) {
        console.log('  Installing dependencies...');
      }
      
      // Check for local Sentry SDK path
      const localSentryPath = process.env.SENTRY_PYTHON_PATH;
      if (localSentryPath && framework.sentryVersion === 'local') {
        if (verbose) {
          console.log(`  Installing local Sentry SDK from: ${localSentryPath}`);
        }
        await execAsync(`uv pip install -e "${localSentryPath}"`, { 
          cwd: workDir,
          env: { ...process.env, VIRTUAL_ENV: path.join(workDir, '.venv') }
        });
      } else if (framework.sentryVersion === 'latest') {
        // Install latest Sentry SDK from PyPI (no version pin)
        await execAsync(`uv pip install sentry-sdk`, { 
          cwd: workDir,
          env: { ...process.env, VIRTUAL_ENV: path.join(workDir, '.venv') }
        });
      } else {
        // Install Sentry SDK from PyPI
        await execAsync(`uv pip install sentry-sdk==${framework.sentryVersion}`, { 
          cwd: workDir,
          env: { ...process.env, VIRTUAL_ENV: path.join(workDir, '.venv') }
        });
      }
      
      // Install project dependencies from pyproject.toml
      await execAsync('uv pip install .', { 
        cwd: workDir,
        env: { ...process.env, VIRTUAL_ENV: path.join(workDir, '.venv') }
      });
      
      if (verbose) {
        console.log('  ✓ Dependencies installed');
      }
    } else {
      // Fallback to traditional pip-based approach
      if (verbose) {
        console.log('  Using pip for dependency management');
      }
      
      // Create virtual environment
      await execAsync('python3 -m venv .venv', { cwd: workDir });
      if (verbose) {
        console.log('  ✓ Virtual environment created');
      }

      const pipPath = path.join(workDir, '.venv', 'bin', 'pip');
      await execAsync(`${pipPath} install --upgrade pip`, { cwd: workDir });

      // Check for local Sentry SDK path
      const localSentryPath = process.env.SENTRY_PYTHON_PATH;
      if (localSentryPath && framework.sentryVersion === 'local') {
        if (verbose) {
          console.log(`  Installing local Sentry SDK from: ${localSentryPath}`);
        }
        await execAsync(`${pipPath} install -e "${localSentryPath}"`, { cwd: workDir });
      } else if (framework.sentryVersion === 'latest') {
        await execAsync(`${pipPath} install sentry-sdk`, { cwd: workDir });
      } else {
        await execAsync(`${pipPath} install sentry-sdk==${framework.sentryVersion}`, { cwd: workDir });
      }

      // Create requirements.txt for other dependencies
      const requirements = this.generateRequirements(context);
      await fs.writeFile(path.join(workDir, 'requirements.txt'), requirements);
      if (verbose) {
        console.log('  ✓ requirements.txt generated');
      }

      // Install other dependencies
      if (verbose) {
        console.log('  Installing dependencies...');
      }
      await execAsync(`${pipPath} install -r requirements.txt`, { 
        cwd: workDir,
        env: { ...process.env, PIP_NO_CACHE_DIR: '1' }
      });
      if (verbose) {
        console.log('  ✓ Dependencies installed');
      }
    }
  }

  /**
   * Check if uv is available
   */
  private async isUvAvailable(): Promise<boolean> {
    try {
      await execAsync('uv --version');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Generate pyproject.toml content
   */
  private generatePyprojectToml(context: RunnerContext): string {
    const { framework } = context;
    
    const dependencies: string[] = [];
    
    // Add framework dependencies from config
    if (framework.dependencies) {
      for (const dep of framework.dependencies) {
        let version = dep.version;
        
        // Replace "framework" with actual framework version
        if (version === 'framework') {
          version = framework.version;
        }
        
        // Add version specifier
        if (version === 'latest') {
          dependencies.push(`"${dep.package}"`);
        } else {
          dependencies.push(`"${dep.package}==${version}"`);
        }
      }
    } else {
      // Fallback: Add framework package with framework version
      dependencies.push(`"${framework.name}==${framework.version}"`);
    }

    const minPythonVersion = framework.minimumPlatformVersion ?? '3.9';

    return `[project]
name = "sentry-test-${framework.name}"
version = "0.1.0"
requires-python = ">=${minPythonVersion}"
dependencies = [
${dependencies.map(d => `    ${d},`).join('\n')}
]
`;
  }

  /**
   * Generate requirements.txt content (for pip fallback, without sentry-sdk)
   */
  private generateRequirements(context: RunnerContext): string {
    const { framework } = context;
    const requirements: string[] = [];

    // Add framework dependencies from config (but NOT sentry-sdk, handled separately)
    if (framework.dependencies && framework.dependencies.length > 0) {
      for (const dep of framework.dependencies) {
        let version = dep.version;
        
        // Replace "framework" with actual framework version
        if (version === 'framework') {
          version = framework.version;
        }
        
        // Add version specifier if not "latest"
        if (version === 'latest') {
          requirements.push(dep.package);
        } else {
          requirements.push(`${dep.package}==${version}`);
        }
      }
    } else {
      // Fallback: Add framework package with framework version
      requirements.push(`${framework.name}==${framework.version}`);
    }

    return requirements.join('\n');
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
    const { workDir, sentryDsn, runId, isAsync, isStreaming, resolvedOptions, testDefinition, framework } = context;
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
    // Add resolved options (sorted by key for consistent ordering)
    if (resolvedOptions) {
      for (const key of Object.keys(resolvedOptions).sort()) {
        modeParts.push(resolvedOptions[key]);
      }
    }
    const modeSuffix = modeParts.join('-');
    const testFile = path.join(workDir, `test-${testCaseId}-${modeSuffix}.py`);
    const logFile = path.join(workDir, `test-${testCaseId}-${modeSuffix}.log`);

    const env = {
      ...process.env,
      SENTRY_DSN: sentryDsn,
      RUN_ID: runId,
      OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || '',
      GOOGLE_GENAI_API_KEY: process.env.GOOGLE_GENAI_API_KEY || '',
    };

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
