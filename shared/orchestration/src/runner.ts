/**
 * Test runner - executes test cases with lifecycle hooks
 */

import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import type { SDK, TestCase, TestResult, LifecycleHooks, SDKConfig, LocalSentryOptions } from './types.js';
import { loadSetupHooks } from './discovery.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Run a single test case
 */
async function runTestCase(testCase: TestCase, hooks: LifecycleHooks, sdk: SDK, options?: LocalSentryOptions): Promise<TestResult> {
  const startTime = Date.now();

  try {
    // Determine if this is a JS/TS or Python test
    const isPython = testCase.filePath.endsWith('.py');

    if (isPython) {
      // Run Python test using subprocess
      await runPythonTest(testCase.filePath, testCase.id, sdk.config, sdk.path, options);
    } else {
      // Run JS/TS test using subprocess for isolation
      await runJavaScriptTest(testCase.filePath, testCase.id, sdk.config, sdk.path);
    }

    return {
      sdkPath: testCase.sdkPath,
      caseId: testCase.id,
      status: 'passed',
      duration: Date.now() - startTime
    };
  } catch (error) {
    return {
      sdkPath: testCase.sdkPath,
      caseId: testCase.id,
      status: 'failed',
      error: error as Error,
      duration: Date.now() - startTime
    };
  }
}

/**
 * Run a JavaScript test file
 */
function runJavaScriptTest(filePath: string, caseId: string, config?: SDKConfig, sdkPath?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // Get the SDK directory (2 levels up from test file)
    const sdkDir = dirname(dirname(filePath));

    // Use the JavaScript test runner wrapper to handle lifecycle hooks
    const runnerScript = join(dirname(__dirname), 'js-test-runner.cjs');

    // Prepare environment with SDK config and overrides
    const env = { ...process.env } as NodeJS.ProcessEnv;

    // Pass the SDK path for display in output
    if (sdkPath) {
      env.SDK_PATH = sdkPath;
    }

    // Pass the entire SDK config (including framework_type)
    if (config) {
      env.SDK_CONFIG = JSON.stringify(config);
    }

    // Pass test case specific overrides
    if (config?.overrides && config.overrides[caseId]) {
      env.SDK_CONFIG_OVERRIDES = JSON.stringify(config.overrides[caseId]);
    }

    // Check if verbose mode is enabled
    const isVerbose = process.env.SENTRY_AI_TEST_VERBOSE === 'true';

    const node = spawn('node', [runnerScript, sdkDir, filePath], {
      stdio: ['inherit', 'inherit', isVerbose ? 'inherit' : 'pipe'],  // Show stderr directly in verbose mode
      cwd: sdkDir,
      env  // Pass parent env with SDK config
    });

    let stderrData = '';

    // Only capture stderr if not in verbose mode
    if (!isVerbose) {
      node.stderr?.on('data', (data) => {
        stderrData += data.toString();
      });
    }

    node.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        // In verbose mode, stderr was already shown - just report the exit code
        if (isVerbose) {
          reject(new Error(`JavaScript test exited with code ${code}`));
          return;
        }

        // Extract the error message from stderr (line starting with "✗ Test failed:")
        // and collect everything after it until the stack trace (Error:) starts
        const lines = stderrData.split('\n');
        let errorMsg = '';
        let capturing = false;

        for (const line of lines) {
          if (line.startsWith('✗ Test failed:')) {
            errorMsg = line.replace('✗ Test failed: ', '');
            capturing = true;
          } else if (capturing && line.startsWith('Error:')) {
            // Stop at stack trace
            break;
          } else if (capturing && line.trim()) {
            errorMsg += '\n' + line;
          }
        }

        if (!errorMsg) {
          errorMsg = `JavaScript test exited with code ${code}`;
        }

        reject(new Error(errorMsg));
      }
    });

    node.on('error', (err) => {
      reject(err);
    });
  });
}

/**
 * Run a Python test file
 */
function runPythonTest(filePath: string, caseId: string, config?: SDKConfig, sdkPath?: string, options?: LocalSentryOptions): Promise<void> {
  return new Promise((resolve, reject) => {
    // Get the SDK directory (2 levels up from test file)
    const sdkDir = dirname(dirname(filePath));

    // Check for venv
    const venvPython = `${sdkDir}/.venv/bin/python`;
    const pythonCmd = existsSync(venvPython) ? venvPython : 'python3';

    // Use the Python test runner wrapper to handle lifecycle hooks
    const runnerScript = join(dirname(__dirname), 'python-test-runner.py');

    // Prepare environment with SDK config and overrides
    const env = { ...process.env } as NodeJS.ProcessEnv;

    // Pass the SDK path for display in output
    if (sdkPath) {
      env.SDK_PATH = sdkPath;
    }

    // Pass the entire SDK config (including framework_type)
    if (config) {
      env.SDK_CONFIG = JSON.stringify(config);
    }

    // Pass test case specific overrides
    if (config?.overrides && config.overrides[caseId]) {
      env.SDK_CONFIG_OVERRIDES = JSON.stringify(config.overrides[caseId]);
    }

    // Pass local Sentry SDK paths (for informational purposes)
    if (options?.localSentryPythonPath) {
      env.LOCAL_SENTRY_PYTHON_PATH = options.localSentryPythonPath;
    }
    if (options?.localSentryJavaScriptPath) {
      env.LOCAL_SENTRY_JAVASCRIPT_PATH = options.localSentryJavaScriptPath;
    }

    // Check if verbose mode is enabled
    const isVerbose = process.env.SENTRY_AI_TEST_VERBOSE === 'true';

    const python = spawn(pythonCmd, [runnerScript, sdkDir, filePath], {
      stdio: ['inherit', 'inherit', isVerbose ? 'inherit' : 'pipe'],  // Show stderr directly in verbose mode
      cwd: sdkDir,
      env  // Pass parent env with SDK config
    });

    let stderrData = '';

    // Only capture stderr if not in verbose mode
    if (!isVerbose) {
      python.stderr?.on('data', (data) => {
        stderrData += data.toString();
      });
    }

    python.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        // In verbose mode, stderr was already shown - just report the exit code
        if (isVerbose) {
          reject(new Error(`Python test exited with code ${code}`));
          return;
        }

        // Extract the error message from stderr (line starting with "✗ Test failed:")
        // and collect everything after it until the traceback starts
        const lines = stderrData.split('\n');
        let errorMsg = '';
        let capturing = false;

        for (const line of lines) {
          if (line.startsWith('✗ Test failed:')) {
            errorMsg = line.replace('✗ Test failed: ', '');
            capturing = true;
          } else if (capturing && (line.startsWith('Traceback') || line.startsWith('  File'))) {
            // Stop at traceback
            break;
          } else if (capturing && line.trim()) {
            errorMsg += '\n' + line;
          }
        }

        if (!errorMsg) {
          errorMsg = `Python test exited with code ${code}`;
        }

        reject(new Error(errorMsg));
      }
    });

    python.on('error', (err) => {
      reject(err);
    });
  });
}

/**
 * Run all test cases for a single SDK
 */
export async function runSDKTests(sdk: SDK, options?: LocalSentryOptions): Promise<TestResult[]> {
  const results: TestResult[] = [];

  // Run each test case in its own subprocess (for isolation)
  for (const testCase of sdk.cases) {
    const result = await runTestCase(testCase, {}, sdk, options);
    results.push(result);

    // Stop on first failure (optional - can be made configurable)
    // if (result.status === 'failed') {
    //   break;
    // }
  }

  return results;
}

/**
 * Run tests for multiple SDKs
 */
export async function runTests(sdks: SDK[], options?: LocalSentryOptions): Promise<TestResult[]> {
  const allResults: TestResult[] = [];

  for (const sdk of sdks) {
    const results = await runSDKTests(sdk, options);
    allResults.push(...results);
  }

  return allResults;
}
