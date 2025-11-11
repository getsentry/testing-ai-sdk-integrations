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
import { setup } from './setup.js';
import { upgrade } from './upgrade.js';
import { generateCTRFReport, writeCTRFFile, printCTRFReport, generateHTML, writeHTMLFile } from './reporters/index.js';
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
  .option('-s, --sdk <sdk>', 'Run tests for specific SDK or language (e.g., js/openai, js, py)')
  .option('-c, --case <case>', 'Run specific test case (e.g., G1)')
  .option('-a, --all', 'Run all tests')
  .option('-v, --verbose', 'Show detailed output including LLM responses')
  .option('-o, --output-dir <path>', 'Output directory for reports', './test-results')
  .option('-r, --reports <formats>', 'Generate reports (comma-separated: ctrf,html or "all")', 'all')
  .action(async (options) => {
    // Validate options
    if (!options.sdk && !options.case && !options.all) {
      console.log(chalk.red('Error: You must specify --sdk, --case, or --all'));
      console.log(chalk.gray('Examples:'));
      console.log(chalk.gray('  sentry-ai-test run --sdk js/openai  (specific SDK)'));
      console.log(chalk.gray('  sentry-ai-test run --sdk js         (all JS SDKs)'));
      console.log(chalk.gray('  sentry-ai-test run --sdk py         (all Python SDKs)'));
      console.log(chalk.gray('  sentry-ai-test run --case 1-simple'));
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

    // Set verbose flag in environment for test runners
    if (options.verbose) {
      process.env.SENTRY_AI_TEST_VERBOSE = 'true';
    }

    // Run tests
    const startTime = Date.now();
    const results = await runTests(sdks);
    const duration = Date.now() - startTime;

    // Generate CTRF report (single source of truth)
    const ctrfReport = generateCTRFReport(results, sdks, duration);

    // Print to console (always)
    printCTRFReport(ctrfReport);

    // Generate file reports if requested
    const reportFormats = options.reports.toLowerCase().split(',').map((f: string) => f.trim());
    const generateAll = reportFormats.includes('all');
    const generateCTRF = generateAll || reportFormats.includes('ctrf');
    const generateHTMLReport = generateAll || reportFormats.includes('html');

    if (generateCTRF || generateHTMLReport) {
      const outputDir = options.outputDir;

      if (generateCTRF) {
        const ctrfPath = await writeCTRFFile(ctrfReport, outputDir);
        console.log(chalk.gray(`📄 CTRF report: ${ctrfPath}`));
      }

      if (generateHTMLReport) {
        const html = generateHTML(ctrfReport);
        const htmlPath = await writeHTMLFile(html, outputDir);
        console.log(chalk.gray(`📄 HTML report: ${htmlPath}`));
      }

      console.log('');
    }

    // Exit with error code if any tests failed
    const hasFailures = results.some(r => r.status === 'failed');
    process.exit(hasFailures ? 1 : 0);
  });

/**
 * Setup command - Install all dependencies
 */
program
  .command('setup')
  .description('Install all dependencies across the repository')
  .action(async () => {
    await setup();
  });

/**
 * Upgrade command - Upgrade a package across all SDKs
 */
program
  .command('upgrade <package> <version>')
  .description('Upgrade a package to a specific version across all SDKs')
  .action(async (packageName: string, version: string) => {
    await upgrade(packageName, version);
  });

// Parse command line arguments
program.parse();
