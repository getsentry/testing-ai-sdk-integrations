#!/usr/bin/env node
/**
 * CLI entry point
 */

import 'dotenv/config';
import { Orchestrator } from './orchestrator.js';
import { TestDefinition, FrameworkConfig } from './types.js';
import { discoverFrameworks, listFrameworks } from './runner/framework-discovery.js';
import { getAllTests } from './test-cases/index.js';

interface CLIOptions {
  command: 'run' | 'list';
  framework?: string;
  test?: string;
  platform?: 'js' | 'py';
  sentryPythonPath?: string;
  sentryJavaScriptPath?: string;
  liveStatus?: boolean;
}

function parseArgs(): CLIOptions {
  const args = process.argv.slice(2);
  const options: CLIOptions = { command: 'run' };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case 'list':
        options.command = 'list';
        break;
      case 'run':
        options.command = 'run';
        break;
      case '--framework':
        options.framework = args[++i];
        break;
      case '--test':
        options.test = args[++i];
        break;
      case '--platform':
        options.platform = args[++i] as 'js' | 'py';
        break;
      case '--sentry-python':
        options.sentryPythonPath = args[++i];
        break;
      case '--sentry-javascript':
        options.sentryJavaScriptPath = args[++i];
        break;
      case '--live-status':
        options.liveStatus = true;
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
    }
  }

  return options;
}

function printHelp() {
  console.log(`
Sentry AI SDK Integration Tests

Usage:
  npm start [command] [options]

Commands:
  run             Run tests (default)
  list            List discovered frameworks

Options:
  --framework              Filter by framework name
  --test                   Filter by test name
  --platform               Filter by platform (js or py)
  --live-status            Enable live status display (real-time tree view)
  --sentry-python <path>   Use local Sentry Python SDK (editable install)
  --sentry-javascript <path>  Use local Sentry JavaScript SDK (link)
  --help, -h               Show this help message

Examples:
  npm start list
  npm start run
  npm start run -- --framework openai
  npm start run -- --platform py --test "Basic LLM"
  npm start run -- --framework openai --live-status
  npm start run -- --framework openai --sentry-python ~/sentry-python
  `);
}

async function main() {
  const options = parseArgs();

  console.log('Sentry AI SDK Integration Tests\n');

  // Handle list command
  if (options.command === 'list') {
    listFrameworks();
    return;
  }

  const orchestrator = new Orchestrator({ 
    liveStatus: options.liveStatus 
  });

  try {
    // Start orchestrator
    await orchestrator.start();

    // Discover frameworks
    let discoveredFrameworks = discoverFrameworks();
    
    // Apply filters
    if (options.platform) {
      discoveredFrameworks = discoveredFrameworks.filter(f => f.platform === options.platform);
    }
    if (options.framework) {
      discoveredFrameworks = discoveredFrameworks.filter(f => f.name === options.framework);
    }

    if (discoveredFrameworks.length === 0) {
      console.log('No frameworks found matching criteria.');
      await orchestrator.stop();
      return;
    }

    // Load test definitions
    let testDefinitions = getAllTests();
    if (options.test) {
      testDefinitions = testDefinitions.filter(t => t.name === options.test);
    }

    if (testDefinitions.length === 0) {
      console.log('No tests found matching criteria.');
      await orchestrator.stop();
      return;
    }

    // Set local Sentry SDK paths if provided
    if (options.sentryPythonPath) {
      process.env.SENTRY_PYTHON_PATH = options.sentryPythonPath;
      console.log(`Using local Sentry Python SDK: ${options.sentryPythonPath}\n`);
    }
    if (options.sentryJavaScriptPath) {
      process.env.SENTRY_JAVASCRIPT_PATH = options.sentryJavaScriptPath;
      console.log(`Using local Sentry JavaScript SDK: ${options.sentryJavaScriptPath}\n`);
    }

    // Convert discovered frameworks to test matrix
    const frameworks: FrameworkConfig[] = discoveredFrameworks.map(df => {
      // Determine Sentry version based on platform and local SDK paths
      let sentryVersion = df.sentryVersions[0];
      if (df.platform === 'py' && options.sentryPythonPath) {
        sentryVersion = 'local';
      } else if (df.platform === 'js' && options.sentryJavaScriptPath) {
        sentryVersion = 'local';
      }

      return {
        name: df.name,
        platform: df.platform,
        type: df.type,
        version: df.versions[0],
        sentryVersion,
        templatePath: df.templatePath,
        category: df.category,
        dependencies: df.dependencies,
        executionMode: df.executionMode, // Pass through execution mode
        modelOverrides: df.modelOverrides, // Pass through model overrides
        skip: df.skip, // Pass through skip configuration
      };
    });

    console.log(`Testing ${frameworks.length} framework(s) with ${testDefinitions.length} test(s)\n`);

    // Run tests
    const report = await orchestrator.runTests(frameworks, testDefinitions);

    // Print report
    orchestrator.printReport(report);

    // Exit with appropriate code
    const exitCode = report.failed > 0 || report.errors > 0 ? 1 : 0;
    await orchestrator.stop();
    process.exit(exitCode);
  } catch (error) {
    console.error('Fatal error:', error);
    await orchestrator.stop();
    process.exit(1);
  }
}

main();
