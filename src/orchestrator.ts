/**
 * Main orchestrator - coordinates test execution
 */

import { SpanCollector } from './span-collector/server.js';
import { Runner } from './runner/runner.js';
import { Validator } from './validator.js';
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
  private testRuns: TestRun[] = [];

  constructor() {
    this.spanCollector = new SpanCollector();
    this.runner = new Runner();
    this.validator = new Validator();
  }

  /**
   * Start the orchestrator
   */
  async start(): Promise<void> {
    await this.spanCollector.start();
    console.log(`Span collector started on port ${this.spanCollector.getPort()}`);
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
    const testMatrix = this.generateTestMatrix(frameworks, testDefinitions);
    console.log(`Running ${testMatrix.length} tests across ${frameworks.length} frameworks`);

    // Execute tests
    for (const testRun of testMatrix) {
      await this.executeTest(testRun);
    }

    // Generate report
    const endTime = Date.now();
    return this.generateReport(startTime, endTime);
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
        // Skip incompatible combinations based on test type
        const isCompatible = this.isCompatible(framework, testDefinition);
        
        if (!isCompatible.compatible) {
          console.log(
            `Skipping ${testDefinition.name} on ${framework.name} (${isCompatible.reason})`
          );
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

    // Build display name with execution mode suffix for Python
    const displayName = testRun.framework.platform === 'py' && testRun.framework.executionMode
      ? `${testRun.testDefinition.name} (${testRun.framework.executionMode})`
      : testRun.testDefinition.name;

    console.log(`\n[${testRun.framework.name}] Running: ${displayName}`);

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
      });

      // Wait for spans to be collected
      await this.waitForSpans(testRun.id);

      // Get captured spans
      const spans = this.spanCollector.getSpans(testRun.id);
      testRun.spans = spans;

      // Validate spans using test definition's check methods
      await this.validator.validate(spans, testRun.testDefinition);

      testRun.status = 'passed';
      console.log(`✓ ${displayName} passed`);
    } catch (error) {
      testRun.status = 'failed';
      testRun.error = error instanceof Error ? error.message : String(error);
      console.error(`✗ ${displayName} failed:`, testRun.error);
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

    return {
      totalTests: this.testRuns.length,
      passed,
      failed,
      errors,
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
   * Print test report
   */
  printReport(report: TestReport): void {
    console.log('\n='.repeat(60));
    console.log('Test Report');
    console.log('='.repeat(60));
    console.log(`Total: ${report.totalTests}`);
    console.log(`Passed: ${report.passed}`);
    console.log(`Failed: ${report.failed}`);
    console.log(`Errors: ${report.errors}`);
    console.log(`Duration: ${(report.duration / 1000).toFixed(2)}s`);
    console.log('='.repeat(60));

    if (report.failed > 0 || report.errors > 0) {
      console.log('\nFailures:');
      for (const run of report.runs) {
        if (run.status === 'failed' || run.status === 'error') {
          console.log(`  [${run.framework.name}] ${run.testDefinition.name}`);
          console.log(`    ${run.error}`);
        }
      }
    }
  }
}
