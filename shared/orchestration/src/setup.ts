/**
 * Setup command - Install all dependencies across the repository
 */

import { spawn } from 'child_process';
import { join } from 'path';
import { existsSync } from 'fs';
import chalk from 'chalk';
import { discoverSDKs } from './discovery.js';
import { REPO_ROOT } from './discovery.js';

interface SetupResult {
  success: boolean;
  sdkPath?: string;
  step: string;
  error?: string;
}

/**
 * Run a command and return success/failure
 */
function runCommand(command: string, args: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: 'pipe',
      env: process.env as NodeJS.ProcessEnv
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(stderr || stdout || `Command failed with exit code ${code}`));
      }
    });

    child.on('error', (err) => {
      reject(err);
    });
  });
}

/**
 * Setup orchestration dependencies
 */
async function setupOrchestration(): Promise<SetupResult> {
  const orchestrationDir = join(REPO_ROOT, 'shared', 'orchestration');

  try {
    process.stdout.write(chalk.gray('  Installing dependencies...'));
    await runCommand('npm', ['install'], orchestrationDir);
    process.stdout.write(chalk.green(' ✓\n'));

    return {
      success: true,
      step: 'orchestration'
    };
  } catch (error) {
    process.stdout.write(chalk.red(' ✗\n'));
    return {
      success: false,
      step: 'orchestration',
      error: (error as Error).message
    };
  }
}

/**
 * Setup a JavaScript SDK
 */
async function setupJavaScriptSDK(sdkPath: string, absolutePath: string): Promise<SetupResult> {
  try {
    process.stdout.write(chalk.gray(`  ${sdkPath} - Installing dependencies...`));
    await runCommand('npm', ['install'], absolutePath);
    process.stdout.write(chalk.green(' ✓\n'));

    return {
      success: true,
      sdkPath,
      step: 'npm install'
    };
  } catch (error) {
    process.stdout.write(chalk.red(' ✗\n'));
    return {
      success: false,
      sdkPath,
      step: 'npm install',
      error: (error as Error).message
    };
  }
}

/**
 * Setup a Python SDK
 */
async function setupPythonSDK(sdkPath: string, absolutePath: string): Promise<SetupResult[]> {
  const results: SetupResult[] = [];
  const venvPath = join(absolutePath, '.venv');
  const requirementsPath = join(absolutePath, 'requirements.txt');

  // Check if requirements.txt exists
  if (!existsSync(requirementsPath)) {
    process.stdout.write(chalk.yellow(`  ${sdkPath} - No requirements.txt found, skipping\n`));
    return results;
  }

  // Create venv if it doesn't exist
  if (!existsSync(venvPath)) {
    try {
      process.stdout.write(chalk.gray(`  ${sdkPath} - Creating venv...`));
      await runCommand('python3', ['-m', 'venv', '.venv'], absolutePath);
      process.stdout.write(chalk.green(' ✓\n'));

      results.push({
        success: true,
        sdkPath,
        step: 'create venv'
      });
    } catch (error) {
      process.stdout.write(chalk.red(' ✗\n'));
      results.push({
        success: false,
        sdkPath,
        step: 'create venv',
        error: (error as Error).message
      });
      return results; // Can't continue without venv
    }
  }

  // Install requirements
  try {
    process.stdout.write(chalk.gray(`  ${sdkPath} - Installing dependencies...`));
    const pipPath = join(venvPath, 'bin', 'pip');
    await runCommand(pipPath, ['install', '-r', 'requirements.txt'], absolutePath);
    process.stdout.write(chalk.green(' ✓\n'));

    results.push({
      success: true,
      sdkPath,
      step: 'pip install'
    });
  } catch (error) {
    process.stdout.write(chalk.red(' ✗\n'));
    results.push({
      success: false,
      sdkPath,
      step: 'pip install',
      error: (error as Error).message
    });
  }

  return results;
}

/**
 * Main setup function
 */
export async function setup(): Promise<void> {
  console.log(chalk.blue.bold('\n🔧 Setting up Sentry AI SDK Test Repository\n'));

  const allResults: SetupResult[] = [];

  // Setup orchestration
  console.log(chalk.bold('Orchestration'));
  const orchestrationResult = await setupOrchestration();
  allResults.push(orchestrationResult);
  console.log('');

  // Discover all SDKs
  const sdks = await discoverSDKs();
  const jsSDKs = sdks.filter(sdk => sdk.language === 'js');
  const pySDKs = sdks.filter(sdk => sdk.language === 'py');

  // Setup JavaScript SDKs
  if (jsSDKs.length > 0) {
    console.log(chalk.bold('JavaScript SDKs'));
    for (const sdk of jsSDKs) {
      const result = await setupJavaScriptSDK(sdk.path, sdk.absolutePath);
      allResults.push(result);
    }
    console.log('');
  }

  // Setup Python SDKs
  if (pySDKs.length > 0) {
    console.log(chalk.bold('Python SDKs'));
    for (const sdk of pySDKs) {
      const results = await setupPythonSDK(sdk.path, sdk.absolutePath);
      allResults.push(...results);
    }
    console.log('');
  }

  // Print summary
  const successful = allResults.filter(r => r.success).length;
  const failed = allResults.filter(r => !r.success);

  if (failed.length === 0) {
    console.log(chalk.green.bold(`✓ Setup complete! ${successful} steps successful\n`));
  } else {
    console.log(chalk.yellow.bold(`⚠ Setup complete with ${failed.length} error(s)\n`));
    console.log(chalk.bold('Failed steps:'));
    for (const result of failed) {
      const location = result.sdkPath || result.step;
      console.log(chalk.red(`  ✗ ${location} (${result.step})`));
      if (result.error) {
        console.log(chalk.gray(`    ${result.error.split('\n')[0]}`));
      }
    }
    console.log('');
  }
}
