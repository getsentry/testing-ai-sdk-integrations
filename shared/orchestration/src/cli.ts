#!/usr/bin/env node

/**
 * Sentry AI SDK Integration Test CLI
 *
 * Main entry point for the test orchestration system
 */

import { config } from 'dotenv';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { Command } from 'commander';
import chalk from 'chalk';
import { discoverSDKs, filterSDKs } from './discovery.js';
import { runTests } from './runner.js';
import type { TestResult } from './types.js';

// Load root .env file
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// Navigate from src/ -> orchestration/ -> shared/ -> root/
const rootDir = join(__dirname, '../../..');
config({ path: join(rootDir, '.env') });

const program = new Command();

program
  .name('sentry-ai-test')
  .description('CLI tool for running Sentry AI SDK integration tests')
  .version('1.0.0');

/**
 * List command - shows all available SDKs and test cases
 */
program
  .command('list')
  .description('List all available SDKs and test cases')
  .action(async () => {
    console.log(chalk.blue.bold('\n📋 Available SDKs and Test Cases\n'));

    const sdks = await discoverSDKs();

    if (sdks.length === 0) {
      console.log(chalk.yellow('No SDKs found. Have you implemented any yet?'));
      console.log(chalk.gray('SDKs should be in: sdks/{js|py}/{sdk-name}/cases/'));
      return;
    }

    for (const sdk of sdks) {
      const setupIndicator = sdk.hasSetup ? chalk.green('✓') : chalk.gray('○');
      console.log(chalk.cyan.bold(`${sdk.path}`) + ` ${setupIndicator}`);

      if (sdk.cases.length === 0) {
        console.log(chalk.gray('  No test cases found'));
      } else {
        for (const testCase of sdk.cases) {
          console.log(chalk.gray(`  • ${testCase.id}`));
        }
      }
      console.log('');
    }

    console.log(chalk.gray(`Total: ${sdks.length} SDKs, ${sdks.reduce((sum, sdk) => sum + sdk.cases.length, 0)} test cases`));
    console.log(chalk.gray(`${chalk.green('✓')} = has setup.ts/setup.py file\n`));
  });

/**
 * Run command - executes test cases
 */
program
  .command('run')
  .description('Run test cases')
  .option('-s, --sdk <sdk>', 'Run tests for specific SDK (e.g., js/openai)')
  .option('-c, --case <case>', 'Run specific test case (e.g., G1)')
  .option('-a, --all', 'Run all tests')
  .action(async (options) => {
    // Validate options
    if (!options.sdk && !options.case && !options.all) {
      console.log(chalk.red('Error: You must specify --sdk, --case, or --all'));
      console.log(chalk.gray('Examples:'));
      console.log(chalk.gray('  sentry-ai-test run --sdk js/openai'));
      console.log(chalk.gray('  sentry-ai-test run --case G1'));
      console.log(chalk.gray('  sentry-ai-test run --all'));
      process.exit(1);
    }

    console.log(chalk.blue.bold('\n🧪 Running Sentry AI SDK Tests\n'));

    // Discover all SDKs
    const allSDKs = await discoverSDKs();

    if (allSDKs.length === 0) {
      console.log(chalk.yellow('No SDKs found. Have you implemented any yet?'));
      return;
    }

    // Filter based on options
    const sdks = filterSDKs(allSDKs, {
      sdk: options.sdk,
      case: options.case
    });

    if (sdks.length === 0) {
      console.log(chalk.yellow('No SDKs or test cases match your filters.'));
      return;
    }

    // Show what we're running
    const totalCases = sdks.reduce((sum, sdk) => sum + sdk.cases.length, 0);
    console.log(chalk.gray(`Running ${totalCases} test case(s) across ${sdks.length} SDK(s)\n`));

    for (const sdk of sdks) {
      console.log(chalk.cyan(`${sdk.path}`) + chalk.gray(` (${sdk.cases.map(c => c.id).join(', ')})`));
    }
    console.log('');

    // Run tests
    const startTime = Date.now();
    const results = await runTests(sdks);
    const duration = Date.now() - startTime;

    // Print results
    printResults(results, duration);

    // Exit with error code if any tests failed
    const hasFailures = results.some(r => r.status === 'failed');
    process.exit(hasFailures ? 1 : 0);
  });

/**
 * Print test results
 */
function printResults(results: TestResult[], totalDuration: number) {
  console.log(chalk.blue.bold('\n📊 Test Results\n'));

  // Group by SDK
  const resultsBySDK = new Map<string, TestResult[]>();
  for (const result of results) {
    if (!resultsBySDK.has(result.sdkPath)) {
      resultsBySDK.set(result.sdkPath, []);
    }
    resultsBySDK.get(result.sdkPath)!.push(result);
  }

  // Print results for each SDK
  for (const [sdkPath, sdkResults] of resultsBySDK) {
    console.log(chalk.cyan.bold(sdkPath));

    for (const result of sdkResults) {
      const statusIcon = result.status === 'passed'
        ? chalk.green('✓')
        : chalk.red('✗');

      const duration = chalk.gray(`(${result.duration}ms)`);

      console.log(`  ${statusIcon} ${result.caseId} ${duration}`);

      if (result.error) {
        const errorLines = result.error.message.split('\n');
        for (const line of errorLines) {
          console.log(chalk.red(`    ${line}`));
        }
      }
    }
    console.log('');
  }

  // Print summary
  const passed = results.filter(r => r.status === 'passed').length;
  const failed = results.filter(r => r.status === 'failed').length;
  const total = results.length;

  console.log(chalk.bold('Summary:'));
  console.log(`  ${chalk.green(`${passed} passed`)}, ${chalk.red(`${failed} failed`)}, ${total} total`);
  console.log(chalk.gray(`  Time: ${(totalDuration / 1000).toFixed(2)}s\n`));

  if (failed === 0) {
    console.log(chalk.green.bold('✓ All tests passed!\n'));
  } else {
    console.log(chalk.red.bold('✗ Some tests failed\n'));
  }
}

// Parse command line arguments
program.parse();
