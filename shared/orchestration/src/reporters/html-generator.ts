/**
 * HTML Generator - Reads CTRF Report and generates HTML report
 *
 * Uses htm+vhtml for templating (no build step required)
 */

import htm from 'htm';
import vhtml from 'vhtml';
import type { Report, Test } from 'ctrf';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

const html = htm.bind(vhtml);

/**
 * Format duration in milliseconds to human-readable format
 */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

/**
 * Get status icon for test result
 */
function getStatusIcon(status: string): string {
  switch (status) {
    case 'passed': return '✓';
    case 'failed': return '✗';
    case 'skipped': return '○';
    default: return '-';
  }
}

/**
 * Generate summary cards HTML
 */
function SummaryCards({ summary }: { summary: Report['results']['summary'] }) {
  const duration = summary.stop - summary.start;

  return html`
    <div class="summary">
      <div class="stat-card">
        <h3>Total Tests</h3>
        <p class="stat-value">${summary.tests}</p>
      </div>
      <div class="stat-card passed">
        <h3>✓ Passed</h3>
        <p class="stat-value">${summary.passed}</p>
      </div>
      <div class="stat-card failed">
        <h3>✗ Failed</h3>
        <p class="stat-value">${summary.failed}</p>
      </div>
      <div class="stat-card">
        <h3>Duration</h3>
        <p class="stat-value">${formatDuration(duration)}</p>
      </div>
    </div>
  `;
}

/**
 * Build test matrix: SDK × Test Case grid
 */
function TestMatrix({ report }: { report: Report }) {
  // Extract unique SDKs and test cases
  // suite is string[], take first element
  const sdks = [...new Set(report.results.tests.map((t: Test) =>
    (t.suite && t.suite.length > 0) ? t.suite[0] : 'unknown'
  ))].sort();
  const testCases = [...new Set(
    report.results.tests.map((t: Test) => t.name.split(' :: ')[1] || t.name)
  )].sort();

  // Build lookup map for quick access
  const testMap = new Map<string, Test>();
  for (const test of report.results.tests) {
    const caseId = test.name.split(' :: ')[1] || test.name;
    const suite = (test.suite && test.suite.length > 0) ? test.suite[0] : 'unknown';
    const key = `${suite}::${caseId}`;
    testMap.set(key, test);
  }

  return html`
    <h2>Test Matrix</h2>
    <table class="matrix">
      <thead>
        <tr>
          <th>SDK</th>
          ${testCases.map(caseId => html`<th>${caseId}</th>`)}
        </tr>
      </thead>
      <tbody>
        ${sdks.map(sdk => html`
          <tr>
            <td class="sdk-name">${sdk}</td>
            ${testCases.map(caseId => {
              const key = `${sdk}::${caseId}`;
              const test = testMap.get(key);

              if (!test) {
                return html`<td class="status-not-run">-</td>`;
              }

              return html`
                <td class="status-${test.status}">
                  ${getStatusIcon(test.status)}
                </td>
              `;
            })}
          </tr>
        `)}
      </tbody>
    </table>
  `;
}

/**
 * Failed tests details section
 */
function FailedTestsDetails({ tests }: { tests: Test[] }) {
  const failedTests = tests.filter(t => t.status === 'failed');

  if (failedTests.length === 0) {
    return html``;
  }

  return html`
    <h2>Failed Tests Details</h2>
    ${failedTests.map(test => {
      const caseId = test.name.split(' :: ')[1] || test.name;

      return html`
        <details class="failed-test">
          <summary>
            <span class="failed-icon">✗</span>
            <strong>${(test.suite && test.suite.length > 0) ? test.suite[0] : 'unknown'}</strong> :: ${caseId}
            <span class="duration">(${test.duration}ms)</span>
          </summary>
          <div class="error-details">
            ${test.message ? html`
              <div class="error-message">
                <strong>Error:</strong>
                <pre>${test.message}</pre>
              </div>
            ` : ''}
            ${test.trace ? html`
              <div class="error-trace">
                <strong>Stack Trace:</strong>
                <pre>${test.trace}</pre>
              </div>
            ` : ''}
          </div>
        </details>
      `;
    })}
  `;
}

/**
 * Generate complete HTML report from CTRF report
 */
export function generateHTML(report: Report): string {
  const title = 'Sentry AI SDK Test Report';

  const htmlContent = html`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>${title}</title>
      <style>
        * { box-sizing: border-box; }
        body {
          font-family: -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
          margin: 0;
          padding: 20px;
          background: #f5f5f5;
        }
        .container {
          max-width: 1400px;
          margin: 0 auto;
          background: white;
          padding: 40px;
          border-radius: 8px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }
        h1 {
          margin: 0 0 30px 0;
          color: #333;
        }
        h2 {
          margin: 30px 0 15px 0;
          color: #555;
        }
        .summary {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 20px;
          margin-bottom: 40px;
        }
        .stat-card {
          padding: 20px;
          border-radius: 8px;
          background: #f9f9f9;
          border: 2px solid #e0e0e0;
        }
        .stat-card h3 {
          margin: 0 0 10px 0;
          font-size: 14px;
          color: #666;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .stat-value {
          margin: 0;
          font-size: 32px;
          font-weight: bold;
          color: #333;
        }
        .stat-card.passed {
          background: #e8f5e9;
          border-color: #4caf50;
        }
        .stat-card.passed .stat-value {
          color: #2e7d32;
        }
        .stat-card.failed {
          background: #ffebee;
          border-color: #f44336;
        }
        .stat-card.failed .stat-value {
          color: #c62828;
        }
        .matrix {
          width: 100%;
          border-collapse: collapse;
          margin: 20px 0;
          font-size: 14px;
        }
        .matrix th,
        .matrix td {
          border: 1px solid #ddd;
          padding: 12px 8px;
          text-align: center;
        }
        .matrix th {
          background: #333;
          color: white;
          font-weight: 600;
          position: sticky;
          top: 0;
        }
        .matrix .sdk-name {
          text-align: left;
          font-weight: 500;
          background: #fafafa;
        }
        .matrix td.status-passed {
          background: #c8e6c9;
          color: #2e7d32;
          font-weight: bold;
        }
        .matrix td.status-failed {
          background: #ffcdd2;
          color: #c62828;
          font-weight: bold;
        }
        .matrix td.status-skipped {
          background: #fff9c4;
          color: #f57f17;
        }
        .matrix td.status-not-run {
          background: #f5f5f5;
          color: #999;
        }
        .failed-test {
          margin: 15px 0;
          border: 1px solid #ddd;
          border-radius: 4px;
        }
        .failed-test summary {
          padding: 15px;
          cursor: pointer;
          background: #fafafa;
          user-select: none;
        }
        .failed-test summary:hover {
          background: #f0f0f0;
        }
        .failed-test[open] summary {
          border-bottom: 1px solid #ddd;
        }
        .failed-icon {
          color: #c62828;
          margin-right: 8px;
        }
        .duration {
          color: #666;
          font-size: 12px;
          margin-left: 8px;
        }
        .error-details {
          padding: 15px;
        }
        .error-message,
        .error-trace {
          margin: 15px 0;
        }
        pre {
          background: #f5f5f5;
          padding: 12px;
          border-radius: 4px;
          overflow-x: auto;
          font-size: 13px;
          line-height: 1.5;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>${title}</h1>
        ${SummaryCards({ summary: report.results.summary })}
        ${TestMatrix({ report })}
        ${FailedTestsDetails({ tests: report.results.tests })}
      </div>
    </body>
    </html>
  `;

  // vhtml returns mixed content: strings for HTML tags, and arrays for special elements like DOCTYPE
  // The structure is typically: ["!DOCTYPE", attrs, "<html>...</html>"]
  function flattenToString(value: any): string {
    if (typeof value === 'string') {
      return value;
    }
    if (Array.isArray(value)) {
      // Check if this is a DOCTYPE declaration
      if (value[0] === '!DOCTYPE') {
        // DOCTYPE + rest of HTML
        return '<!DOCTYPE html>\n' + value.slice(2).map(flattenToString).join('');
      }
      // Regular array, flatten all elements
      return value.map(flattenToString).join('');
    }
    if (typeof value === 'object' && value !== null) {
      // Skip objects (like attributes)
      return '';
    }
    return String(value);
  }

  return flattenToString(htmlContent);
}

/**
 * Write HTML report to file
 */
export async function writeHTMLFile(
  html: string,
  outputDir: string = './test-results'
): Promise<string> {
  // Ensure output directory exists
  await mkdir(outputDir, { recursive: true });

  const filePath = join(outputDir, 'test-report.html');
  await writeFile(filePath, html, 'utf-8');

  return filePath;
}
