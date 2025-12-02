/**
 * Setup command - Install all dependencies across the repository
 */

import { spawn } from 'child_process';
import { join, resolve } from 'path';
import { existsSync, statSync, readFileSync, writeFileSync, unlinkSync } from 'fs';
import chalk from 'chalk';
import { discoverSDKs } from './discovery.js';
import { REPO_ROOT } from './discovery.js';
import type { SetupOptions, LocalSentryOptions } from './types.js';

interface SetupResult {
  success: boolean;
  sdkPath?: string;
  step: string;
  error?: string;
}

/**
 * Validate local Sentry Python SDK path
 */
function validateLocalSentrySdkPath(path: string): void {
  const absolutePath = resolve(path);

  // Check if path exists
  if (!existsSync(absolutePath)) {
    throw new Error(
      chalk.red(`✗ Local Sentry SDK path does not exist: ${path}`) +
      '\n' +
      chalk.gray('  Check the path and try again.')
    );
  }

  // Check if it's a directory
  const stats = statSync(absolutePath);
  if (!stats.isDirectory()) {
    throw new Error(
      chalk.red(`✗ Local Sentry SDK path is not a directory: ${path}`) +
      '\n' +
      chalk.gray('  Path must point to the repository root directory.')
    );
  }

  // Check if setup.py exists
  const setupPyPath = join(absolutePath, 'setup.py');
  if (!existsSync(setupPyPath)) {
    throw new Error(
      chalk.red(`✗ Local Sentry SDK path missing setup.py: ${path}`) +
      '\n' +
      chalk.gray('  Path must be a valid Python package with setup.py.')
    );
  }

  // Check if sentry_sdk/ directory exists
  const sentrySdkDir = join(absolutePath, 'sentry_sdk');
  if (!existsSync(sentrySdkDir) || !statSync(sentrySdkDir).isDirectory()) {
    throw new Error(
      chalk.red(`✗ Local Sentry SDK path missing sentry_sdk/ directory: ${path}`) +
      '\n' +
      chalk.gray('  Path must contain the sentry_sdk package.')
    );
  }
}

/**
 * Validate local Sentry JavaScript SDK path
 */
function validateLocalSentryJsSdkPath(path: string): void {
  const absolutePath = resolve(path);

  // Check if path exists
  if (!existsSync(absolutePath)) {
    throw new Error(
      chalk.red(`✗ Local Sentry JavaScript SDK path does not exist: ${path}`) +
      '\n' +
      chalk.gray('  Check the path and try again.')
    );
  }

  // Check if it's a directory
  const stats = statSync(absolutePath);
  if (!stats.isDirectory()) {
    throw new Error(
      chalk.red(`✗ Local Sentry JavaScript SDK path is not a directory: ${path}`) +
      '\n' +
      chalk.gray('  Path must point to the repository root directory.')
    );
  }

  // Check if packages/ directory exists (monorepo structure)
  const packagesDir = join(absolutePath, 'packages');
  if (!existsSync(packagesDir) || !statSync(packagesDir).isDirectory()) {
    throw new Error(
      chalk.red(`✗ Local Sentry JavaScript SDK path missing packages/ directory: ${path}`) +
      '\n' +
      chalk.gray('  Path must be the sentry-javascript monorepo with packages/ directory.')
    );
  }

  // Check if package.json exists at root (monorepo root)
  const rootPackageJson = join(absolutePath, 'package.json');
  if (!existsSync(rootPackageJson)) {
    throw new Error(
      chalk.red(`✗ Local Sentry JavaScript SDK path missing root package.json: ${path}`) +
      '\n' +
      chalk.gray('  Path must be a valid npm workspace/monorepo.')
    );
  }
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
async function setupJavaScriptSDK(sdkPath: string, absolutePath: string, options?: LocalSentryOptions): Promise<SetupResult> {
  try {
    // If local Sentry JavaScript SDK path is provided, link it
    if (options?.localSentryJavaScriptPath) {
      const absoluteLocalPath = resolve(options.localSentryJavaScriptPath);
      validateLocalSentryJsSdkPath(absoluteLocalPath);

      // Read package.json to find which @sentry/* packages are used
      const packageJsonPath = join(absolutePath, 'package.json');
      const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
      const sentryPackages = Object.keys(packageJson.dependencies || {})
        .filter(pkg => pkg.startsWith('@sentry/'));

      if (sentryPackages.length === 0) {
        process.stdout.write(chalk.yellow(`  ${sdkPath} - No @sentry/* packages found, skipping\n`));
        return {
          success: true,
          sdkPath,
          step: 'npm install (no sentry packages)'
        };
      }

      // Link each Sentry package from the local SDK
      for (const sentryPkg of sentryPackages) {
        process.stdout.write(chalk.gray(`  ${sdkPath} - Linking ${sentryPkg}...`));

        // Get the package name without scope (e.g., @sentry/node -> node)
        const packageName = sentryPkg.split('/')[1];
        const packagePath = join(absoluteLocalPath, 'packages', packageName);

        // Check if package exists in local SDK
        if (!existsSync(packagePath)) {
          process.stdout.write(chalk.yellow(` (not found in local SDK, using npm)\n`));
          continue;
        }

        // Link the package: npm link /path/to/sentry-javascript/packages/node
        await runCommand('npm', ['link', packagePath], absolutePath);
        process.stdout.write(chalk.green(' ✓\n'));
      }

      // Install other dependencies
      process.stdout.write(chalk.gray(`  ${sdkPath} - Installing other dependencies...`));
      await runCommand('npm', ['install'], absolutePath);
      process.stdout.write(chalk.green(' ✓\n'));

      return {
        success: true,
        sdkPath,
        step: 'npm install (linked)'
      };
    } else {
      // Standard install
      process.stdout.write(chalk.gray(`  ${sdkPath} - Installing dependencies...`));
      await runCommand('npm', ['install'], absolutePath);
      process.stdout.write(chalk.green(' ✓\n'));

      return {
        success: true,
        sdkPath,
        step: 'npm install'
      };
    }
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
async function setupPythonSDK(sdkPath: string, absolutePath: string, options?: LocalSentryOptions): Promise<SetupResult[]> {
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
    const pipPath = join(venvPath, 'bin', 'pip');

    // If local Sentry SDK path is provided, install it as editable
    if (options?.localSentryPythonPath) {
      // Validate the local path
      const absoluteLocalPath = resolve(options.localSentryPythonPath);
      validateLocalSentrySdkPath(absoluteLocalPath);

      // Install editable Sentry SDK first
      process.stdout.write(chalk.gray(`  ${sdkPath} - Installing editable Sentry SDK...`));
      await runCommand(pipPath, ['install', '-e', absoluteLocalPath], absolutePath);
      process.stdout.write(chalk.green(' ✓\n'));

      // Create temporary requirements.txt without sentry-sdk
      const requirementsContent = readFileSync(requirementsPath, 'utf-8');
      const filteredLines = requirementsContent
        .split('\n')
        .filter(line => !line.trim().startsWith('sentry-sdk'))
        .join('\n');

      const tempRequirementsPath = join(absolutePath, '.requirements-temp.txt');
      writeFileSync(tempRequirementsPath, filteredLines, 'utf-8');

      // Install other dependencies
      process.stdout.write(chalk.gray(`  ${sdkPath} - Installing other dependencies...`));
      await runCommand(pipPath, ['install', '-r', '.requirements-temp.txt'], absolutePath);
      process.stdout.write(chalk.green(' ✓\n'));

      // Clean up temp file
      unlinkSync(tempRequirementsPath);

      results.push({
        success: true,
        sdkPath,
        step: 'pip install (editable)'
      });
    } else {
      // Standard install from requirements.txt
      process.stdout.write(chalk.gray(`  ${sdkPath} - Installing dependencies...`));
      await runCommand(pipPath, ['install', '-r', 'requirements.txt'], absolutePath);
      process.stdout.write(chalk.green(' ✓\n'));

      results.push({
        success: true,
        sdkPath,
        step: 'pip install'
      });
    }
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
export async function setup(options?: SetupOptions): Promise<void> {
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
      const result = await setupJavaScriptSDK(sdk.path, sdk.absolutePath, options);
      allResults.push(result);
    }
    console.log('');
  }

  // Setup Python SDKs
  if (pySDKs.length > 0) {
    console.log(chalk.bold('Python SDKs'));
    for (const sdk of pySDKs) {
      const results = await setupPythonSDK(sdk.path, sdk.absolutePath, options);
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
