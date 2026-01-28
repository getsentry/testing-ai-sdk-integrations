/**
 * CTRF Reporter - Converts TestReport to CTRF (Common Test Report Format)
 * 
 * CTRF Specification: https://ctrf.io/
 */

import type { Report, Test } from 'ctrf';
import { TestReport, TestRun } from '../types.js';
import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * Convert TestReport to CTRF format
 */
export function generateCTRFReport(testReport: TestReport): Report {
  const now = Date.now();
  const startTime = now - testReport.duration;

  // Convert each TestRun to CTRF Test
  const tests: Test[] = testReport.runs.map((run) => {
    const frameworkName = `${run.framework.platform}/${run.framework.name}`;
    const executionMode = run.framework.executionMode 
      ? ` (${run.framework.executionMode})`
      : '';
    const testName = `${frameworkName}${executionMode} :: ${run.testDefinition.name}`;

    const test: Test = {
      name: testName,
      status: mapStatus(run.status),
      duration: run.endTime && run.startTime 
        ? run.endTime - run.startTime 
        : 0,
    };

    // Add suite (grouping)
    test.suite = [frameworkName];

    // Add tags for filtering
    const tags: string[] = [
      run.framework.platform, // 'py' or 'js'
      run.framework.type, // 'llm-only' or 'agentic'
      run.testDefinition.type, // 'llm' or 'agent'
    ];
    
    if (run.framework.executionMode) {
      tags.push(run.framework.executionMode); // 'sync', 'async', or 'both'
    }
    
    test.tags = tags;

    // Add error details if test failed
    if (run.error) {
      test.message = run.error.split('\n')[0]; // First line
      test.trace = run.error;
    }

    // Add extra metadata
    test.extra = {
      framework: run.framework.name,
      frameworkVersion: run.framework.version,
      sentryVersion: run.framework.sentryVersion,
      testType: run.testDefinition.type,
      platform: run.framework.platform,
      ...(run.framework.executionMode && {
        executionMode: run.framework.executionMode,
      }),
      ...(run.spans && {
        spanCount: run.spans.length,
      }),
    };

    return test;
  });

  // Calculate summary
  const summary = {
    tests: testReport.totalTests,
    passed: testReport.passed,
    failed: testReport.failed,
    pending: 0,
    skipped: testReport.skipped,
    other: testReport.errors,
    start: startTime,
    stop: now,
  };

  // Build CTRF report
  const report: Report = {
    reportFormat: 'CTRF',
    specVersion: '1.0.0',
    results: {
      tool: {
        name: 'sentry-ai-sdk-test',
        version: '1.0.0',
      },
      summary,
      tests,
    },
  };

  return report;
}

/**
 * Map our status to CTRF status
 */
function mapStatus(status: string): 'passed' | 'failed' | 'skipped' | 'pending' | 'other' {
  switch (status) {
    case 'passed':
      return 'passed';
    case 'failed':
      return 'failed';
    case 'skipped':
      return 'skipped';
    case 'error':
      return 'other';
    case 'pending':
      return 'pending';
    default:
      return 'other';
  }
}

/**
 * Write CTRF report to file
 */
export async function writeCTRFReport(
  report: Report,
  outputDir: string = './test-results'
): Promise<string> {
  // Ensure output directory exists
  await fs.mkdir(outputDir, { recursive: true });

  const filePath = path.join(outputDir, 'ctrf-report.json');
  await fs.writeFile(filePath, JSON.stringify(report, null, 2), 'utf-8');

  return filePath;
}
