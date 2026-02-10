#!/usr/bin/env node
/**
 * CLI tool to setup test environments and render templates without executing tests.
 * This creates the same structure as actual tests in runs/ directory.
 */

import "dotenv/config";
import { Orchestrator } from "./orchestrator.js";
import { FrameworkConfig } from "./types.js";
import { discoverFrameworks } from "./runner/framework-discovery.js";
import { getAllTests } from "./test-cases/index.js";

interface SetupOptions {
  platform?: "node" | "py";
  framework?: string;
  test?: string;
  sync?: boolean;
  async?: boolean;
  streaming?: boolean;
  blocking?: boolean;
  sentryPythonPath?: string;
  sentryJavaScriptPath?: string;
  verbose?: boolean;
}

function parseArgs(): SetupOptions {
  const args = process.argv.slice(2);
  const options: SetupOptions = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const value = args[i + 1];

    switch (arg) {
      case "--platform":
      case "-p":
        if (value !== "js" && value !== "py") {
          console.error('Error: --platform must be "js" or "py"');
          process.exit(1);
        }
        options.platform = value;
        i++;
        break;
      case "--framework":
      case "-f":
        options.framework = value;
        i++;
        break;
      case "--test":
      case "-t":
        options.test = value;
        i++;
        break;
      case "--sync":
        options.sync = true;
        break;
      case "--async":
        options.async = true;
        break;
      case "--streaming":
        options.streaming = true;
        break;
      case "--blocking":
        options.blocking = true;
        break;
      case "--sentry-python":
        options.sentryPythonPath = value;
        i++;
        break;
      case "--sentry-javascript":
        options.sentryJavaScriptPath = value;
        i++;
        break;
      case "--verbose":
      case "-v":
        options.verbose = true;
        break;
      case "--help":
      case "-h":
        printHelp();
        process.exit(0);
      default:
        console.error(`Unknown option: ${arg}`);
        printHelp();
        process.exit(1);
    }
  }

  return options;
}

function printHelp(): void {
  console.log(`
Setup - Create test environments and render templates without executing tests

Usage:
  npm run setup [options]

Options:
  -p, --platform <js|py>      Only setup for specific platform
  -f, --framework <name>      Only setup for specific framework
  -t, --test <name>           Only setup for specific test
  --sync                      Only setup sync tests (Python only)
  --async                     Only setup async tests (Python only)
  --streaming                 Only setup streaming tests
  --blocking                  Only setup blocking (non-streaming) tests
  --sentry-python <path>      Use local Sentry Python SDK (editable install)
  --sentry-javascript <path>  Use local Sentry JavaScript SDK (link)
  -v, --verbose               Show detailed output
  -h, --help                  Show this help

Examples:
  npm run setup
  npm run setup -- --platform py
  npm run setup -- --framework openai
  npm run setup -- --test "Basic LLM Test"
  npm run setup -- --platform py --framework openai --sync --streaming
  npm run setup -- --sentry-python ~/sentry-python

Output:
  Creates test environments in runs/ directory with:
  - Virtual environments (Python) or node_modules (JavaScript)
  - Installed dependencies
  - Rendered test files

  Use 'npm start run' to execute the tests after setup.
  `);
}

async function main(): Promise<void> {
  const options = parseArgs();

  console.log("Sentry AI SDK Integration Tests - Setup\n");

  // Create orchestrator with setup-specific options (no span collector needed)
  const orchestrator = new Orchestrator({
    verbose: options.verbose,
    sync: options.sync,
    async: options.async,
    streaming: options.streaming,
    blocking: options.blocking,
  });

  // Discover frameworks
  let discoveredFrameworks = discoverFrameworks();

  // Apply filters
  if (options.platform) {
    discoveredFrameworks = discoveredFrameworks.filter(
      (f) => f.platform === options.platform,
    );
  }
  if (options.framework) {
    discoveredFrameworks = discoveredFrameworks.filter(
      (f) => f.name === options.framework,
    );
  }

  if (discoveredFrameworks.length === 0) {
    console.log("No frameworks found matching criteria.");
    process.exit(1);
  }

  // Load test definitions
  let testDefinitions = getAllTests();
  if (options.test) {
    testDefinitions = testDefinitions.filter((t) => t.name === options.test);
  }

  if (testDefinitions.length === 0) {
    console.log("No tests found matching criteria.");
    process.exit(1);
  }

  // Set local Sentry SDK paths if provided
  if (options.sentryPythonPath) {
    process.env.SENTRY_PYTHON_PATH = options.sentryPythonPath;
    console.log(`Using local Sentry Python SDK: ${options.sentryPythonPath}\n`);
  }
  if (options.sentryJavaScriptPath) {
    process.env.SENTRY_JAVASCRIPT_PATH = options.sentryJavaScriptPath;
    console.log(
      `Using local Sentry JavaScript SDK: ${options.sentryJavaScriptPath}\n`,
    );
  }

  // Convert discovered frameworks to test matrix
  const frameworks: FrameworkConfig[] = discoveredFrameworks.map((df) => {
    // Determine Sentry version based on platform and local SDK paths
    let sentryVersion = df.sentryVersions[0];
    if (df.platform === "py" && options.sentryPythonPath) {
      sentryVersion = "local";
    } else if (df.platform === "node" && options.sentryJavaScriptPath) {
      sentryVersion = "local";
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
      executionMode: df.executionMode,
      streamingMode: df.streamingMode,
      modelOverrides: df.modelOverrides,
      skip: df.skip,
    };
  });

  if (options.verbose) {
    console.log(
      `Setting up ${frameworks.length} framework(s) with ${testDefinitions.length} test(s)\n`,
    );
  }

  // Setup tests (environment + template rendering, no execution)
  await orchestrator.setupTests(frameworks, testDefinitions);
  process.exit(0);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
