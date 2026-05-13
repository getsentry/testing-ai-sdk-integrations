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
  --framework <name>         Filter by framework name (repeatable, OR-combined)
  --test <name>              Filter by test name (repeatable, OR-combined)
  --type <type>              Filter by framework type (llm, agents, embeddings, mcp) (repeatable, OR-combined)
  --platform <node|python|browser|php|cloudflare|js>  Filter by platform (js = node + browser + cloudflare + nextjs) (repeatable, OR-combined)
  --sync                     Run only sync tests (default: both)
  --async                    Run only async tests (default: both)
  --streaming                Run only streaming tests (default: both)
  --blocking                 Run only blocking (non-streaming) tests (default: both)
  --parallel, -j <N>         Run up to N tests in parallel (default: 1)
  --verbose, -v              Show detailed output (test execution logs, etc.)
  --live-status              Enable live status display (real-time tree view)
  --option <key=value>       Filter by framework option (repeatable, e.g., --option apiStyle=highlevel)
  --open                     Open HTML report in browser after test run
  --sentry-python <path>     Use local Sentry Python SDK (editable install)
  --sentry-javascript <path> Use local Sentry JavaScript SDK (link)
  --sentry-php <path>        Use local Sentry PHP SDK (core sentry/sentry-php)
  --sentry-laravel <path>    Use local Sentry Laravel SDK (composer path repository)
  --stream-gen-ai-spans      Enable streamGenAiSpans in JS Sentry.init() (default: on)
  --not-stream-genai-spans   Disable streamGenAiSpans in JS Sentry.init()
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
  npm run test -- --platform js                         # all JS platforms (node + browser + cloudflare + nextjs)
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
      framework: { type: "string", multiple: true },
      test: { type: "string", multiple: true },
      type: { type: "string", multiple: true },
      platform: { type: "string", multiple: true },
      sync: { type: "boolean", default: false },
      async: { type: "boolean", default: false },
      streaming: { type: "boolean", default: false },
      blocking: { type: "boolean", default: false },
      parallel: { type: "string", short: "j" },
      verbose: { type: "boolean", short: "v", default: false },
      "live-status": { type: "boolean", default: false },
      open: { type: "boolean", default: false },
      option: { type: "string", multiple: true },
      "sentry-python": { type: "string" },
      "sentry-javascript": { type: "string" },
      "sentry-php": { type: "string" },
      "sentry-laravel": { type: "string" },
      "stream-gen-ai-spans": { type: "boolean", default: false },
      "not-stream-genai-spans": { type: "boolean", default: false },
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

  // Validate and resolve type(s)
  const typeArgs = values.type;
  const typeMap: Record<string, "llm-only" | "agentic" | "embeddings" | "mcp-server"> = {
    "llm": "llm-only",
    "agents": "agentic",
    "embeddings": "embeddings",
    "mcp": "mcp-server",
  };
  const resolvedTypes: Array<"llm-only" | "agentic" | "embeddings" | "mcp-server"> = [];
  if (typeArgs) {
    for (const t of typeArgs) {
      if (!(t in typeMap)) {
        console.error(
          `Error: --type must be one of: ${Object.keys(typeMap).join(", ")}`,
        );
        process.exit(1);
      }
      resolvedTypes.push(typeMap[t]);
    }
  }

  // Validate platform(s)
  const platformArgs = values.platform;
  const validPlatforms = ["node", "python", "browser", "js", "nextjs", "php", "cloudflare"];
  if (platformArgs) {
    for (const p of platformArgs) {
      if (!validPlatforms.includes(p)) {
        console.error(
          `Error: --platform must be one of: ${validPlatforms.join(", ")}`,
        );
        process.exit(1);
      }
    }
  }

  // Parse --option key=value filters
  const optionFilters: Record<string, string> = {};
  if (values.option) {
    for (const opt of values.option) {
      const eqIdx = opt.indexOf("=");
      if (eqIdx <= 0) {
        console.error(
          `Error: --option must be in key=value format, got: ${opt}`,
        );
        process.exit(1);
      }
      optionFilters[opt.substring(0, eqIdx)] = opt.substring(eqIdx + 1);
    }
  }

  return {
    command,
    frameworks: values.framework,
    tests: values.test,
    types: resolvedTypes.length > 0 ? resolvedTypes : undefined,
    platforms: platformArgs,
    sync: values.sync,
    async: values.async,
    streaming: values.streaming,
    blocking: values.blocking,
    parallel,
    verbose: values.verbose,
    liveStatus: values["live-status"],
    open: values.open,
    optionFilters,
    sentryPythonPath: values["sentry-python"],
    sentryJavaScriptPath: values["sentry-javascript"],
    sentryPhpPath: values["sentry-php"],
    sentryLaravelPath: values["sentry-laravel"],
    // Default ON. --not-stream-genai-spans wins over --stream-gen-ai-spans if both given.
    streamGenAiSpans: values["not-stream-genai-spans"] ? false : true,
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
    optionFilters: options.optionFilters,
    streamGenAiSpans: options.streamGenAiSpans,
  });

  try {
    // Start orchestrator (skip span collector for setup-only mode)
    if (!isSetupOnly) {
      await orchestrator.start();
    }

    // Discover frameworks
    let discoveredFrameworks = discoverFrameworks();

    // Apply filters (multiple values for the same flag are OR-combined)
    if (options.platforms) {
      const allPlatforms = options.platforms.flatMap((p) => resolvePlatformFilter(p));
      discoveredFrameworks = discoveredFrameworks.filter((f) =>
        allPlatforms.includes(f.platform),
      );
    }
    if (options.types) {
      discoveredFrameworks = discoveredFrameworks.filter(
        (f) => options.types!.includes(f.type),
      );
    }
    if (options.frameworks) {
      discoveredFrameworks = discoveredFrameworks.filter(
        (f) => options.frameworks!.includes(f.name),
      );
    }

    if (discoveredFrameworks.length === 0) {
      console.log("No frameworks found matching criteria.");
      await orchestrator.stop();
      return;
    }

    // Load test definitions
    let testDefinitions = getAllTests();
    if (options.tests) {
      testDefinitions = testDefinitions.filter((t) => options.tests!.includes(t.name));
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
          transportMode: df.transportMode,
          options: df.options,
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
