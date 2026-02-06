/**
 * HTML Generator - Reads CTRF Report and generates HTML report
 *
 * Uses htm+vhtml for templating (no build step required)
 */

import htm from "htm";
import vhtml from "vhtml";
import type { Report, Test } from "ctrf";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";

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
    case "passed":
      return "✓";
    case "failed":
      return "✗";
    case "skipped":
      return "○";
    default:
      return "-";
  }
}

/**
 * Generate summary cards HTML
 */
function SummaryCards({ summary }: { summary: Report["results"]["summary"] }) {
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
 * Natural sort comparator that handles numeric prefixes correctly.
 * E.g., "1-simple" < "2-multi" < "10-binary" (not lexical "1" < "10" < "2")
 */
function naturalSortCompare(a: string, b: string): number {
  // Extract numeric prefix if present (e.g., "10-binary" -> 10)
  const aMatch = a.match(/^(\d+)/);
  const bMatch = b.match(/^(\d+)/);

  // If both have numeric prefixes, compare numerically
  if (aMatch && bMatch) {
    const aNum = parseInt(aMatch[1], 10);
    const bNum = parseInt(bMatch[1], 10);
    if (aNum !== bNum) {
      return aNum - bNum;
    }
    // If numeric prefixes are equal, compare the rest lexically
    return a.localeCompare(b);
  }

  // If only one has a numeric prefix, it comes first
  if (aMatch) return -1;
  if (bMatch) return 1;

  // Neither has a numeric prefix, compare lexically
  return a.localeCompare(b);
}

/**
 * Extract base test name without mode suffixes
 * e.g., "Basic LLM Test (async, streaming)" -> "Basic LLM Test"
 */
function getBaseTestName(testName: string): string {
  // Remove the mode suffix in parentheses
  return testName.replace(/\s*\([^)]*\)\s*$/, "").trim();
}

/**
 * Combined status for multiple test variations
 */
interface CombinedTestResult {
  passed: number;
  failed: number;
  skipped: number;
  other: number;
  total: number;
  variations: Array<{
    mode: string;
    status: string;
  }>;
}

/**
 * Get overall status from combined results
 */
function getCombinedStatus(result: CombinedTestResult): string {
  if (result.failed > 0) return "failed";
  if (result.other > 0) return "failed"; // errors count as failed
  if (result.passed > 0 && result.skipped === 0) return "passed";
  if (result.passed > 0) return "partial"; // some passed, some skipped
  if (result.skipped > 0) return "skipped";
  return "not-run";
}

/**
 * Generate cell content with status icons for each variation
 */
function CombinedStatusCell({ result }: { result: CombinedTestResult }) {
  const overallStatus = getCombinedStatus(result);
  
  // If only one variation, show simple icon with tooltip
  if (result.total === 1) {
    const v = result.variations[0];
    return html`<td class="status-${v.status}" title="${v.mode}">${getStatusIcon(v.status)}</td>`;
  }
  
  // Multiple variations - show mini icons with tooltips
  return html`
    <td class="status-${overallStatus} multi-status">
      <div class="status-grid">
        ${result.variations.map(
          (v) => html`
            <span class="mini-status status-${v.status}" title="${v.mode}">
              ${getStatusIcon(v.status)}
            </span>
          `,
        )}
      </div>
    </td>
  `;
}

/**
 * Build test matrix for a specific test type (LLM or Agent)
 */
function TestMatrixByType({
  tests,
  testType,
  title,
}: {
  tests: Test[];
  testType: string;
  title: string;
}) {
  // Filter tests by type
  const filteredTests = tests.filter(
    (t) => (t.extra as Record<string, unknown>)?.testType === testType,
  );

  if (filteredTests.length === 0) {
    return html``;
  }

  // Extract unique SDKs
  const sdks = [
    ...new Set(
      filteredTests.map((t: Test) =>
        t.suite && t.suite.length > 0 ? t.suite[0] : "unknown",
      ),
    ),
  ].sort();

  // Extract unique base test names (without mode suffixes)
  const testCases = [
    ...new Set(
      filteredTests.map((t: Test) => {
        const fullName = t.name.split(" :: ")[1] || t.name;
        return getBaseTestName(fullName);
      }),
    ),
  ].sort(naturalSortCompare);

  // Build lookup map: sdk::baseTestName -> CombinedTestResult
  const testMap = new Map<string, CombinedTestResult>();

  for (const test of filteredTests) {
    const fullName = test.name.split(" :: ")[1] || test.name;
    const baseName = getBaseTestName(fullName);
    const suite =
      test.suite && test.suite.length > 0 ? test.suite[0] : "unknown";
    const key = `${suite}::${baseName}`;

    // Extract mode from the test name (e.g., "(async, streaming)")
    const modeMatch = fullName.match(/\(([^)]+)\)$/);
    const mode = modeMatch ? modeMatch[1] : "default";

    if (!testMap.has(key)) {
      testMap.set(key, {
        passed: 0,
        failed: 0,
        skipped: 0,
        other: 0,
        total: 0,
        variations: [],
      });
    }

    const result = testMap.get(key)!;
    result.total++;
    result.variations.push({ mode, status: test.status });

    switch (test.status) {
      case "passed":
        result.passed++;
        break;
      case "failed":
        result.failed++;
        break;
      case "skipped":
        result.skipped++;
        break;
      default:
        result.other++;
    }
  }

  return html`
    <h2>${title}</h2>
    <table class="matrix">
      <thead>
        <tr>
          <th>SDK</th>
          ${testCases.map((caseId) => html`<th>${caseId}</th>`)}
        </tr>
      </thead>
      <tbody>
        ${sdks.map(
          (sdk) => html`
            <tr>
              <td class="sdk-name">${sdk}</td>
              ${testCases.map((caseId) => {
                const key = `${sdk}::${caseId}`;
                const result = testMap.get(key);

                if (!result) {
                  return html`<td class="status-not-run">-</td>`;
                }

                return CombinedStatusCell({ result });
              })}
            </tr>
          `,
        )}
      </tbody>
    </table>
  `;
}

/**
 * Build test matrices split by type (LLM and Agent)
 */
function TestMatrix({ report }: { report: Report }) {
  return html`
    ${TestMatrixByType({
      tests: report.results.tests,
      testType: "llm",
      title: "LLM Tests",
    })}
    ${TestMatrixByType({
      tests: report.results.tests,
      testType: "agent",
      title: "Agent Tests",
    })}
  `;
}

/**
 * Render spans as JSON for display
 */
function formatSpans(spans: unknown[]): string {
  return JSON.stringify(spans, null, 2);
}

/**
 * Failed tests details section
 */
function FailedTestsDetails({ tests }: { tests: Test[] }) {
  const failedTests = tests.filter((t) => t.status === "failed");

  if (failedTests.length === 0) {
    return html``;
  }

  return html`
    <h2>Failed Tests Details</h2>
    ${failedTests.map((test) => {
      const caseId = test.name.split(" :: ")[1] || test.name;
      const extra = test.extra as Record<string, unknown> | undefined;
      const spans = extra?.spans as unknown[] | undefined;
      const spanCount = extra?.spanCount as number | undefined;

      return html`
        <details class="failed-test">
          <summary>
            <span class="failed-icon">✗</span>
            <strong
              >${test.suite && test.suite.length > 0
                ? test.suite[0]
                : "unknown"}</strong
            >
            :: ${caseId}
            <span class="duration">(${test.duration}ms)</span>
          </summary>
          <div class="error-details">
            ${test.trace
              ? html`
                  <div class="error-trace">
                    <strong>Details:</strong>
                    <pre>${test.trace}</pre>
                  </div>
                `
              : ""}
            ${spans && spans.length > 0
              ? html`
                  <details class="spans-section">
                    <summary class="spans-toggle">
                      <span class="spans-icon">{}</span>
                      Captured Spans (${spanCount || spans.length})
                    </summary>
                    <pre class="spans-json">${formatSpans(spans)}</pre>
                  </details>
                `
              : spanCount === 0
                ? html`<div class="no-spans">No spans captured</div>`
                : ""}
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
  const title = "Sentry AI SDK Test Report";
  const timestamp = new Date(report.results.summary.stop).toLocaleString();

  const htmlContent = html`
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>${title}</title>
        <style>
          * {
            box-sizing: border-box;
          }
          body {
            font-family:
              -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
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
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
          }
          h1 {
            margin: 0 0 10px 0;
            color: #333;
          }
          .timestamp {
            color: #666;
            font-size: 14px;
            margin-bottom: 30px;
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
          .matrix td.status-partial {
            background: #fff3e0;
            color: #e65100;
            font-weight: bold;
          }
          .matrix td.multi-status {
            padding: 4px;
          }
          .status-grid {
            display: flex;
            flex-wrap: wrap;
            gap: 2px;
            justify-content: center;
            align-items: center;
          }
          .mini-status {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 18px;
            height: 18px;
            font-size: 10px;
            border-radius: 3px;
          }
          .mini-status.status-passed {
            background: #c8e6c9;
            color: #2e7d32;
          }
          .mini-status.status-failed {
            background: #ffcdd2;
            color: #c62828;
          }
          .mini-status.status-skipped {
            background: #fff9c4;
            color: #f57f17;
          }
          .mini-status.status-other {
            background: #e0e0e0;
            color: #666;
          }
          .spans-section {
            margin-top: 15px;
            border: 1px solid #e0e0e0;
            border-radius: 4px;
          }
          .spans-toggle {
            padding: 10px 15px;
            cursor: pointer;
            background: #f0f4f8;
            user-select: none;
            font-weight: 500;
            color: #1976d2;
          }
          .spans-toggle:hover {
            background: #e3f2fd;
          }
          .spans-icon {
            font-family: monospace;
            font-weight: bold;
            margin-right: 8px;
            color: #1976d2;
          }
          .spans-section[open] .spans-toggle {
            border-bottom: 1px solid #e0e0e0;
          }
          .spans-json {
            margin: 0;
            padding: 15px;
            background: #263238;
            color: #aed581;
            font-size: 12px;
            max-height: 400px;
            overflow: auto;
            border-radius: 0 0 4px 4px;
          }
          .no-spans {
            margin-top: 15px;
            padding: 10px 15px;
            background: #fff3e0;
            color: #e65100;
            border-radius: 4px;
            font-style: italic;
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
          <p class="timestamp">Generated: ${timestamp}</p>
          ${SummaryCards({ summary: report.results.summary })}
          ${TestMatrix({ report })}
          ${FailedTestsDetails({ tests: report.results.tests })}
        </div>
      </body>
    </html>
  `;

  // vhtml returns mixed content: strings for HTML tags, and arrays for special elements like DOCTYPE
  // The structure is typically: ["!DOCTYPE", attrs, "<html>...</html>"]
  function flattenToString(value: unknown): string {
    if (typeof value === "string") {
      return value;
    }
    if (Array.isArray(value)) {
      // Check if this is a DOCTYPE declaration
      if (value[0] === "!DOCTYPE") {
        // DOCTYPE + rest of HTML
        return (
          "<!DOCTYPE html>\n" + value.slice(2).map(flattenToString).join("")
        );
      }
      // Regular array, flatten all elements
      return value.map(flattenToString).join("");
    }
    if (typeof value === "object" && value !== null) {
      // Skip objects (like attributes)
      return "";
    }
    return String(value);
  }

  return flattenToString(htmlContent);
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
 * Write HTML report to file
 */
export async function writeHTMLReport(
  htmlContent: string,
  outputDir: string = "./test-results",
  timestamp?: string,
): Promise<string> {
  // Ensure output directory exists
  await mkdir(outputDir, { recursive: true });

  const ts = timestamp || getTimestamp();
  const filePath = join(outputDir, `test-report-${ts}.html`);
  await writeFile(filePath, htmlContent, "utf-8");

  return filePath;
}
