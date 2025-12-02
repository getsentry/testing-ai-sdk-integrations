/**
 * Upgrade command - Upgrade a package across all SDKs
 */

import { spawn } from 'child_process';
import { readFileSync, writeFileSync, existsSync, lstatSync } from 'fs';
import { join } from 'path';
import chalk from 'chalk';
import { discoverSDKs } from './discovery.js';

interface UpgradeResult {
  success: boolean;
  sdkPath: string;
  step: 'update' | 'install';
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
 * Detect if package is JavaScript or Python based on name
 */
function detectPackageType(packageName: string): 'js' | 'py' {
  // JS packages typically:
  // - Start with @ (scoped packages like @sentry/node)
  // - Are common JS packages (openai, dotenv, etc.)

  if (packageName.startsWith('@')) {
    return 'js';
  }

  // Python packages typically use hyphens and don't start with @
  // Common Python packages: sentry-sdk, python-dotenv, openai (can be both!)

  // For ambiguous cases like "openai", we'll need to check what SDKs actually use
  // For now, assume JS if starts with @, otherwise Python
  // User can disambiguate by checking which SDKs get found

  return 'py';
}

/**
 * Check if a JavaScript package version exists on npm
 */
async function checkNpmVersionExists(packageName: string, version: string): Promise<boolean> {
  try {
    await runCommand('npm', ['view', `${packageName}@${version}`, 'version'], process.cwd());
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Check if a Python package version exists on PyPI using the JSON API
 */
async function checkPyPIVersionExists(packageName: string, version: string): Promise<boolean> {
  try {
    // Use PyPI JSON API to check versions
    // This is more reliable than pip index and doesn't require pip to be installed
    const https = await import('https');

    return new Promise<boolean>((resolve, reject) => {
      const url = `https://pypi.org/pypi/${packageName}/json`;

      https.get(url, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            if (res.statusCode === 404) {
              // Package doesn't exist
              resolve(false);
              return;
            }

            if (res.statusCode !== 200) {
              // API error, allow to proceed (install will catch it)
              resolve(true);
              return;
            }

            const json = JSON.parse(data);
            const versions = Object.keys(json.releases || {});
            resolve(versions.includes(version));
          } catch (error) {
            // Parse error, allow to proceed
            resolve(true);
          }
        });
      }).on('error', (err) => {
        // Network error, allow to proceed (install will catch it)
        resolve(true);
      });
    });
  } catch (error) {
    // If check fails, allow to proceed (install will catch the error)
    return true;
  }
}

/**
 * Update package version in package.json
 */
function updatePackageJson(filePath: string, packageName: string, version: string): boolean {
  try {
    const content = readFileSync(filePath, 'utf-8');
    const pkg = JSON.parse(content);

    // Check if package exists in dependencies
    if (!pkg.dependencies || !pkg.dependencies[packageName]) {
      return false; // Package not found
    }

    // Update version (exact version, no ^ or ~)
    pkg.dependencies[packageName] = version;

    // Write back with pretty formatting
    writeFileSync(filePath, JSON.stringify(pkg, null, 2) + '\n', 'utf-8');
    return true;
  } catch (error) {
    throw new Error(`Failed to update package.json: ${(error as Error).message}`);
  }
}

/**
 * Check if a package is linked using npm link
 */
function isNpmLinked(sdkPath: string, packageName: string): boolean {
  try {
    const nodeModulesPath = join(sdkPath, 'node_modules', packageName);

    // Check if the package exists in node_modules
    if (!existsSync(nodeModulesPath)) {
      return false;
    }

    // Check if it's a symlink (npm link creates symlinks)
    const stats = lstatSync(nodeModulesPath);
    return stats.isSymbolicLink();
  } catch (error) {
    // If we can't determine, assume it's not linked
    return false;
  }
}

/**
 * Check if a package is installed as editable in a Python venv
 */
async function isEditableInstall(venvPath: string, packageName: string): Promise<boolean> {
  try {
    const pipPath = join(venvPath, 'bin', 'pip');

    // Run pip list --format=json to get package information
    const output = await new Promise<string>((resolve, reject) => {
      const child = spawn(pipPath, ['list', '--format=json'], {
        stdio: 'pipe'
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
          resolve(stdout);
        } else {
          reject(new Error(stderr || 'pip list failed'));
        }
      });

      child.on('error', (err) => {
        reject(err);
      });
    });

    // Parse JSON output
    const packages = JSON.parse(output);

    // Find the package
    const pkg = packages.find((p: any) => p.name === packageName);

    if (!pkg) {
      return false;
    }

    // Check if it's editable (location contains a path, not site-packages)
    // Editable packages have an 'editable_project_location' field or
    // their location doesn't point to site-packages
    if (pkg.editable_project_location) {
      return true;
    }

    // Fallback: check if location looks like an editable install
    // (contains a path that's not in site-packages)
    if (pkg.location && !pkg.location.includes('site-packages')) {
      return true;
    }

    return false;
  } catch (error) {
    // If we can't determine, assume it's not editable
    return false;
  }
}

/**
 * Update package version in requirements.txt
 */
function updateRequirementsTxt(filePath: string, packageName: string, version: string): boolean {
  try {
    const content = readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');

    let found = false;
    const updatedLines = lines.map(line => {
      // Match lines like "sentry-sdk==2.0.0" or "sentry-sdk>=2.0.0"
      const match = line.match(/^([a-zA-Z0-9_-]+)(==|>=|<=|>|<)(.+)$/);
      if (match && match[1] === packageName) {
        found = true;
        return `${packageName}==${version}`;
      }
      return line;
    });

    if (!found) {
      return false; // Package not found
    }

    writeFileSync(filePath, updatedLines.join('\n'), 'utf-8');
    return true;
  } catch (error) {
    throw new Error(`Failed to update requirements.txt: ${(error as Error).message}`);
  }
}

/**
 * Upgrade JavaScript SDKs
 */
async function upgradeJavaScriptSDKs(packageName: string, version: string): Promise<UpgradeResult[]> {
  const results: UpgradeResult[] = [];
  const sdks = await discoverSDKs();
  const jsSDKs = sdks.filter(sdk => sdk.language === 'js');

  for (const sdk of jsSDKs) {
    const packageJsonPath = join(sdk.absolutePath, 'package.json');

    if (!existsSync(packageJsonPath)) {
      continue;
    }

    // Check if package is linked via npm link
    const isLinked = isNpmLinked(sdk.absolutePath, packageName);
    if (isLinked) {
      process.stdout.write(chalk.yellow(`  ${sdk.path} - Skipping (npm linked)\n`));
      process.stdout.write(chalk.gray(`    To upgrade, first unlink:\n`));
      process.stdout.write(chalk.gray(`    cd ${sdk.path} && npm unlink ${packageName}\n`));
      process.stdout.write(chalk.gray(`    Then run: npm run cli setup\n`));
      continue;
    }

    // Try to update package.json
    try {
      process.stdout.write(chalk.gray(`  ${sdk.path} - Updating package.json...`));
      const wasUpdated = updatePackageJson(packageJsonPath, packageName, version);

      if (!wasUpdated) {
        process.stdout.write(chalk.gray(' (not used)\n'));
        continue; // Package not in this SDK
      }

      process.stdout.write(chalk.green(' ✓\n'));
      results.push({
        success: true,
        sdkPath: sdk.path,
        step: 'update'
      });
    } catch (error) {
      process.stdout.write(chalk.red(' ✗\n'));
      results.push({
        success: false,
        sdkPath: sdk.path,
        step: 'update',
        error: (error as Error).message
      });
      continue; // Can't install if update failed
    }

    // Run npm install
    try {
      process.stdout.write(chalk.gray(`  ${sdk.path} - Installing dependencies...`));
      await runCommand('npm', ['install'], sdk.absolutePath);
      process.stdout.write(chalk.green(' ✓\n'));
      results.push({
        success: true,
        sdkPath: sdk.path,
        step: 'install'
      });
    } catch (error) {
      process.stdout.write(chalk.red(' ✗\n'));
      results.push({
        success: false,
        sdkPath: sdk.path,
        step: 'install',
        error: (error as Error).message
      });
    }
  }

  return results;
}

/**
 * Upgrade Python SDKs
 */
async function upgradePythonSDKs(packageName: string, version: string): Promise<UpgradeResult[]> {
  const results: UpgradeResult[] = [];
  const sdks = await discoverSDKs();
  const pySDKs = sdks.filter(sdk => sdk.language === 'py');

  for (const sdk of pySDKs) {
    const requirementsPath = join(sdk.absolutePath, 'requirements.txt');
    const venvPath = join(sdk.absolutePath, '.venv');

    if (!existsSync(requirementsPath)) {
      continue;
    }

    // Check if package is installed as editable
    if (existsSync(venvPath)) {
      const isEditable = await isEditableInstall(venvPath, packageName);
      if (isEditable) {
        process.stdout.write(chalk.yellow(`  ${sdk.path} - Skipping (editable install active)\n`));
        process.stdout.write(chalk.gray(`    To upgrade, first remove editable install:\n`));
        process.stdout.write(chalk.gray(`    cd ${sdk.path} && .venv/bin/pip uninstall ${packageName}\n`));
        process.stdout.write(chalk.gray(`    Then run: npm run cli setup\n`));
        continue;
      }
    }

    // Try to update requirements.txt
    try {
      process.stdout.write(chalk.gray(`  ${sdk.path} - Updating requirements.txt...`));
      const wasUpdated = updateRequirementsTxt(requirementsPath, packageName, version);

      if (!wasUpdated) {
        process.stdout.write(chalk.gray(' (not used)\n'));
        continue; // Package not in this SDK
      }

      process.stdout.write(chalk.green(' ✓\n'));
      results.push({
        success: true,
        sdkPath: sdk.path,
        step: 'update'
      });
    } catch (error) {
      process.stdout.write(chalk.red(' ✗\n'));
      results.push({
        success: false,
        sdkPath: sdk.path,
        step: 'update',
        error: (error as Error).message
      });
      continue; // Can't install if update failed
    }

    // Run pip install
    if (!existsSync(venvPath)) {
      process.stdout.write(chalk.yellow(`  ${sdk.path} - Skipping install (no venv found)\n`));
      continue;
    }

    try {
      process.stdout.write(chalk.gray(`  ${sdk.path} - Installing dependencies...`));
      const pipPath = join(venvPath, 'bin', 'pip');
      await runCommand(pipPath, ['install', '-r', 'requirements.txt'], sdk.absolutePath);
      process.stdout.write(chalk.green(' ✓\n'));
      results.push({
        success: true,
        sdkPath: sdk.path,
        step: 'install'
      });
    } catch (error) {
      process.stdout.write(chalk.red(' ✗\n'));
      results.push({
        success: false,
        sdkPath: sdk.path,
        step: 'install',
        error: (error as Error).message
      });
    }
  }

  return results;
}

/**
 * Main upgrade function
 */
export async function upgrade(packageName: string, version: string): Promise<void> {
  console.log(chalk.blue.bold(`\n📦 Upgrading ${packageName} to ${version}\n`));

  // Detect package type
  const packageType = detectPackageType(packageName);

  // Check if version exists
  if (packageType === 'js') {
    console.log(chalk.gray(`Detected as JavaScript package`));
    process.stdout.write(chalk.gray(`Checking if version exists on npm...`));

    const exists = await checkNpmVersionExists(packageName, version);
    if (!exists) {
      process.stdout.write(chalk.red(' ✗\n\n'));
      console.log(chalk.red.bold(`✗ Version ${version} does not exist for ${packageName}\n`));
      console.log(chalk.gray(`Check available versions with: npm view ${packageName} versions\n`));
      process.exit(1);
    }

    process.stdout.write(chalk.green(' ✓\n\n'));
  } else {
    console.log(chalk.gray(`Detected as Python package`));
    process.stdout.write(chalk.gray(`Checking if version exists on PyPI...`));

    const exists = await checkPyPIVersionExists(packageName, version);
    if (!exists) {
      process.stdout.write(chalk.red(' ✗\n\n'));
      console.log(chalk.red.bold(`✗ Version ${version} does not exist for ${packageName}\n`));
      console.log(chalk.gray(`Check available versions with: pip index versions ${packageName}\n`));
      process.exit(1);
    }

    process.stdout.write(chalk.green(' ✓\n\n'));
  }

  let results: UpgradeResult[];

  if (packageType === 'js') {
    results = await upgradeJavaScriptSDKs(packageName, version);
  } else {
    results = await upgradePythonSDKs(packageName, version);
  }

  console.log('');

  // Filter to only SDKs that were actually updated
  const updatedSDKs = new Set<string>();
  for (const result of results) {
    if (result.step === 'update' && result.success) {
      updatedSDKs.add(result.sdkPath);
    }
  }

  if (updatedSDKs.size === 0) {
    console.log(chalk.yellow(`⚠ No SDKs use ${packageName}\n`));
    return;
  }

  // Print summary
  const failed = results.filter(r => !r.success);

  if (failed.length === 0) {
    console.log(chalk.green.bold(`✓ Upgraded ${updatedSDKs.size} SDK(s) successfully\n`));
  } else {
    console.log(chalk.yellow.bold(`⚠ Upgraded with ${failed.length} error(s)\n`));
    console.log(chalk.bold('Failed steps:'));
    for (const result of failed) {
      console.log(chalk.red(`  ✗ ${result.sdkPath} (${result.step})`));
      if (result.error) {
        console.log(chalk.gray(`    ${result.error.split('\n')[0]}`));
      }
    }
    console.log('');
  }
}
