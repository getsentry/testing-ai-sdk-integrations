/**
 * Console Printer - Reads CTRF Report and prints to console
 *
 * This maintains the exact same output format as before, but now reads from CTRF
 * instead of directly from TestResult[].
 */

import chalk from 'chalk';
import type { Report, Test } from 'ctrf';

/**
 * Print CTRF report to console (same format as original printResults)
 */
export function printCTRFReport(report: Report) {
  console.log(chalk.blue.bold('\n📊 Test Results\n'));

  // Group tests by SDK (suite field)
  const testsBySDK = new Map<string, Test[]>();
  for (const test of report.results.tests) {
    // suite is string[], take the first element or 'unknown'
    const suite = (test.suite && test.suite.length > 0) ? test.suite[0] : 'unknown';
    if (!testsBySDK.has(suite)) {
      testsBySDK.set(suite, []);
    }
    testsBySDK.get(suite)!.push(test);
  }

  // Print results for each SDK
  for (const [sdkPath, tests] of testsBySDK) {
    console.log(chalk.cyan.bold(sdkPath));

    for (const test of tests) {
      const statusIcon = test.status === 'passed'
        ? chalk.green('✓')
        : chalk.red('✗');

      const duration = chalk.gray(`(${test.duration}ms)`);

      // Extract case ID from test name (format: "sdk/path :: caseId")
      const caseId = test.name.split(' :: ')[1] || test.name;

      console.log(`  ${statusIcon} ${caseId} ${duration}`);

      // Print error details if test failed
      if (test.status === 'failed' && (test.message || test.trace)) {
        // Use trace if available (full error), otherwise use message
        const errorText = test.trace || test.message || '';
        const errorLines = errorText.split('\n');

        for (const line of errorLines) {
          // Skip stack trace lines (lines starting with "    at ")
          if (line.trim().startsWith('at ')) {
            continue;
          }

          // Lines starting with "    " are span-level errors, keep their indentation
          // Other lines get standard error indentation
          if (line.startsWith('    ')) {
            console.log(chalk.red(line));
          } else if (line.trim()) {
            console.log(chalk.red(`    ${line}`));
          }
        }
      }
    }
    console.log('');
  }

  // Print summary
  const { passed, failed, tests: total } = report.results.summary;
  const duration = report.results.summary.stop - report.results.summary.start;

  console.log(chalk.bold('Summary:'));
  console.log(`  ${chalk.green(`${passed} passed`)}, ${chalk.red(`${failed} failed`)}, ${total} total`);
  console.log(chalk.gray(`  Time: ${(duration / 1000).toFixed(2)}s\n`));

  if (failed === 0) {
    console.log(chalk.green.bold('✓ All tests passed!\n'));
  } else {
    console.log(chalk.red.bold('✗ Some tests failed\n'));
  }
}
