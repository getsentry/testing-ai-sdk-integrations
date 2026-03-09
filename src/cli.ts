#!/usr/bin/env node
/**
 * CLI entry point
 */

import "dotenv/config";
import { parseArgs } from "node:util";
import { Orchestrator } from "./orchestrator.js";
import { FrameworkConfig } from "./types.js";
import {
  discoverFrameworks,
  listFrameworks,
} from "./runner/framework-discovery.js";
import { getAllTests } from "./test-cases/index.js";
import { resolvePlatformFilter } from "./platform-utils.js";

const HELP_TEXT = `
Sentry AI SDK Integration Tests

Usage:
  npm run test [command] [options]

Commands:
  run             Run tests (default)
  setup           Setup environments and render templates (no test execution)
  list            List discovered frameworks

Options:
  --framework <name>         Filter by framework name
  --test <name>              Filter by test name
  --type <type>              Filter by framework type (llm, agents, embeddings)
  --platform <node|python|browser|php|cloudflare|js>  Filter by platform (js = node + browser + cloudflare)
  --sync                     Run only sync tests (default: both)
  --async                    Run only async tests (default: both)
  --streaming                Run only streaming tests (default: both)
  --blocking                 Run only blocking (non-streaming) tests (default: both)
  --parallel, -j <N>         Run up to N tests in parallel (default: 1)
  --verbose, -v              Show detailed output (test execution logs, etc.)
  --live-status              Enable live status display (real-time tree view)
  --open                     Open HTML report in browser after test run
  --sentry-python <path>     Use local Sentry Python SDK (editable install)
  --sentry-javascript <path> Use local Sentry JavaScript SDK (link)
  --sentry-php <path>        Use local Sentry PHP SDK (core sentry/sentry-php)
  --sentry-laravel <path>    Use local Sentry Laravel SDK (composer path repository)
  --help, -h                 Show this help message

Examples:
  npm run test list
  npm run test run
  npm run test -- --framework openai
  npm run test -- --platform python --test "Basic LLM"
  npm run test -- --platform python --sync
  npm run test -- --platform python --async --verbose
  npm run test -- --platform browser --framework openai
  npm run test -- --platform php                         # PHP platform (Laravel)
  npm run test -- --platform js                         # all JS platforms (node + browser)
  npm run test -- --framework openai --live-status
  npm run test -- --framework openai -j=4
  npm run test -- --framework openai --open
  npm run test -- --framework openai --sentry-python ~/sentry-python
  npm run test -- --framework laravel --sentry-laravel ~/sentry-laravel
  npm run test setup -- --framework openai --sync --streaming
`;

function parseCliArgs() {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    options: {
      framework: { type: "string" },
      test: { type: "string" },
      type: { type: "string" },
      platform: { type: "string" },
      sync: { type: "boolean", default: false },
      async: { type: "boolean", default: false },
      streaming: { type: "boolean", default: false },
      blocking: { type: "boolean", default: false },
      parallel: { type: "string", short: "j" },
      verbose: { type: "boolean", short: "v", default: false },
      "live-status": { type: "boolean", default: false },
      open: { type: "boolean", default: false },
      "sentry-python": { type: "string" },
      "sentry-javascript": { type: "string" },
      "sentry-php": { type: "string" },
      "sentry-laravel": { type: "string" },
      help: { type: "boolean", short: "h", default: false },
    },
    allowPositionals: true,
  });

  // Determine command from positionals
  let command: "run" | "list" | "setup" = "run";
  if (positionals.includes("list")) {
    command = "list";
  } else if (positionals.includes("setup")) {
    command = "setup";
  } else if (positionals.includes("run")) {
    command = "run";
  }

  // Parse parallel value
  // Note: parseArgs returns "=2" for "-j=2" (short option with =), so we strip the leading =
  let parallel: number | undefined;
  if (values.parallel) {
    const parallelStr = values.parallel.replace(/^=/, "");
    const parsed = parseInt(parallelStr, 10);
    if (isNaN(parsed) || parsed < 1) {
      console.error("Error: --parallel must be a positive integer");
      process.exit(1);
    }
    parallel = parsed;
  }

  // Validate and resolve type
  const typeArg = values.type;
  const typeMap: Record<string, "llm-only" | "agentic" | "embeddings"> = {
    "llm": "llm-only",
    "agents": "agentic",
    "embeddings": "embeddings",
  };
  if (typeArg && !(typeArg in typeMap)) {
    console.error(
      `Error: --type must be one of: ${Object.keys(typeMap).join(", ")}`,
    );
    process.exit(1);
  }
  const resolvedType = typeArg ? typeMap[typeArg] : undefined;

  // Validate platform
  const platformArg = values.platform;
  const validPlatforms = ["node", "python", "browser", "js", "nextjs", "php", "cloudflare"];
  if (platformArg && !validPlatforms.includes(platformArg)) {
    console.error(
      `Error: --platform must be one of: ${validPlatforms.join(", ")}`,
    );
    process.exit(1);
  }

  return {
    command,
    framework: values.framework,
    test: values.test,
    type: resolvedType,
    platform: platformArg,
    sync: values.sync,
    async: values.async,
    streaming: values.streaming,
    blocking: values.blocking,
    parallel,
    verbose: values.verbose,
    liveStatus: values["live-status"],
    open: values.open,
    sentryPythonPath: values["sentry-python"],
    sentryJavaScriptPath: values["sentry-javascript"],
    sentryPhpPath: values["sentry-php"],
    sentryLaravelPath: values["sentry-laravel"],
    help: values.help,
  };
}

async function main() {
  const options = parseCliArgs();

  if (options.help) {
    console.log(HELP_TEXT);
    process.exit(0);
  }

  console.log("Sentry AI SDK Integration Tests\n");

  // Handle list command
  if (options.command === "list") {
    listFrameworks();
    return;
  }

  // Setup command doesn't need span collector or live status
  const isSetupOnly = options.command === "setup";

  const orchestrator = new Orchestrator({
    liveStatus: options.liveStatus,
    verbose: options.verbose,
    sync: options.sync,
    async: options.async,
    streaming: options.streaming,
    blocking: options.blocking,
    parallel: options.parallel,
    openReport: options.open,
  });

  try {
    // Start orchestrator (skip span collector for setup-only mode)
    if (!isSetupOnly) {
      await orchestrator.start();
    }

    // Discover frameworks
    let discoveredFrameworks = discoverFrameworks();

    // Apply filters
    if (options.platform) {
      const platforms = resolvePlatformFilter(options.platform);
      discoveredFrameworks = discoveredFrameworks.filter((f) =>
        platforms.includes(f.platform),
      );
    }
    if (options.type) {
      discoveredFrameworks = discoveredFrameworks.filter(
        (f) => f.type === options.type,
      );
    }
    if (options.framework) {
      discoveredFrameworks = discoveredFrameworks.filter(
        (f) => f.name === options.framework,
      );
    }

    if (discoveredFrameworks.length === 0) {
      console.log("No frameworks found matching criteria.");
      await orchestrator.stop();
      return;
    }

    // Load test definitions
    let testDefinitions = getAllTests();
    if (options.test) {
      testDefinitions = testDefinitions.filter((t) => t.name === options.test);
    }

    if (testDefinitions.length === 0) {
      console.log("No tests found matching criteria.");
      await orchestrator.stop();
      return;
    }

    // Set local Sentry SDK paths if provided
    if (options.sentryPythonPath) {
      process.env.SENTRY_PYTHON_PATH = options.sentryPythonPath;
      console.log(
        `Using local Sentry Python SDK: ${options.sentryPythonPath}\n`,
      );
    }
    if (options.sentryJavaScriptPath) {
      process.env.SENTRY_JAVASCRIPT_PATH = options.sentryJavaScriptPath;
      console.log(
        `Using local Sentry JavaScript SDK: ${options.sentryJavaScriptPath}\n`,
      );
    }
    if (options.sentryPhpPath) {
      process.env.SENTRY_PHP_PATH = options.sentryPhpPath;
      console.log(`Using local Sentry PHP SDK: ${options.sentryPhpPath}\n`);
    }
    if (options.sentryLaravelPath) {
      process.env.SENTRY_LARAVEL_PATH = options.sentryLaravelPath;
      console.log(
        `Using local Sentry Laravel SDK: ${options.sentryLaravelPath}\n`,
      );
    }

    // Convert discovered frameworks to test matrix
    const frameworks: FrameworkConfig[] = discoveredFrameworks
      .filter((df) => {
        // Filter out frameworks with missing required arrays
        if (!df.versions || df.versions.length === 0) {
          console.warn(
            `Warning: Framework '${df.name}' has no versions defined, skipping`,
          );
          return false;
        }
        if (!df.sentryVersions || df.sentryVersions.length === 0) {
          console.warn(
            `Warning: Framework '${df.name}' has no sentryVersions defined, skipping`,
          );
          return false;
        }
        return true;
      })
      .map((df) => {
        // Determine Sentry version based on platform and local SDK paths
        let sentryVersion = df.sentryVersions[0];
        if (df.platform === "python" && options.sentryPythonPath) {
          sentryVersion = "local";
        } else if (
          (df.platform === "node" ||
            df.platform === "browser" ||
            df.platform === "nextjs" ||
            df.platform === "cloudflare") &&
          options.sentryJavaScriptPath
        ) {
          sentryVersion = "local";
        } else if (df.platform === "php" && options.sentryLaravelPath) {
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
          toolNameMapping: df.toolNameMapping,
          minimumPlatformVersion: df.minimumPlatformVersion,
          skip: df.skip,
        };
      });

    if (options.verbose) {
      console.log(
        `Testing ${frameworks.length} framework(s) with ${testDefinitions.length} test(s)\n`,
      );
    }

    if (isSetupOnly) {
      // Setup only - no test execution
      await orchestrator.setupTests(frameworks, testDefinitions);
      process.exit(0);
    } else {
      // Run tests
      const report = await orchestrator.runTests(frameworks, testDefinitions);

      // Print report
      orchestrator.printReport(report);

      // Exit with appropriate code
      const exitCode =
        report.failed > 0 || report.errors > 0 || report.timeouts > 0 ? 1 : 0;
      await orchestrator.stop();
      process.exit(exitCode);
    }
  } catch (error) {
    console.error("Fatal error:", error);
    await orchestrator.stop();
    process.exit(1);
  }
}

main();
