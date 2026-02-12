/**
 * Main orchestrator - coordinates test execution
 */

import * as fs from "fs/promises";
import * as path from "path";
import { exec } from "child_process";
import { SpanCollector } from "./span-collector/server.js";
import { Runner } from "./runner/runner.js";
import { Validator, ValidationError } from "./validator.js";
import {
  generateCTRFReport,
  writeCTRFReport,
  getTimestamp,
} from "./reporters/ctrf-reporter.js";
import { generateHTML, writeHTMLReport } from "./reporters/html-generator.js";
import { LiveStatusReporter } from "./reporters/live-status.js";
import { PoolExecutionStrategy, ExecutionStrategy } from "./concurrency.js";
import {
  getPlatformIcon,
  getPlatformDisplayName,
  needsAsyncFlag,
  supportsExecutionModes,
  buildModeParts,
} from "./platform-utils.js";
import {
  TestDefinition,
  FrameworkConfig,
  TestRun,
  TestReport,
  CapturedSpan,
} from "./types.js";

export class Orchestrator {
  private spanCollector: SpanCollector;
  private runner: Runner;
  private validator: Validator;
  private liveStatus: LiveStatusReporter;
  private testRuns: TestRun[] = [];
  private useLiveStatus: boolean = false;
  private verbose: boolean = false;
  private parallelism: number = 1;
  private executionStrategy: ExecutionStrategy<TestRun, void>;
  private openReport: boolean = false;

  private syncFilter?: boolean;
  private asyncFilter?: boolean;
  private streamingFilter?: boolean;
  private blockingFilter?: boolean;

  constructor(
    options: {
      liveStatus?: boolean;
      verbose?: boolean;
      sync?: boolean;
      async?: boolean;
      streaming?: boolean;
      blocking?: boolean;
      parallel?: number;
      openReport?: boolean;
    } = {},
  ) {
    this.spanCollector = new SpanCollector();
    this.runner = new Runner();
    this.validator = new Validator();
    this.liveStatus = new LiveStatusReporter();
    this.useLiveStatus = options.liveStatus === true; // Default to false (opt-in)
    this.verbose = options.verbose === true; // Default to false
    this.parallelism = options.parallel ?? 1;
    this.executionStrategy = new PoolExecutionStrategy<TestRun, void>(
      this.parallelism,
    );
    this.syncFilter = options.sync;
    this.asyncFilter = options.async;
    this.streamingFilter = options.streaming;
    this.blockingFilter = options.blocking;
    this.openReport = options.openReport === true;

    // Set verbose on validator
    this.validator.setVerbose(this.verbose);
  }

  /**
   * Start the orchestrator
   */
  async start(): Promise<void> {
    await this.spanCollector.start();
    if (this.verbose) {
      console.log(
        `Span collector started on port ${this.spanCollector.getPort()}`,
      );
    }
  }

  /**
   * Stop the orchestrator
   */
  async stop(): Promise<void> {
    await this.spanCollector.stop();
  }

  /**
   * Run tests for given frameworks and test definitions
   */
  async runTests(
    frameworks: FrameworkConfig[],
    testDefinitions: TestDefinition[],
  ): Promise<TestReport> {
    const startTime = Date.now();

    // Generate and filter test matrix
    let testMatrix = this.generateTestMatrix(frameworks, testDefinitions);
    testMatrix = this.applyFilters(testMatrix);

    // Print test tree
    this.printTestTree(testMatrix);

    // Phase 1: Setup environments and render all templates first
    console.log("Setting up environments and rendering templates...\n");
    const renderedTests = await this.setupAndRenderAll(testMatrix);

    // Print rendered files summary
    this.printRenderedFiles(renderedTests);

    if (this.useLiveStatus) {
      // Register all tests with live status
      for (const testRun of testMatrix) {
        this.liveStatus.registerTest(testRun);
      }

      // Start live status display
      this.liveStatus.start();
    }

    // Phase 2: Execute all tests (skip those that failed setup)
    // Filter out tests that failed setup
    const testsToRun = testMatrix.filter((testRun) => {
      if (testRun.status === "error") {
        if (this.verbose && !this.useLiveStatus) {
          console.log(
            `\n[${testRun.framework.name}] Skipping: ${testRun.testDefinition.name} (setup failed)`,
          );
        } else if (!this.useLiveStatus) {
          // Pytest-style progress: E for error
          process.stdout.write("\x1b[33mE\x1b[0m");
        }
        return false;
      }
      return true;
    });

    console.log(
      `Executing ${testsToRun.length} test(s) with ${this.parallelism} worker(s)...\n`,
    );

    // Execute tests using the execution strategy (parallel or sequential)
    await this.executionStrategy.execute(testsToRun, (testRun) =>
      this.executeTest(testRun),
    );

    // Stop live status display
    if (this.useLiveStatus) {
      this.liveStatus.stop();
    }

    // End progress line in non-verbose mode
    if (!this.verbose && !this.useLiveStatus) {
      console.log(""); // New line after progress dots
    }

    // Generate report
    const endTime = Date.now();
    const report = this.generateReport(startTime, endTime);

    // Generate and write reports (CTRF + HTML)
    const htmlPath = await this.writeReports(report);

    // Open report in browser if requested
    if (this.openReport && htmlPath) {
      this.openInBrowser(htmlPath);
    }

    return report;
  }

  /**
   * Setup environments and render templates for all tests
   * Returns map of test run ID to rendered file path
   * Also tracks which frameworks failed setup so their tests can be marked as errors
   */
  private async setupAndRenderAll(
    testMatrix: TestRun[],
  ): Promise<Map<string, string>> {
    const renderedTests = new Map<string, string>();

    // Group tests by framework to avoid redundant environment setup
    const testsByFramework = new Map<string, TestRun[]>();
    for (const testRun of testMatrix) {
      const key = `${testRun.framework.platform}/${testRun.framework.name}`;
      if (!testsByFramework.has(key)) {
        testsByFramework.set(key, []);
      }
      testsByFramework.get(key)!.push(testRun);
    }

    // Setup each framework's environment once, then render all its templates
    for (const [frameworkKey, runs] of testsByFramework) {
      const firstRun = runs[0];
      const workDir = this.runner.getWorkDir(firstRun.framework);

      // Setup environment once per framework
      if (this.verbose) {
        console.log(`[${frameworkKey}] Setting up environment...`);
      }

      const isAsync =
        firstRun.framework.platform === "py" &&
        firstRun.framework.executionMode === "async";
      const isStreaming = firstRun.framework.streamingMode === "streaming";

      try {
        await this.runner.setupEnvironmentOnly({
          runId: firstRun.id,
          framework: firstRun.framework,
          testDefinition: firstRun.testDefinition,
          sentryDsn: "https://dummy@sentry.io/123", // Dummy DSN for setup
          workDir,
          isAsync,
          isStreaming,
          verbose: this.verbose,
        });
      } catch (setupError) {
        // Mark all tests for this framework as errors
        const errorMessage =
          setupError instanceof Error ? setupError.message : String(setupError);
        console.error(`[${frameworkKey}] Setup failed: ${errorMessage}`);

        for (const testRun of runs) {
          testRun.status = "error";
          testRun.error = `Environment setup failed: ${errorMessage}`;
          testRun.startTime = Date.now();
          testRun.endTime = Date.now();
          this.testRuns.push(testRun);
        }

        // Skip to the next framework
        continue;
      }

      // Render all templates for this framework
      const renderedHtmlFiles: string[] = [];
      for (const testRun of runs) {
        const displayName = this.buildDisplayName(testRun);
        if (this.verbose) {
          console.log(`[${frameworkKey}] Rendering: ${displayName}`);
        }

        const testIsAsync =
          testRun.framework.platform === "py" &&
          testRun.framework.executionMode === "async";
        const testIsStreaming = testRun.framework.streamingMode === "streaming";

        try {
          const testPath = await this.runner.renderTemplateOnly({
            runId: testRun.id,
            framework: testRun.framework,
            testDefinition: testRun.testDefinition,
            sentryDsn: "https://dummy@sentry.io/123", // Will be replaced during execution
            workDir,
            isAsync: testIsAsync,
            isStreaming: testIsStreaming,
            verbose: false, // Suppress template rendering logs, we're logging above
          });

          renderedTests.set(testRun.id, testPath);

          // Track HTML files for browser bundling
          if (firstRun.framework.platform === "browser") {
            renderedHtmlFiles.push(path.basename(testPath));
          }
        } catch (renderError) {
          // Mark this specific test as an error
          const errorMessage =
            renderError instanceof Error
              ? renderError.message
              : String(renderError);
          console.error(
            `[${frameworkKey}] Template rendering failed for ${displayName}: ${errorMessage}`,
          );

          testRun.status = "error";
          testRun.error = `Template rendering failed: ${errorMessage}`;
          testRun.startTime = Date.now();
          testRun.endTime = Date.now();
          this.testRuns.push(testRun);
        }
      }

      // Bundle all browser test files with a single Vite build
      if (
        firstRun.framework.platform === "browser" &&
        renderedHtmlFiles.length > 0
      ) {
        try {
          await this.runner.bundleBrowserTests(
            workDir,
            renderedHtmlFiles,
            this.verbose,
          );
        } catch (bundleError) {
          const errorMessage =
            bundleError instanceof Error
              ? bundleError.message
              : String(bundleError);
          console.error(
            `[${frameworkKey}] Vite bundling failed: ${errorMessage}`,
          );

          // Mark all successfully rendered tests for this framework as errors
          for (const testRun of runs) {
            if (testRun.status !== "error") {
              testRun.status = "error";
              testRun.error = `Vite bundling failed: ${errorMessage}`;
              testRun.startTime = Date.now();
              testRun.endTime = Date.now();
              this.testRuns.push(testRun);
            }
          }
        }
      }
    }

    return renderedTests;
  }

  /**
   * Print summary of rendered test files
   */
  private printRenderedFiles(renderedTests: Map<string, string>): void {
    const colors = {
      reset: "\x1b[0m",
      dim: "\x1b[2m",
      green: "\x1b[32m",
      cyan: "\x1b[36m",
    };

    console.log(
      `${colors.green}✓${colors.reset} Rendered ${renderedTests.size} test file(s)\n`,
    );

    if (this.verbose) {
      // Group by directory for cleaner output
      const byDir = new Map<string, string[]>();
      for (const [_, filePath] of renderedTests) {
        const dir = path.dirname(filePath);
        const file = path.basename(filePath);
        if (!byDir.has(dir)) {
          byDir.set(dir, []);
        }
        byDir.get(dir)!.push(file);
      }

      for (const [dir, files] of byDir) {
        console.log(`${colors.dim}${dir}/${colors.reset}`);
        for (const file of files) {
          console.log(`  ${colors.cyan}${file}${colors.reset}`);
        }
      }
      console.log("");
    }
  }

  /**
   * Setup test environments and render templates without executing tests
   */
  async setupTests(
    frameworks: FrameworkConfig[],
    testDefinitions: TestDefinition[],
  ): Promise<void> {
    // Generate and filter test matrix (same as runTests)
    let testMatrix = this.generateTestMatrix(frameworks, testDefinitions);
    testMatrix = this.applyFilters(testMatrix);

    // Print test tree
    this.printTestTree(testMatrix);

    console.log("Setting up test environments...\n");

    // Setup each test (environment + template rendering only)
    // Track rendered browser HTML files per workDir for bundling
    const browserFilesByWorkDir = new Map<string, string[]>();
    for (const testRun of testMatrix) {
      await this.setupTest(testRun);

      // Track browser HTML files for post-render Vite bundling
      if (testRun.framework.platform === "browser") {
        const workDir = this.runner.getWorkDir(testRun.framework);
        if (!browserFilesByWorkDir.has(workDir)) {
          browserFilesByWorkDir.set(workDir, []);
        }
        const testCaseId = testRun.testDefinition.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "");
        const modeParts: string[] = [];
        if (testRun.framework.streamingMode) {
          modeParts.push(
            testRun.framework.streamingMode === "streaming"
              ? "streaming"
              : "blocking",
          );
        }
        const modeSuffix =
          modeParts.length > 0 ? `-${modeParts.join("-")}` : "";
        browserFilesByWorkDir
          .get(workDir)!
          .push(`test-${testCaseId}${modeSuffix}.html`);
      }
    }

    // Bundle browser tests per workDir
    for (const [workDir, htmlFiles] of browserFilesByWorkDir) {
      try {
        console.log(`\nBundling ${htmlFiles.length} browser test file(s)...`);
        await this.runner.bundleBrowserTests(workDir, htmlFiles, this.verbose);
        console.log(`  ✓ Browser bundling complete`);
      } catch (error) {
        console.error(
          `  ✗ Browser bundling failed:`,
          error instanceof Error ? error.message : error,
        );
      }
    }

    console.log(`\n✓ Setup complete. ${testMatrix.length} test(s) prepared.`);

    // Print unique work directories
    const uniqueWorkDirs = new Map<string, string>();
    for (const testRun of testMatrix) {
      const workDir = this.runner.getWorkDir(testRun.framework);
      const key = `${testRun.framework.name}-${workDir}`;
      if (!uniqueWorkDirs.has(key)) {
        uniqueWorkDirs.set(key, workDir);
      }
    }

    console.log("\nWork directories:");
    for (const [_, workDir] of uniqueWorkDirs) {
      console.log(`  ${workDir}`);
    }
  }

  /**
   * Setup a single test (environment + template) without executing
   */
  private async setupTest(testRun: TestRun): Promise<void> {
    const displayName = this.buildDisplayName(testRun);
    console.log(`[${testRun.framework.name}] Setting up: ${displayName}`);

    try {
      // Determine isAsync and isStreaming flags
      const isAsync =
        testRun.framework.platform === "py" &&
        testRun.framework.executionMode === "async";
      const isStreaming = testRun.framework.streamingMode === "streaming";

      // Setup environment and render template via runner (but don't execute)
      await this.runner.setupOnly({
        runId: testRun.id,
        framework: testRun.framework,
        testDefinition: testRun.testDefinition,
        sentryDsn: "https://dummy@sentry.io/123", // Dummy DSN for setup
        workDir: this.runner.getWorkDir(testRun.framework),
        isAsync,
        isStreaming,
        verbose: this.verbose,
      });

      console.log(`  ✓ Setup complete`);
    } catch (error) {
      console.error(
        `  ✗ Setup failed:`,
        error instanceof Error ? error.message : error,
      );
    }
  }

  /**
   * Apply sync/async and streaming/blocking filters to test matrix
   */
  private applyFilters(testMatrix: TestRun[]): TestRun[] {
    // Filter by sync/async if specified
    if (this.syncFilter && !this.asyncFilter) {
      testMatrix = testMatrix.filter((run) => {
        if (run.framework.platform === "node" || run.framework.platform === "nextjs" || run.framework.platform === "browser") return false;
        return run.framework.executionMode === "sync";
      });
    } else if (this.asyncFilter && !this.syncFilter) {
      testMatrix = testMatrix.filter((run) => {
        if (run.framework.platform === "node" || run.framework.platform === "nextjs" || run.framework.platform === "browser") return false;
        return run.framework.executionMode === "async";
      });
    }

    // Filter by streaming/blocking if specified
    if (this.streamingFilter && !this.blockingFilter) {
      testMatrix = testMatrix.filter(
        (run) => run.framework.streamingMode === "streaming",
      );
    } else if (this.blockingFilter && !this.streamingFilter) {
      testMatrix = testMatrix.filter(
        (run) => run.framework.streamingMode === "blocking",
      );
    }

    return testMatrix;
  }

  /**
   * Write CTRF and HTML reports to files
   * Returns the path to the HTML report if successful
   */
  async writeReports(report: TestReport): Promise<string | undefined> {
    const timestamp = getTimestamp();
    const outputDir = "./test-results";

    // Write CTRF report
    try {
      const ctrfReport = generateCTRFReport(report);
      const ctrfPath = await writeCTRFReport(ctrfReport, outputDir, timestamp);
      if (this.verbose) {
        console.log(`\n✓ CTRF report written to: ${ctrfPath}`);
      }

      // Write HTML report
      const htmlContent = generateHTML(ctrfReport);
      const htmlPath = await writeHTMLReport(htmlContent, outputDir, timestamp);
      if (this.verbose) {
        console.log(`✓ HTML report written to: ${htmlPath}`);
      }

      return htmlPath;
    } catch (error) {
      if (this.verbose) {
        console.error("Failed to write reports:", error);
      }
      return undefined;
    }
  }

  /**
   * Open a file in the default browser
   */
  private openInBrowser(filePath: string): void {
    const absolutePath = path.resolve(filePath);
    const url = `file://${absolutePath}`;

    // Use platform-specific command to open browser
    const platform = process.platform;
    let command: string;

    if (platform === "darwin") {
      command = `open "${url}"`;
    } else if (platform === "win32") {
      command = `start "" "${url}"`;
    } else {
      // Linux and others
      command = `xdg-open "${url}"`;
    }

    exec(command, (error) => {
      if (error && this.verbose) {
        console.error(`Failed to open browser: ${error.message}`);
      }
    });
  }

  /**
   * Generate test matrix (framework × test definition combinations)
   */
  private generateTestMatrix(
    frameworks: FrameworkConfig[],
    testDefinitions: TestDefinition[],
  ): TestRun[] {
    const matrix: TestRun[] = [];

    for (const framework of frameworks) {
      for (const testDefinition of testDefinitions) {
        // Check if test is explicitly skipped for this framework
        if (framework.skip?.tests?.includes(testDefinition.name)) {
          if (this.verbose) {
            console.log(
              `⊘ Skipping ${testDefinition.name} on ${framework.name} (explicitly skipped in config)`,
            );
          }
          continue;
        }

        // Skip incompatible combinations based on test type
        const isCompatible = this.isCompatible(framework, testDefinition);

        if (!isCompatible.compatible) {
          if (this.verbose) {
            console.log(
              `⊘ Skipping ${testDefinition.name} on ${framework.name} (${isCompatible.reason})`,
            );
          }
          continue;
        }

        // Generate test runs for all combinations of execution mode and streaming mode
        const executionModes = this.getExecutionModes(framework);
        const streamingModes = this.getStreamingModes(framework);

        for (const execMode of executionModes) {
          for (const streamMode of streamingModes) {
            const runId = this.generateRunId();
            matrix.push({
              id: runId,
              index: matrix.length, // Track original order for consistent reporting
              framework: {
                ...framework,
                executionMode: execMode,
                streamingMode: streamMode,
              },
              testDefinition,
              status: "pending",
            });
          }
        }
      }
    }

    return matrix;
  }

  /**
   * Print a tree view of tests to be run
   */
  private printTestTree(testMatrix: TestRun[]): void {
    const colors = {
      reset: "\x1b[0m",
      bright: "\x1b[1m",
      dim: "\x1b[2m",
      cyan: "\x1b[36m",
      gray: "\x1b[90m",
      yellow: "\x1b[33m",
    };

    // Group by platform -> framework -> tests
    const tree = new Map<string, Map<string, TestRun[]>>();

    for (const run of testMatrix) {
      const platform = run.framework.platform;
      const framework = run.framework.name;

      if (!tree.has(platform)) {
        tree.set(platform, new Map());
      }
      const platformMap = tree.get(platform)!;

      if (!platformMap.has(framework)) {
        platformMap.set(framework, []);
      }
      platformMap.get(framework)!.push(run);
    }

    console.log(`\n${colors.cyan}${colors.bright}Tests to run:${colors.reset}`);

    for (const [platform, frameworks] of tree) {
      const platformIcon = getPlatformIcon(
        platform as "node" | "py" | "browser",
      );
      console.log(
        `${platformIcon} ${colors.bright}${platform.toUpperCase()}${colors.reset}`,
      );

      const frameworkEntries = Array.from(frameworks.entries());
      for (let fi = 0; fi < frameworkEntries.length; fi++) {
        const [framework, runs] = frameworkEntries[fi];
        const isLastFramework = fi === frameworkEntries.length - 1;
        const frameworkPrefix = isLastFramework ? "└─" : "├─";

        console.log(
          `   ${frameworkPrefix} ${colors.bright}${framework}${colors.reset}`,
        );

        for (let ri = 0; ri < runs.length; ri++) {
          const run = runs[ri];
          const isLast = ri === runs.length - 1;
          const testPrefix = isLastFramework ? "      " : "   │  ";
          const testBranch = isLast ? "└─" : "├─";

          // Build mode string with execution mode and streaming mode
          const modeParts: string[] = [];
          if (run.framework.executionMode) {
            modeParts.push(run.framework.executionMode);
          }
          if (run.framework.streamingMode) {
            modeParts.push(run.framework.streamingMode);
          }
          const mode =
            modeParts.length > 0
              ? ` ${colors.dim}(${modeParts.join(", ")})${colors.reset}`
              : "";

          console.log(
            `${testPrefix}${testBranch} ${run.testDefinition.name}${mode}`,
          );
        }
      }
    }

    console.log(
      `\n${colors.dim}Total: ${testMatrix.length} test(s)${colors.reset}\n`,
    );
  }

  /**
   * Check if a test is compatible with a framework
   */
  private isCompatible(
    framework: FrameworkConfig,
    test: TestDefinition,
  ): { compatible: boolean; reason?: string } {
    // LLM tests can only run on llm-only frameworks
    if (test.type === "llm" && framework.type !== "llm-only") {
      return {
        compatible: false,
        reason: "LLM test requires llm-only framework",
      };
    }

    // Agent tests can only run on agentic frameworks
    if (test.type === "agent" && framework.type !== "agentic") {
      return {
        compatible: false,
        reason: "Agent test requires agentic framework",
      };
    }

    return { compatible: true };
  }

  /**
   * Get execution modes to test for a framework
   */
  private getExecutionModes(
    framework: FrameworkConfig,
  ): Array<"sync" | "async" | undefined> {
    // JavaScript platforms (Node.js, Next.js, Browser) don't have sync/async distinction at the framework level
    if (framework.platform === "node" || framework.platform === "nextjs" || framework.platform === "browser") {
      return [undefined];
    }

    // Python: expand "both" to sync and async
    if (framework.executionMode === "both") {
      return ["sync", "async"];
    }

    // Return single mode or undefined
    return [framework.executionMode];
  }

  /**
   * Get streaming modes to test for a framework
   */
  private getStreamingModes(
    framework: FrameworkConfig,
  ): Array<"streaming" | "blocking" | undefined> {
    // If streaming mode is "both", expand to both variants
    if (framework.streamingMode === "both") {
      return ["streaming", "blocking"];
    }

    // Return single mode or undefined (for frameworks that don't specify streaming)
    return [framework.streamingMode];
  }

  /**
   * Execute a single test
   */
  private async executeTest(testRun: TestRun): Promise<void> {
    this.testRuns.push(testRun);
    testRun.status = "running";
    testRun.startTime = Date.now();

    // Update live status
    if (this.useLiveStatus) {
      this.liveStatus.updateTestStatus(testRun, "running");
    }

    // Build display name with mode suffixes
    const displayName = this.buildDisplayName(testRun);

    if (this.verbose && !this.useLiveStatus) {
      console.log(`\n[${testRun.framework.name}] Running: ${displayName}`);
    }

    try {
      // Register run with span collector
      this.spanCollector.registerRun(testRun.id);

      // Get DSN for this test run
      const sentryDsn = this.spanCollector.getDsn(testRun.id);

      // Determine isAsync flag for Python frameworks
      const isAsync =
        testRun.framework.platform === "py" &&
        testRun.framework.executionMode === "async";

      // Determine isStreaming flag
      const isStreaming = testRun.framework.streamingMode === "streaming";

      // Execute test via runner (template already rendered in setup phase)
      await this.runner.executeOnly({
        runId: testRun.id,
        framework: testRun.framework,
        testDefinition: testRun.testDefinition,
        sentryDsn,
        workDir: this.runner.getWorkDir(testRun.framework),
        isAsync,
        isStreaming,
        verbose: this.verbose && !this.useLiveStatus, // Only verbose when flag is set and not live status
      });

      // Wait for spans to be collected
      await this.waitForSpans(testRun.id);

      // Get captured spans
      const spans = this.spanCollector.getSpans(testRun.id);
      testRun.spans = spans;

      // Append spans to log file (always, with full detail)
      await this.appendSpansToLogFile(testRun, spans);

      // Validate spans using test definition's check methods
      const checkResults = await this.validator.validate(
        spans,
        testRun.testDefinition,
        testRun.framework,
        // Pass callback to update live status for each check
        this.useLiveStatus
          ? (checkName: string) => {
              this.liveStatus.updateCurrentCheck(testRun, checkName);
            }
          : undefined,
        // Pass callback to update check result
        this.useLiveStatus
          ? (checkResult) => {
              this.liveStatus.updateCheckResult(testRun, checkResult);
            }
          : undefined,
      );
      testRun.checkResults = checkResults;

      testRun.status = "passed";

      // Update live status
      if (this.useLiveStatus) {
        this.liveStatus.updateTestStatus(testRun, "passed");
      }

      if (this.verbose && !this.useLiveStatus) {
        console.log(`✓ ${displayName} passed`);
      } else if (!this.useLiveStatus) {
        // Pytest-style progress: dot for passed
        process.stdout.write("\x1b[32m.\x1b[0m");
      }
    } catch (error) {
      testRun.status = "failed";

      // Extract check results from ValidationError if available
      if (error instanceof ValidationError) {
        testRun.checkResults = error.checkResults;
        testRun.error = error.message;
      } else {
        testRun.error = error instanceof Error ? error.message : String(error);
      }

      // Update live status
      if (this.useLiveStatus) {
        this.liveStatus.updateTestStatus(testRun, "failed", testRun.error);
      }

      if (this.verbose && !this.useLiveStatus) {
        console.error(`✗ ${displayName} failed:`, testRun.error);
      } else if (!this.useLiveStatus) {
        // Pytest-style progress: F for failed
        process.stdout.write("\x1b[31mF\x1b[0m");
      }
    } finally {
      testRun.endTime = Date.now();
      this.spanCollector.clearRun(testRun.id);
    }
  }

  /**
   * Wait for spans to be collected (with timeout)
   */
  private async waitForSpans(
    runId: string,
    timeoutMs: number = 5000,
  ): Promise<void> {
    const startTime = Date.now();
    const checkInterval = 100;

    while (Date.now() - startTime < timeoutMs) {
      const spans = this.spanCollector.getSpans(runId);
      if (spans.length > 0) {
        // Give a bit more time for additional spans
        await new Promise((resolve) => setTimeout(resolve, 500));
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, checkInterval));
    }

    // No spans received - this might be expected for error tests
    console.warn(`No spans received for run ${runId} after ${timeoutMs}ms`);
  }

  /**
   * Generate report
   */
  private generateReport(startTime: number, endTime: number): TestReport {
    // Sort runs by original index for consistent ordering (parallel execution
    // may complete tests in arbitrary order)
    const sortedRuns = [...this.testRuns].sort(
      (a, b) => (a.index ?? 0) - (b.index ?? 0),
    );

    const passed = sortedRuns.filter((r) => r.status === "passed").length;
    const failed = sortedRuns.filter((r) => r.status === "failed").length;
    const errors = sortedRuns.filter((r) => r.status === "error").length;
    const skipped = sortedRuns.filter((r) => r.status === "skipped").length;

    return {
      totalTests: sortedRuns.length,
      passed,
      failed,
      errors,
      skipped,
      duration: endTime - startTime,
      runs: sortedRuns,
    };
  }

  /**
   * Generate unique run ID
   */
  private generateRunId(): string {
    return `run-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Build display name with mode suffixes (e.g., "Basic LLM Test (sync, streaming)")
   */
  private buildDisplayName(testRun: TestRun): string {
    const modeParts: string[] = [];

    // Add execution mode for Python
    if (
      testRun.framework.platform === "py" &&
      testRun.framework.executionMode
    ) {
      modeParts.push(testRun.framework.executionMode);
    }

    // Add streaming mode if specified
    if (testRun.framework.streamingMode) {
      modeParts.push(testRun.framework.streamingMode);
    }

    if (modeParts.length > 0) {
      return `${testRun.testDefinition.name} (${modeParts.join(", ")})`;
    }

    return testRun.testDefinition.name;
  }

  /**
   * Append captured spans to the test log file
   */
  private async appendSpansToLogFile(
    testRun: TestRun,
    spans: CapturedSpan[],
  ): Promise<void> {
    try {
      const workDir = this.runner.getWorkDir(testRun.framework);
      const testCaseId = testRun.testDefinition.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");

      const modeParts: string[] = [];
      if (testRun.framework.executionMode) {
        modeParts.push(testRun.framework.executionMode);
      }
      if (testRun.framework.streamingMode) {
        modeParts.push(testRun.framework.streamingMode);
      }
      const modeSuffix = modeParts.length > 0 ? modeParts.join("-") : "default";
      const logFile = path.join(
        workDir,
        `test-${testCaseId}-${modeSuffix}.log`,
      );

      // Build spans content with full JSON detail
      const lines: string[] = [
        "",
        "=== CAPTURED SPANS ===",
        `Total spans: ${spans.length}`,
        "",
      ];

      if (spans.length === 0) {
        lines.push("(no spans captured)");
      } else {
        for (let i = 0; i < spans.length; i++) {
          const span = spans[i];
          lines.push(`--- Span ${i + 1} ---`);
          lines.push(JSON.stringify(span, null, 2));
          lines.push("");
        }
      }

      // Append to log file
      await fs.appendFile(logFile, lines.join("\n"));
    } catch (error) {
      // Silently ignore errors writing to log file
      console.error("  Warning: Could not append spans to log file:", error);
    }
  }

  /**
   * Print test report with colors and detailed check breakdown
   */
  printReport(report: TestReport): void {
    // ANSI color codes
    const colors = {
      reset: "\x1b[0m",
      bright: "\x1b[1m",
      dim: "\x1b[2m",
      green: "\x1b[32m",
      red: "\x1b[31m",
      yellow: "\x1b[33m",
      blue: "\x1b[34m",
      cyan: "\x1b[36m",
      gray: "\x1b[90m",
    };

    console.log("\n" + colors.bright + "=".repeat(70) + colors.reset);
    console.log(
      colors.bright + colors.cyan + "📊 Test Results Summary" + colors.reset,
    );
    console.log(colors.bright + "=".repeat(70) + colors.reset);

    // Summary stats with colors
    console.log(
      `${colors.bright}Total Tests:${colors.reset}  ${report.totalTests}`,
    );
    console.log(`${colors.green}✓ Passed:${colors.reset}     ${report.passed}`);
    console.log(`${colors.red}✗ Failed:${colors.reset}     ${report.failed}`);
    if (report.skipped > 0) {
      console.log(
        `${colors.yellow}⊘ Skipped:${colors.reset}    ${report.skipped}`,
      );
    }
    if (report.errors > 0) {
      console.log(
        `${colors.yellow}⚠ Errors:${colors.reset}     ${report.errors}`,
      );
    }
    console.log(
      `${colors.blue}⏱ Duration:${colors.reset}    ${(report.duration / 1000).toFixed(2)}s`,
    );
    console.log(colors.bright + "=".repeat(70) + colors.reset);

    // Detailed test breakdown
    console.log(
      "\n" + colors.bright + colors.cyan + "📋 Detailed Results" + colors.reset,
    );
    console.log(colors.gray + "─".repeat(70) + colors.reset);

    for (const run of report.runs) {
      // Build mode string with execution mode (Python) and streaming mode
      const modeParts: string[] = [];
      if (run.framework.platform === "py" && run.framework.executionMode) {
        modeParts.push(run.framework.executionMode);
      }
      if (run.framework.streamingMode) {
        modeParts.push(run.framework.streamingMode);
      }
      const modeStr =
        modeParts.length > 0
          ? ` ${colors.dim}(${modeParts.join(", ")})${colors.reset}`
          : "";

      // Test header
      if (run.status === "passed") {
        console.log(
          `\n${colors.green}✓${colors.reset} ${colors.bright}[${run.framework.name}]${colors.reset} ${run.testDefinition.name}${modeStr}`,
        );
      } else {
        console.log(
          `\n${colors.red}✗${colors.reset} ${colors.bright}[${run.framework.name}]${colors.reset} ${run.testDefinition.name}${modeStr}`,
        );
      }

      // Check results breakdown
      if (run.checkResults && run.checkResults.length > 0) {
        for (const check of run.checkResults) {
          if (check.status === "passed") {
            console.log(
              `  ${colors.green}✓${colors.reset} ${colors.dim}${check.name}${colors.reset}`,
            );
          } else if (check.status === "skipped") {
            const reason = check.skipReason || "Not supported";
            console.log(
              `  ${colors.yellow}⊘${colors.reset} ${colors.dim}${check.name}${colors.reset} ${colors.gray}(${reason})${colors.reset}`,
            );
          } else {
            const sev = (check as any).severity || "normal";
            const sevIcon = sev === "critical" ? "❗" : sev === "warning" ? "⚠ " : "✗ ";
            const sevColor = sev === "critical" ? colors.red : sev === "warning" ? colors.yellow : colors.red;
            console.log(
              `  ${sevColor}${sevIcon}${colors.reset} ${colors.bright}${check.name}${colors.reset}`,
            );
            if (check.error) {
              // Print error message with indentation
              const errorLines = check.error.split("\n");
              for (const line of errorLines) {
                console.log(`    ${colors.dim}${line}${colors.reset}`);
              }
            }
            // Show error locations
            if (check.errorLocations && check.errorLocations.length > 0) {
              for (const loc of check.errorLocations) {
                const spanRef = `span ${loc.spanId.substring(0, 8)}`;
                const attrRef = loc.attribute
                  ? ` ${colors.yellow}${loc.attribute}${colors.reset}`
                  : "";
                console.log(
                  `    ${colors.gray}→ ${spanRef}${attrRef}: ${loc.message}${colors.reset}`,
                );
              }
            }
          }
        }
      } else if (run.status === "skipped") {
        // Show skip reason for skipped tests
        const reason = run.skipReason || "Test skipped";
        console.log(
          `  ${colors.yellow}⊘${colors.reset} ${colors.dim}${reason}${colors.reset}`,
        );
      } else if (run.status === "failed" && run.error) {
        // Fallback for tests without check results
        console.log(
          `  ${colors.red}Error:${colors.reset} ${colors.dim}${run.error}${colors.reset}`,
        );
      }

      // Duration
      if (run.startTime && run.endTime) {
        const duration = ((run.endTime - run.startTime) / 1000).toFixed(2);
        console.log(`  ${colors.gray}⏱  ${duration}s${colors.reset}`);
      }
    }

    console.log("\n" + colors.gray + "─".repeat(70) + colors.reset);

    // Final summary
    if (report.failed === 0 && report.errors === 0) {
      console.log(
        `\n${colors.green}${colors.bright}✓ All tests passed!${colors.reset} 🎉\n`,
      );
    } else {
      console.log(
        `\n${colors.red}${colors.bright}✗ ${report.failed + report.errors} test(s) failed${colors.reset}\n`,
      );
    }
  }
}
