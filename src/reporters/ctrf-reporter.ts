/**
 * CTRF Reporter - Converts TestReport to CTRF (Common Test Report Format)
 *
 * CTRF Specification: https://ctrf.io/
 */

import type { Report, Test } from "ctrf";
import { TestReport, TestRun, CheckResult } from "../types.js";
import * as fs from "fs/promises";
import * as path from "path";

/**
 * Convert TestReport to CTRF format
 */
export function generateCTRFReport(testReport: TestReport): Report {
  const now = Date.now();
  const startTime = now - testReport.duration;

  // Convert each TestRun to CTRF Test
  const tests: Test[] = testReport.runs.map((run) => {
    const frameworkName = `${run.framework.platform}/${run.framework.name}`;
    // Build mode string with execution mode (Python) and streaming mode
    const modeParts: string[] = [];
    if (run.framework.platform === "python" && run.framework.executionMode) {
      modeParts.push(run.framework.executionMode);
    }
    if (run.framework.streamingMode) {
      modeParts.push(run.framework.streamingMode);
    }
    if (run.framework.transportMode) {
      modeParts.push(run.framework.transportMode);
    }
    const modeStr = modeParts.length > 0 ? ` (${modeParts.join(", ")})` : "";
    const testName = `${frameworkName} :: ${run.testDefinition.name}${modeStr}`;

    const test: Test = {
      name: testName,
      status: mapStatus(run.status),
      duration: run.endTime && run.startTime ? run.endTime - run.startTime : 0,
    };

    // Add suite (grouping)
    test.suite = [frameworkName];

    // Add tags for filtering
    const tags: string[] = [
      run.framework.platform, // 'node' or 'python'
      run.framework.type, // 'llm-only' or 'agentic'
      run.testDefinition.type, // 'llm' or 'agent'
    ];

    if (run.framework.executionMode) {
      tags.push(run.framework.executionMode); // 'sync' or 'async'
    }
    if (run.framework.streamingMode) {
      tags.push(run.framework.streamingMode); // 'streaming' or 'blocking'
    }
    if (run.framework.transportMode) {
      tags.push(run.framework.transportMode); // 'stdio' or 'sse'
    }

    test.tags = tags;

    // Add error details if test failed
    if (run.error) {
      test.message = run.error.split("\n")[0]; // First line
      test.trace = run.error;
    }

    // Count warning check failures for this test
    const warningCount = countWarnings(run.checkResults);

    // Add extra metadata
    test.extra = {
      framework: run.framework.name,
      frameworkVersion: run.framework.version,
      sentryVersion: run.framework.sentryVersion,
      testType: run.testDefinition.type,
      platform: run.framework.platform,
      ...(run.status === "timeout" && { originalStatus: "timeout" }),
      ...(run.framework.executionMode && {
        executionMode: run.framework.executionMode,
      }),
      ...(run.framework.streamingMode && {
        streamingMode: run.framework.streamingMode,
      }),
      ...(run.framework.transportMode && {
        transportMode: run.framework.transportMode,
      }),
      ...(run.spans && {
        spanCount: run.spans.length,
        spans: run.spans,
      }),
      ...(run.checkResults && {
        checkResults: run.checkResults,
      }),
      ...(run.attributeAudit && {
        attributeAudit: run.attributeAudit,
      }),
      ...(warningCount > 0 && {
        warningCount,
      }),
    };

    return test;
  });

  // Count total warnings across all tests
  const totalWarnings = testReport.runs.reduce(
    (sum, run) => sum + countWarnings(run.checkResults),
    0,
  );

  // Calculate summary
  const summary = {
    tests: testReport.totalTests,
    passed: testReport.passed,
    failed: testReport.failed + testReport.timeouts,
    pending: 0,
    skipped: testReport.skipped,
    other: testReport.errors,
    start: startTime,
    stop: now,
    ...(totalWarnings > 0 && {
      extra: { warnings: totalWarnings },
    }),
  };

  // Build CTRF report
  const report: Report = {
    reportFormat: "CTRF",
    specVersion: "1.0.0",
    results: {
      tool: {
        name: "sentry-ai-sdk-test",
        version: "1.0.0",
      },
      summary,
      tests,
    },
  };

  return report;
}

/**
 * Count failed warning-severity checks for a test run
 */
function countWarnings(checkResults?: CheckResult[]): number {
  if (!checkResults) return 0;
  return checkResults.filter(
    (r) => r.status === "failed" && r.severity === "warning",
  ).length;
}

/**
 * Map our status to CTRF status
 */
function mapStatus(
  status: string,
): "passed" | "failed" | "skipped" | "pending" | "other" {
  switch (status) {
    case "passed":
      return "passed";
    case "failed":
      return "failed";
    case "skipped":
      return "skipped";
    case "timeout":
      return "failed";
    case "error":
      return "other";
    case "pending":
      return "pending";
    default:
      return "other";
  }
}

/**
 * Generate timestamp string for filenames
 * Format: YYYY-MM-DD-HHmmss
 */
export function getTimestamp(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const seconds = String(now.getSeconds()).padStart(2, "0");
  return `${year}-${month}-${day}-${hours}${minutes}${seconds}`;
}

/**
 * Write CTRF report to file
 */
export async function writeCTRFReport(
  report: Report,
  outputDir: string = "./test-results",
  timestamp?: string,
): Promise<string> {
  // Ensure output directory exists
  await fs.mkdir(outputDir, { recursive: true });

  const ts = timestamp || getTimestamp();
  const filePath = path.join(outputDir, `ctrf-report-${ts}.json`);
  await fs.writeFile(filePath, JSON.stringify(report, null, 2), "utf-8");

  return filePath;
}
