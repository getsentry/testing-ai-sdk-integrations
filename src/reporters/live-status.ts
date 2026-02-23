/**
 * Live Status Reporter - Real-time terminal UI for test execution
 *
 * Displays a tree view of running tests with auto-updating status
 * Uses log-update for flicker-free terminal updates
 */

import logUpdate from "log-update";
import { TestRun, CheckResult, AttributeAudit } from "../types.js";

interface TestState {
  framework: string;
  platform: string;
  type: string;
  testName: string;
  executionMode?: string;
  status: "pending" | "running" | "passed" | "failed" | "skipped";
  currentCheck?: string;
  checkResults: CheckResult[];
  attributeAudit?: AttributeAudit;
  error?: string;
  startTime?: number;
}

export class LiveStatusReporter {
  private states: Map<string, TestState> = new Map();
  private isActive = false;
  private renderInterval?: NodeJS.Timeout;

  /**
   * Start the live status display
   */
  start(): void {
    if (this.isActive) return;

    this.isActive = true;

    // Render every 100ms
    this.renderInterval = setInterval(() => {
      this.render();
    }, 100);

    // Initial render
    this.render();
  }

  /**
   * Stop the live status display
   */
  stop(): void {
    if (!this.isActive) return;

    this.isActive = false;

    if (this.renderInterval) {
      clearInterval(this.renderInterval);
      this.renderInterval = undefined;
    }

    // Stop log-update and persist the final output
    logUpdate.done();
  }

  /**
   * Register a test run
   */
  registerTest(testRun: TestRun): void {
    const key = this.getKey(testRun);
    this.states.set(key, {
      framework: testRun.framework.name,
      platform: testRun.framework.platform,
      type: testRun.framework.type,
      testName: testRun.testDefinition.name,
      executionMode: testRun.framework.executionMode,
      status: "pending",
      checkResults: [],
    });
  }

  /**
   * Update test status
   */
  updateTestStatus(
    testRun: TestRun,
    status: "running" | "passed" | "failed" | "skipped",
    error?: string,
  ): void {
    const key = this.getKey(testRun);
    const state = this.states.get(key);
    if (state) {
      state.status = status;
      state.error = error;
      if (status === "running" && !state.startTime) {
        state.startTime = Date.now();
      }
    }
  }

  /**
   * Update current check being executed
   */
  updateCurrentCheck(testRun: TestRun, checkName: string): void {
    const key = this.getKey(testRun);
    const state = this.states.get(key);
    if (state) {
      state.currentCheck = checkName;
    }
  }

  /**
   * Update check result
   */
  updateCheckResult(testRun: TestRun, checkResult: CheckResult): void {
    const key = this.getKey(testRun);
    const state = this.states.get(key);
    if (state) {
      // Update or add check result
      const existingIndex = state.checkResults.findIndex(
        (cr) => cr.name === checkResult.name,
      );
      if (existingIndex >= 0) {
        state.checkResults[existingIndex] = checkResult;
      } else {
        state.checkResults.push(checkResult);
      }
      state.currentCheck = undefined; // Clear current check after result
    }
  }

  /**
   * Update attribute audit result for a test
   */
  updateAuditResult(testRun: TestRun, audit: AttributeAudit): void {
    const key = this.getKey(testRun);
    const state = this.states.get(key);
    if (state) {
      state.attributeAudit = audit;
    }
  }

  /**
   * Render the status display
   */
  private render(): void {
    if (!this.isActive) return;

    const lines: string[] = [];
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

    // Title
    lines.push(
      `${colors.bright}${colors.cyan}⚡ Test Execution Status${colors.reset}`,
    );
    lines.push("");

    // Group by platform → framework
    const byPlatform = this.groupByPlatform();

    for (const [platform, frameworks] of byPlatform) {
      const platformIcon =
        platform === "python"
          ? "🐍"
          : platform === "php"
            ? "🐘"
            : platform === "browser"
              ? "🌐"
              : "📦";
      lines.push(
        `${platformIcon} ${colors.bright}${platform.toUpperCase()}${colors.reset}`,
      );

      for (const [framework, tests] of frameworks) {
        const frameworkStatus = this.getFrameworkStatus(tests);
        const frameworkIcon = this.getStatusIcon(frameworkStatus);
        lines.push(`  ${frameworkIcon} ${framework}`);

        for (const test of tests) {
          const testIcon = this.getStatusIcon(test.status);
          const executionMode = test.executionMode
            ? ` ${colors.dim}(${test.executionMode})${colors.reset}`
            : "";
          const duration = test.startTime
            ? ` ${colors.gray}${this.formatDuration(Date.now() - test.startTime)}${colors.reset}`
            : "";

          lines.push(
            `    ${testIcon} ${test.testName}${executionMode}${duration}`,
          );

          // Show current check if running
          if (test.status === "running" && test.currentCheck) {
            lines.push(
              `      ${colors.blue}→${colors.reset} ${colors.dim}${test.currentCheck}...${colors.reset}`,
            );
          }

          // Show check results
          for (const check of test.checkResults) {
            const sev = (check as any).severity || "normal";
            const checkIcon =
              check.status === "failed"
                ? sev === "critical"
                  ? `${colors.red}❗${colors.reset}`
                  : sev === "warning"
                    ? `${colors.yellow}⚠${colors.reset}`
                    : this.getStatusIcon(check.status)
                : this.getStatusIcon(check.status);
            const checkLine = `      ${checkIcon} ${colors.dim}${check.name}${colors.reset}`;

            if (check.status === "skipped" && check.skipReason) {
              lines.push(
                `${checkLine} ${colors.gray}(${check.skipReason})${colors.reset}`,
              );
            } else if (check.status === "failed" && check.error) {
              lines.push(checkLine);
              // Show first line of error
              const errorFirstLine = check.error.split("\n")[0];
              lines.push(
                `        ${colors.red}↳${colors.reset} ${colors.dim}${errorFirstLine}${colors.reset}`,
              );
              // Show error locations if available
              if (check.errorLocations && check.errorLocations.length > 0) {
                for (const loc of check.errorLocations.slice(0, 3)) {
                  const spanRef = `span ${loc.spanId.substring(0, 8)}`;
                  const attrRef = loc.attribute
                    ? ` ${colors.yellow}${loc.attribute}${colors.reset}`
                    : "";
                  lines.push(
                    `        ${colors.gray}  → ${spanRef}${attrRef}${colors.reset}`,
                  );
                }
                if (check.errorLocations.length > 3) {
                  lines.push(
                    `        ${colors.gray}  ... and ${check.errorLocations.length - 3} more${colors.reset}`,
                  );
                }
              }
            } else {
              lines.push(checkLine);
            }
          }

          // Show audit summary if findings exist
          if (test.attributeAudit) {
            const deprecated = test.attributeAudit.deprecatedAttributes.length;
            const unknown = test.attributeAudit.unknownAttributes.length;
            if (deprecated > 0 || unknown > 0) {
              const parts: string[] = [];
              if (deprecated > 0) parts.push(`${deprecated} deprecated`);
              if (unknown > 0) parts.push(`${unknown} unknown`);
              lines.push(
                `      ${colors.yellow}⚠${colors.reset} ${colors.dim}Audit: ${parts.join(", ")} attribute(s)${colors.reset}`,
              );
            }
          }

          // Show error if failed
          if (
            test.status === "failed" &&
            test.error &&
            test.checkResults.length === 0
          ) {
            const errorFirstLine = test.error.split("\n")[0];
            lines.push(
              `      ${colors.red}Error:${colors.reset} ${colors.dim}${errorFirstLine}${colors.reset}`,
            );
          }
        }
      }
      lines.push(""); // Blank line between platforms
    }

    // Update the terminal output using log-update (no flicker!)
    logUpdate(lines.join("\n"));
  }

  /**
   * Group tests by platform and framework
   */
  private groupByPlatform(): Map<string, Map<string, TestState[]>> {
    const result = new Map<string, Map<string, TestState[]>>();

    for (const state of this.states.values()) {
      if (!result.has(state.platform)) {
        result.set(state.platform, new Map());
      }
      const frameworks = result.get(state.platform)!;

      if (!frameworks.has(state.framework)) {
        frameworks.set(state.framework, []);
      }
      frameworks.get(state.framework)!.push(state);
    }

    return result;
  }

  /**
   * Get overall status for a framework (all its tests)
   */
  private getFrameworkStatus(
    tests: TestState[],
  ): "pending" | "running" | "passed" | "failed" | "skipped" {
    if (tests.some((t) => t.status === "failed")) return "failed";
    if (tests.some((t) => t.status === "running")) return "running";
    if (tests.every((t) => t.status === "passed")) return "passed";
    if (tests.every((t) => t.status === "skipped")) return "skipped";
    return "pending";
  }

  /**
   * Get icon for status
   */
  private getStatusIcon(status: string): string {
    const colors = {
      reset: "\x1b[0m",
      green: "\x1b[32m",
      red: "\x1b[31m",
      yellow: "\x1b[33m",
      blue: "\x1b[34m",
      gray: "\x1b[90m",
    };

    switch (status) {
      case "passed":
        return `${colors.green}✓${colors.reset}`;
      case "failed":
        return `${colors.red}✗${colors.reset}`;
      case "skipped":
        return `${colors.yellow}⊘${colors.reset}`;
      case "running":
        return `${colors.blue}◉${colors.reset}`;
      case "pending":
        return `${colors.gray}○${colors.reset}`;
      default:
        return "·";
    }
  }

  /**
   * Format duration in seconds
   */
  private formatDuration(ms: number): string {
    const seconds = (ms / 1000).toFixed(1);
    return `${seconds}s`;
  }

  /**
   * Generate unique key for a test run
   */
  private getKey(testRun: TestRun): string {
    return testRun.id;
  }
}
