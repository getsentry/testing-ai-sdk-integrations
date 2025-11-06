/**
 * Test runner - executes test cases with lifecycle hooks
 */

import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import type { SDK, TestCase, TestResult, LifecycleHooks } from './types.js';
import { loadSetupHooks } from './discovery.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Run a single test case
 */
async function runTestCase(testCase: TestCase, hooks: LifecycleHooks): Promise<TestResult> {
  const startTime = Date.now();

  try {
    // Run beforeEach hook
    if (hooks.beforeEach) {
      await hooks.beforeEach();
    }

    // Determine if this is a JS/TS or Python test
    const isPython = testCase.filePath.endsWith('.py');

    if (isPython) {
      // Run Python test using subprocess
      await runPythonTest(testCase.filePath);
    } else {
      // Run JS/TS test by importing and executing
      const testModule = await import(`file://${testCase.filePath}`);

      if (typeof testModule.default === 'function') {
        await testModule.default();
      } else {
        throw new Error(`Test case ${testCase.id} does not export a default function`);
      }
    }

    // Run afterEach hook
    if (hooks.afterEach) {
      await hooks.afterEach();
    }

    return {
      sdkPath: testCase.sdkPath,
      caseId: testCase.id,
      status: 'passed',
      duration: Date.now() - startTime
    };
  } catch (error) {
    // Run afterEach even on failure
    if (hooks.afterEach) {
      try {
        await hooks.afterEach();
      } catch (cleanupError) {
        console.error('Error in afterEach:', cleanupError);
      }
    }

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
 * Run a Python test file
 */
function runPythonTest(filePath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // Get the SDK directory (2 levels up from test file)
    const sdkDir = dirname(dirname(filePath));

    // Check for venv
    const venvPython = `${sdkDir}/.venv/bin/python`;
    const pythonCmd = existsSync(venvPython) ? venvPython : 'python3';

    // Use the Python test runner wrapper to handle lifecycle hooks
    const runnerScript = join(dirname(__dirname), 'python-test-runner.py');

    const python = spawn(pythonCmd, [runnerScript, sdkDir, filePath], {
      stdio: ['inherit', 'inherit', 'pipe'],  // Capture stderr
      cwd: sdkDir,
      env: process.env as NodeJS.ProcessEnv  // Pass parent env (includes root .env vars)
    });

    let stderrData = '';
    python.stderr?.on('data', (data) => {
      // Write to console in real-time
      process.stderr.write(data);
      // Also capture for error message
      stderrData += data.toString();
    });

    python.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        // Extract the error message from stderr (last line starting with "✗ Test failed:")
        const errorMatch = stderrData.match(/✗ Test failed: (.+)$/m);
        const errorMsg = errorMatch ? errorMatch[1] : `Python test exited with code ${code}`;
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
export async function runSDKTests(sdk: SDK): Promise<TestResult[]> {
  const results: TestResult[] = [];

  // Load setup hooks
  const setupModule = await loadSetupHooks(sdk.path);
  const hooks: LifecycleHooks = {
    beforeAll: setupModule.beforeAll,
    beforeEach: setupModule.beforeEach,
    afterEach: setupModule.afterEach,
    afterAll: setupModule.afterAll
  };

  try {
    // Run beforeAll hook
    if (hooks.beforeAll) {
      await hooks.beforeAll();
    }

    // Run each test case
    for (const testCase of sdk.cases) {
      const result = await runTestCase(testCase, hooks);
      results.push(result);

      // Stop on first failure (optional - can be made configurable)
      // if (result.status === 'failed') {
      //   break;
      // }
    }

    // Run afterAll hook
    if (hooks.afterAll) {
      await hooks.afterAll();
    }
  } catch (error) {
    console.error(`Error in lifecycle hooks for ${sdk.path}:`, error);

    // If we haven't run any tests yet, add a failure result
    if (results.length === 0 && sdk.cases.length > 0) {
      results.push({
        sdkPath: sdk.path,
        caseId: sdk.cases[0].id,
        status: 'failed',
        error: error as Error,
        duration: 0
      });
    }
  }

  return results;
}

/**
 * Run tests for multiple SDKs
 */
export async function runTests(sdks: SDK[]): Promise<TestResult[]> {
  const allResults: TestResult[] = [];

  for (const sdk of sdks) {
    const results = await runSDKTests(sdk);
    allResults.push(...results);
  }

  return allResults;
}
