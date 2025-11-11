/**
 * CTRF Generator - Converts TestResult[] to CTRF Report format
 *
 * CTRF (Common Test Report Format) is our single source of truth for test data.
 * All reporters (console, HTML, etc.) consume CTRF format.
 */

import type { Report, Test } from 'ctrf';
import type { TestResult, SDK } from '../types.js';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

/**
 * Convert our TestResult[] format to CTRF Report format
 */
export function generateCTRFReport(
  results: TestResult[],
  sdks: SDK[],
  totalDuration: number
): Report {
  const now = Date.now();
  const startTime = now - totalDuration;

  // Convert each TestResult to CTRF Test
  const tests: Test[] = results.map(result => {
    const test: Test = {
      name: `${result.sdkPath} :: ${result.caseId}`,
      status: result.status,
      duration: result.duration,
    };

    // Add optional fields
    test.suite = [result.sdkPath];  // suite is string[] in CTRF
    test.tags = [
      result.sdkPath.startsWith('js/') ? 'javascript' : 'python',
      result.caseId
    ];

    // Add error details if test failed
    if (result.error) {
      test.message = result.error.message.split('\n')[0]; // First line
      test.trace = result.error.stack || result.error.message;
    }

    return test;
  });

  // Calculate summary
  const summary = {
    tests: results.length,
    passed: results.filter(r => r.status === 'passed').length,
    failed: results.filter(r => r.status === 'failed').length,
    pending: 0,
    skipped: results.filter(r => r.status === 'skipped').length,
    other: 0,
    start: startTime,
    stop: now
  };

  // Build the CTRF report
  const report: Report = {
    reportFormat: 'CTRF',
    specVersion: '1.0.0',
    results: {
      tool: {
        name: 'sentry-ai-test',
        version: '1.0.0'
      },
      summary,
      tests
    }
  };

  return report;
}

/**
 * Write CTRF report to file
 */
export async function writeCTRFFile(
  report: Report,
  outputDir: string = './test-results'
): Promise<string> {
  // Ensure output directory exists
  await mkdir(outputDir, { recursive: true });

  const filePath = join(outputDir, 'ctrf-report.json');
  await writeFile(filePath, JSON.stringify(report, null, 2), 'utf-8');

  return filePath;
}
