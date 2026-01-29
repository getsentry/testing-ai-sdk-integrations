/**
 * Main orchestrator - coordinates test execution
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { SpanCollector } from './span-collector/server.js';
import { Runner } from './runner/runner.js';
import { Validator, ValidationError } from './validator.js';
import { generateCTRFReport, writeCTRFReport } from './reporters/ctrf-reporter.js';
import { LiveStatusReporter } from './reporters/live-status.js';
import {
  TestDefinition,
  FrameworkConfig,
  TestRun,
  TestReport,
  CapturedSpan,
} from './types.js';

export class Orchestrator {
  private spanCollector: SpanCollector;
  private runner: Runner;
  private validator: Validator;
  private liveStatus: LiveStatusReporter;
  private testRuns: TestRun[] = [];
  private useLiveStatus: boolean = false;
  private verbose: boolean = false;

  private syncFilter?: boolean;
  private asyncFilter?: boolean;
  private streamingFilter?: boolean;
  private nonStreamingFilter?: boolean;

  constructor(options: { 
    liveStatus?: boolean;
    verbose?: boolean;
    sync?: boolean;
    async?: boolean;
    streaming?: boolean;
    nonStreaming?: boolean;
  } = {}) {
    this.spanCollector = new SpanCollector();
    this.runner = new Runner();
    this.validator = new Validator();
    this.liveStatus = new LiveStatusReporter();
    this.useLiveStatus = options.liveStatus === true; // Default to false (opt-in)
    this.verbose = options.verbose === true; // Default to false
    this.syncFilter = options.sync;
    this.asyncFilter = options.async;
    this.streamingFilter = options.streaming;
    this.nonStreamingFilter = options.nonStreaming;
    
    // Set verbose on validator
    this.validator.setVerbose(this.verbose);
  }

  /**
   * Start the orchestrator
   */
  async start(): Promise<void> {
    await this.spanCollector.start();
    if (this.verbose) {
      console.log(`Span collector started on port ${this.spanCollector.getPort()}`);
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
    testDefinitions: TestDefinition[]
  ): Promise<TestReport> {
    const startTime = Date.now();

    // Generate test matrix
    let testMatrix = this.generateTestMatrix(frameworks, testDefinitions);
    
    // Filter by sync/async if specified (only one can be true, or neither for both)
    if (this.syncFilter && !this.asyncFilter) {
      testMatrix = testMatrix.filter(run => {
        // JS tests don't have execution mode, exclude them when filtering
        if (run.framework.platform === 'js') {
          return false;
        }
        return run.framework.executionMode === 'sync';
      });
    } else if (this.asyncFilter && !this.syncFilter) {
      testMatrix = testMatrix.filter(run => {
        // JS tests don't have execution mode, exclude them when filtering
        if (run.framework.platform === 'js') {
          return false;
        }
        return run.framework.executionMode === 'async';
      });
    }
    // If both or neither are specified, run all (no filtering needed)

    // TODO: Filter by streaming/non-streaming when streaming tests are implemented
    // if (this.streamingFilter && !this.nonStreamingFilter) { ... }
    // if (this.nonStreamingFilter && !this.streamingFilter) { ... }

    // Print test tree
    this.printTestTree(testMatrix);
    
    if (this.useLiveStatus) {
      // Register all tests with live status
      for (const testRun of testMatrix) {
        this.liveStatus.registerTest(testRun);
      }
      
      // Start live status display
      this.liveStatus.start();
    }

    // Execute tests
    for (const testRun of testMatrix) {
      await this.executeTest(testRun);
    }

    // Stop live status display
    if (this.useLiveStatus) {
      this.liveStatus.stop();
    }
    
    // End progress line in non-verbose mode
    if (!this.verbose && !this.useLiveStatus) {
      console.log(''); // New line after progress dots
    }

    // Generate report
    const endTime = Date.now();
    const report = this.generateReport(startTime, endTime);

    // Generate and write CTRF report
    await this.writeCTRFReport(report);

    return report;
  }

  /**
   * Write CTRF report to file
   */
  async writeCTRFReport(report: TestReport): Promise<void> {
    try {
      const ctrfReport = generateCTRFReport(report);
      const filePath = await writeCTRFReport(ctrfReport, './test-results');
      if (this.verbose) {
        console.log(`\n✓ CTRF report written to: ${filePath}`);
      }
    } catch (error) {
      if (this.verbose) {
        console.error('Failed to write CTRF report:', error);
      }
    }
  }

  /**
   * Generate test matrix (framework × test definition combinations)
   */
  private generateTestMatrix(
    frameworks: FrameworkConfig[],
    testDefinitions: TestDefinition[]
  ): TestRun[] {
    const matrix: TestRun[] = [];

    for (const framework of frameworks) {
      for (const testDefinition of testDefinitions) {
        // Check if test is explicitly skipped for this framework
        if (framework.skip?.tests?.includes(testDefinition.name)) {
          if (this.verbose) {
            console.log(
              `⊘ Skipping ${testDefinition.name} on ${framework.name} (explicitly skipped in config)`
            );
          }
          continue;
        }

        // Skip incompatible combinations based on test type
        const isCompatible = this.isCompatible(framework, testDefinition);
        
        if (!isCompatible.compatible) {
          if (this.verbose) {
            console.log(
              `⊘ Skipping ${testDefinition.name} on ${framework.name} (${isCompatible.reason})`
            );
          }
          continue;
        }

        // For Python frameworks with "both" execution mode, generate two test runs
        if (framework.platform === 'py' && framework.executionMode === 'both') {
          // Sync version
          const syncRunId = this.generateRunId();
          matrix.push({
            id: syncRunId,
            framework: { ...framework, executionMode: 'sync' },
            testDefinition,
            status: 'pending',
          });
          
          // Async version
          const asyncRunId = this.generateRunId();
          matrix.push({
            id: asyncRunId,
            framework: { ...framework, executionMode: 'async' },
            testDefinition,
            status: 'pending',
          });
        } else {
          const runId = this.generateRunId();
          matrix.push({
            id: runId,
            framework,
            testDefinition,
            status: 'pending',
          });
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
      reset: '\x1b[0m',
      bright: '\x1b[1m',
      dim: '\x1b[2m',
      cyan: '\x1b[36m',
      gray: '\x1b[90m',
      yellow: '\x1b[33m',
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
      const platformIcon = platform === 'py' ? '🐍' : '📦';
      console.log(`${platformIcon} ${colors.bright}${platform.toUpperCase()}${colors.reset}`);
      
      const frameworkEntries = Array.from(frameworks.entries());
      for (let fi = 0; fi < frameworkEntries.length; fi++) {
        const [framework, runs] = frameworkEntries[fi];
        const isLastFramework = fi === frameworkEntries.length - 1;
        const frameworkPrefix = isLastFramework ? '└─' : '├─';
        
        console.log(`   ${frameworkPrefix} ${colors.bright}${framework}${colors.reset}`);
        
        for (let ri = 0; ri < runs.length; ri++) {
          const run = runs[ri];
          const isLast = ri === runs.length - 1;
          const testPrefix = isLastFramework ? '      ' : '   │  ';
          const testBranch = isLast ? '└─' : '├─';
          
          const mode = run.framework.executionMode 
            ? ` ${colors.dim}(${run.framework.executionMode})${colors.reset}` 
            : '';
          
          console.log(`${testPrefix}${testBranch} ${run.testDefinition.name}${mode}`);
        }
      }
    }
    
    console.log(`\n${colors.dim}Total: ${testMatrix.length} test(s)${colors.reset}\n`);
  }

  /**
   * Check if a test is compatible with a framework
   */
  private isCompatible(
    framework: FrameworkConfig,
    test: TestDefinition
  ): { compatible: boolean; reason?: string } {
    // LLM tests can only run on llm-only frameworks
    if (test.type === 'llm' && framework.type !== 'llm-only') {
      return {
        compatible: false,
        reason: 'LLM test requires llm-only framework',
      };
    }

    // Agent tests can only run on agentic frameworks
    if (test.type === 'agent' && framework.type !== 'agentic') {
      return {
        compatible: false,
        reason: 'Agent test requires agentic framework',
      };
    }

    return { compatible: true };
  }

  /**
   * Execute a single test
   */
  private async executeTest(testRun: TestRun): Promise<void> {
    this.testRuns.push(testRun);
    testRun.status = 'running';
    testRun.startTime = Date.now();
    
    // Update live status
    if (this.useLiveStatus) {
      this.liveStatus.updateTestStatus(testRun, 'running');
    }

    // Build display name with execution mode suffix for Python
    const displayName = testRun.framework.platform === 'py' && testRun.framework.executionMode
      ? `${testRun.testDefinition.name} (${testRun.framework.executionMode})`
      : testRun.testDefinition.name;

    if (this.verbose && !this.useLiveStatus) {
      console.log(`\n[${testRun.framework.name}] Running: ${displayName}`);
    }

    try {
      // Register run with span collector
      this.spanCollector.registerRun(testRun.id);

      // Get DSN for this test run
      const sentryDsn = this.spanCollector.getDsn(testRun.id);

      // Determine isAsync flag for Python frameworks
      const isAsync = testRun.framework.platform === 'py' && testRun.framework.executionMode === 'async';

      // Execute test via runner
      await this.runner.runTest({
        runId: testRun.id,
        framework: testRun.framework,
        testDefinition: testRun.testDefinition,
        sentryDsn,
        workDir: this.runner.getWorkDir(testRun.framework),
        isAsync,
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
        this.useLiveStatus ? (checkName: string) => {
          this.liveStatus.updateCurrentCheck(testRun, checkName);
        } : undefined,
        // Pass callback to update check result
        this.useLiveStatus ? (checkResult) => {
          this.liveStatus.updateCheckResult(testRun, checkResult);
        } : undefined
      );
      testRun.checkResults = checkResults;

      testRun.status = 'passed';
      
      // Update live status
      if (this.useLiveStatus) {
        this.liveStatus.updateTestStatus(testRun, 'passed');
      }
      
      if (this.verbose && !this.useLiveStatus) {
        console.log(`✓ ${displayName} passed`);
      } else if (!this.useLiveStatus) {
        // Pytest-style progress: dot for passed
        process.stdout.write('\x1b[32m.\x1b[0m');
      }
    } catch (error) {
      testRun.status = 'failed';
      
      // Extract check results from ValidationError if available
      if (error instanceof ValidationError) {
        testRun.checkResults = error.checkResults;
        testRun.error = error.message;
      } else {
        testRun.error = error instanceof Error ? error.message : String(error);
      }
      
      // Update live status
      if (this.useLiveStatus) {
        this.liveStatus.updateTestStatus(testRun, 'failed', testRun.error);
      }
      
      if (this.verbose && !this.useLiveStatus) {
        console.error(`✗ ${displayName} failed:`, testRun.error);
      } else if (!this.useLiveStatus) {
        // Pytest-style progress: F for failed
        process.stdout.write('\x1b[31mF\x1b[0m');
      }
    } finally {
      testRun.endTime = Date.now();
      this.spanCollector.clearRun(testRun.id);
    }
  }

  /**
   * Wait for spans to be collected (with timeout)
   */
  private async waitForSpans(runId: string, timeoutMs: number = 5000): Promise<void> {
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
    const passed = this.testRuns.filter((r) => r.status === 'passed').length;
    const failed = this.testRuns.filter((r) => r.status === 'failed').length;
    const errors = this.testRuns.filter((r) => r.status === 'error').length;
    const skipped = this.testRuns.filter((r) => r.status === 'skipped').length;

    return {
      totalTests: this.testRuns.length,
      passed,
      failed,
      errors,
      skipped,
      duration: endTime - startTime,
      runs: this.testRuns,
    };
  }

  /**
   * Generate unique run ID
   */
  private generateRunId(): string {
    return `run-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Append captured spans to the test log file
   */
  private async appendSpansToLogFile(testRun: TestRun, spans: CapturedSpan[]): Promise<void> {
    try {
      const workDir = this.runner.getWorkDir(testRun.framework);
      const testCaseId = testRun.testDefinition.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
      
      const mode = testRun.framework.executionMode || 'default';
      const logFile = path.join(workDir, `test-${testCaseId}-${mode}.log`);
      
      // Build spans content with full JSON detail
      const lines: string[] = [
        '',
        '=== CAPTURED SPANS ===',
        `Total spans: ${spans.length}`,
        '',
      ];

      if (spans.length === 0) {
        lines.push('(no spans captured)');
      } else {
        for (let i = 0; i < spans.length; i++) {
          const span = spans[i];
          lines.push(`--- Span ${i + 1} ---`);
          lines.push(JSON.stringify(span, null, 2));
          lines.push('');
        }
      }

      // Append to log file
      await fs.appendFile(logFile, lines.join('\n'));
    } catch (error) {
      // Silently ignore errors writing to log file
      console.error('  Warning: Could not append spans to log file:', error);
    }
  }

  /**
   * Print test report with colors and detailed check breakdown
   */
  printReport(report: TestReport): void {
    // ANSI color codes
    const colors = {
      reset: '\x1b[0m',
      bright: '\x1b[1m',
      dim: '\x1b[2m',
      green: '\x1b[32m',
      red: '\x1b[31m',
      yellow: '\x1b[33m',
      blue: '\x1b[34m',
      cyan: '\x1b[36m',
      gray: '\x1b[90m',
    };

    console.log('\n' + colors.bright + '='.repeat(70) + colors.reset);
    console.log(colors.bright + colors.cyan + '📊 Test Results Summary' + colors.reset);
    console.log(colors.bright + '='.repeat(70) + colors.reset);
    
    // Summary stats with colors
    console.log(`${colors.bright}Total Tests:${colors.reset}  ${report.totalTests}`);
    console.log(`${colors.green}✓ Passed:${colors.reset}     ${report.passed}`);
    console.log(`${colors.red}✗ Failed:${colors.reset}     ${report.failed}`);
    if (report.skipped > 0) {
      console.log(`${colors.yellow}⊘ Skipped:${colors.reset}    ${report.skipped}`);
    }
    if (report.errors > 0) {
      console.log(`${colors.yellow}⚠ Errors:${colors.reset}     ${report.errors}`);
    }
    console.log(`${colors.blue}⏱ Duration:${colors.reset}    ${(report.duration / 1000).toFixed(2)}s`);
    console.log(colors.bright + '='.repeat(70) + colors.reset);

    // Detailed test breakdown
    console.log('\n' + colors.bright + colors.cyan + '📋 Detailed Results' + colors.reset);
    console.log(colors.gray + '─'.repeat(70) + colors.reset);

    for (const run of report.runs) {
      const executionMode = run.framework.executionMode 
        ? ` ${colors.dim}(${run.framework.executionMode})${colors.reset}`
        : '';
      
      // Test header
      if (run.status === 'passed') {
        console.log(`\n${colors.green}✓${colors.reset} ${colors.bright}[${run.framework.name}]${colors.reset}${executionMode} ${run.testDefinition.name}`);
      } else {
        console.log(`\n${colors.red}✗${colors.reset} ${colors.bright}[${run.framework.name}]${colors.reset}${executionMode} ${run.testDefinition.name}`);
      }

      // Check results breakdown
      if (run.checkResults && run.checkResults.length > 0) {
        for (const check of run.checkResults) {
          if (check.status === 'passed') {
            console.log(`  ${colors.green}✓${colors.reset} ${colors.dim}${check.name}${colors.reset}`);
          } else if (check.status === 'skipped') {
            const reason = check.skipReason || 'Not supported';
            console.log(`  ${colors.yellow}⊘${colors.reset} ${colors.dim}${check.name}${colors.reset} ${colors.gray}(${reason})${colors.reset}`);
          } else {
            console.log(`  ${colors.red}✗${colors.reset} ${colors.bright}${check.name}${colors.reset}`);
            if (check.error) {
              // Print error message with indentation
              const errorLines = check.error.split('\n');
              for (const line of errorLines) {
                console.log(`    ${colors.dim}${line}${colors.reset}`);
              }
            }
          }
        }
      } else if (run.status === 'skipped') {
        // Show skip reason for skipped tests
        const reason = run.skipReason || 'Test skipped';
        console.log(`  ${colors.yellow}⊘${colors.reset} ${colors.dim}${reason}${colors.reset}`);
      } else if (run.status === 'failed' && run.error) {
        // Fallback for tests without check results
        console.log(`  ${colors.red}Error:${colors.reset} ${colors.dim}${run.error}${colors.reset}`);
      }

      // Duration
      if (run.startTime && run.endTime) {
        const duration = ((run.endTime - run.startTime) / 1000).toFixed(2);
        console.log(`  ${colors.gray}⏱  ${duration}s${colors.reset}`);
      }
    }

    console.log('\n' + colors.gray + '─'.repeat(70) + colors.reset);
    
    // Final summary
    if (report.failed === 0 && report.errors === 0) {
      console.log(`\n${colors.green}${colors.bright}✓ All tests passed!${colors.reset} 🎉\n`);
    } else {
      console.log(`\n${colors.red}${colors.bright}✗ ${report.failed + report.errors} test(s) failed${colors.reset}\n`);
    }
  }
}
