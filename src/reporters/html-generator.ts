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
 * Check result entry from the extra data
 */
interface ReportCheckResult {
  name: string;
  status: "passed" | "failed" | "skipped";
  severity?: "critical" | "normal" | "warning";
  error?: string;
  skipReason?: string;
  errorLocations?: Array<{
    spanId: string;
    attribute?: string;
    message: string;
  }>;
  deprecationWarnings?: Array<{
    spanId: string;
    attribute?: string;
    message: string;
  }>;
}

/**
 * Escape HTML special characters to prevent XSS in pre-rendered HTML strings
 */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Render a single span as JSON with optional attribute highlighting.
 */
function renderSpanJson(span: unknown, highlightAttrs?: Set<string>): string {
  const spanJson = JSON.stringify(span, null, 2);
  if (!highlightAttrs || highlightAttrs.size === 0) {
    return escapeHtml(spanJson);
  }
  return spanJson.split("\n").map((line) => {
    for (const attr of highlightAttrs) {
      const escaped = attr.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      if (new RegExp(`^\\s*"${escaped}"\\s*:`).test(line)) {
        return `<span class="highlight-error">${escapeHtml(line)}</span>`;
      }
    }
    return escapeHtml(line);
  }).join("\n");
}

/**
 * Render check results breakdown.
 *
 * Failed checks show the error message. Error locations are grouped by spanId;
 * each group has a toggle icon to show/hide that span's JSON with failing
 * attributes highlighted.
 */
/**
 * Render a single failed check result with its error locations grouped by span.
 */
function FailedCheckDetail({
  cr,
  spanById,
}: {
  cr: ReportCheckResult;
  spanById: Map<string, unknown>;
}) {
  const severity = cr.severity || "normal";
  const icon = severity === "critical" ? "❗" : severity === "warning" ? "⚠" : "✗";

  const groups = new Map<string, typeof cr.errorLocations>();
  if (cr.errorLocations) {
    for (const loc of cr.errorLocations) {
      if (!groups.has(loc.spanId)) groups.set(loc.spanId, []);
      groups.get(loc.spanId)!.push(loc);
    }
  }

  return html`<div class="check-result check-failed check-severity-${severity}">
    <span class="check-icon">${icon}</span>
    <span class="check-name">${cr.name}</span>
    ${cr.error ? html`<div class="check-error-msg">${cr.error}</div>` : ""}
    ${groups.size > 0
      ? html`<div class="check-locations">
          ${[...groups.entries()].map(([spanId, locs]) => {
            const highlightAttrs = new Set<string>();
            for (const loc of locs!) {
              if (loc.attribute) highlightAttrs.add(loc.attribute);
            }
            const span = spanById.get(spanId);
            return html`<div class="span-group">
              <div class="span-group-header">
                <span class="loc-span">${spanId.substring(0, 8)}</span>
                ${span
                  ? html`<button class="show-span-btn" onclick="toggleSpanPreview(this)" title="Show/hide span JSON" dangerouslySetInnerHTML=${{ __html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>' }}></button>`
                  : ""}
              </div>
              <div class="span-group-errors">
                ${locs!.map(
                  (loc) => html`<div class="check-location">
                    ${loc.attribute ? html`<span class="loc-attr">${loc.attribute}</span>` : ""}
                    <span class="loc-msg">${loc.message}</span>
                  </div>`,
                )}
              </div>
              ${span
                ? html`<pre class="span-preview" style="display:none" dangerouslySetInnerHTML=${{ __html: renderSpanJson(span, highlightAttrs) }}></pre>`
                : ""}
            </div>`;
          })}
        </div>`
      : ""}
  </div>`;
}

function CheckResultsBreakdown({
  checkResults,
  spans,
}: {
  checkResults: ReportCheckResult[];
  spans: unknown[] | undefined;
}) {
  if (!checkResults || checkResults.length === 0) return "";

  // Index spans by span_id for quick lookup
  const spanById = new Map<string, unknown>();
  if (spans) {
    for (const s of spans) {
      const id = (s as Record<string, unknown>).span_id as string | undefined;
      if (id) spanById.set(id, s);
    }
  }

  // Split checks by severity, keeping original order within each group
  const severityOrder: Array<"critical" | "normal" | "warning"> = ["critical", "normal", "warning"];
  const groups: Record<string, ReportCheckResult[]> = { critical: [], normal: [], warning: [] };
  for (const cr of checkResults) {
    const sev = cr.severity || "normal";
    groups[sev].push(cr);
  }

  const sections = severityOrder
    .filter((sev) => groups[sev].length > 0)
    .map((sev) => {
      const label = sev === "critical" ? "Critical" : sev === "warning" ? "Warnings" : "Checks";
      const items = groups[sev].map((cr) => {
        if (cr.status === "passed") {
          const hasDeprecations = cr.deprecationWarnings && cr.deprecationWarnings.length > 0;
          return html`<div class="check-result check-passed ${hasDeprecations ? 'check-with-deprecations' : ''}">
            <span class="check-icon">✓</span>
            <span class="check-name">${cr.name}</span>
            ${hasDeprecations
              ? html`<span class="deprecation-badge" title="${cr.deprecationWarnings!.length} deprecation warning(s)">
                  ⚠ ${cr.deprecationWarnings!.length}
                </span>`
              : ""}
            ${hasDeprecations
              ? html`<div class="deprecation-details">
                  <div class="deprecation-label">Deprecation Warnings:</div>
                  ${Array.from(
                    new Map(
                      cr.deprecationWarnings!.filter((w) => w.attribute).map((w) => [
                        w.attribute!,
                        cr.deprecationWarnings!.filter((x) => x.attribute === w.attribute),
                      ]),
                    ).entries(),
                  ).map(
                    ([attr, warnings]) => html`<div class="deprecation-item">
                      <code>${attr}</code> (${warnings.length} span${warnings.length > 1 ? "s" : ""})
                      <div class="deprecation-message">${warnings[0].message}</div>
                    </div>`,
                  )}
                </div>`
              : ""}
          </div>`;
        } else if (cr.status === "skipped") {
          return html`<div class="check-result check-skipped">
            <span class="check-icon">○</span>
            <span class="check-name">${cr.name}</span>
            ${cr.skipReason ? html`<span class="check-skip-reason">(${cr.skipReason})</span>` : ""}
          </div>`;
        } else {
          return FailedCheckDetail({ cr, spanById });
        }
      });

      return html`<div class="check-section check-section-${sev}">
        <div class="check-section-label">${label}</div>
        ${items}
      </div>`;
    });

  return html`<div class="check-results-breakdown">
    ${sections}
  </div>`;
}

/**
 * Check if a test has any deprecation warnings in its check results
 */
function hasDeprecationWarnings(test: Test): boolean {
  const extra = test.extra as Record<string, unknown> | undefined;
  const checkResults = extra?.checkResults as ReportCheckResult[] | undefined;
  if (!checkResults) return false;
  return checkResults.some(
    (cr) => cr.deprecationWarnings && cr.deprecationWarnings.length > 0,
  );
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
      const checkResults = extra?.checkResults as ReportCheckResult[] | undefined;

      // Count failures by severity for summary badges
      const severityCounts = { critical: 0, normal: 0, warning: 0 };
      if (checkResults) {
        for (const cr of checkResults) {
          if (cr.status === "failed") {
            const sev = cr.severity || "normal";
            severityCounts[sev]++;
          }
        }
      }

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
            <span class="severity-badges">
              ${severityCounts.critical > 0
                ? html`<span class="sev-badge sev-badge-critical">${"❗"} ${severityCounts.critical}</span>`
                : ""}
              ${severityCounts.normal > 0
                ? html`<span class="sev-badge sev-badge-normal">${"✗"} ${severityCounts.normal}</span>`
                : ""}
              ${severityCounts.warning > 0
                ? html`<span class="sev-badge sev-badge-warning">${"⚠"} ${severityCounts.warning}</span>`
                : ""}
            </span>
            <span class="duration">(${test.duration}ms)</span>
          </summary>
          <div class="error-details">
            ${checkResults && checkResults.length > 0
              ? CheckResultsBreakdown({ checkResults, spans })
              : test.trace
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
                    <pre class="spans-json">${JSON.stringify(spans, null, 2)}</pre>
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
 * Deprecation warnings section - shows passed tests that use deprecated attributes
 */
function DeprecationWarningsSection({ tests }: { tests: Test[] }) {
  const testsWithDeprecations = tests.filter(
    (t) => t.status !== "failed" && hasDeprecationWarnings(t),
  );

  if (testsWithDeprecations.length === 0) {
    return html``;
  }

  return html`
    <h2>Deprecation Warnings (${testsWithDeprecations.length} test${testsWithDeprecations.length > 1 ? "s" : ""})</h2>
    <p class="deprecation-section-desc">These tests passed but use deprecated attributes that should be migrated to newer OpenTelemetry conventions.</p>
    ${testsWithDeprecations.map((test) => {
      const caseId = test.name.split(" :: ")[1] || test.name;
      const extra = test.extra as Record<string, unknown> | undefined;
      const checkResults = extra?.checkResults as ReportCheckResult[] | undefined;

      // Only include checks that have deprecation warnings
      const checksWithWarnings = (checkResults || []).filter(
        (cr) => cr.deprecationWarnings && cr.deprecationWarnings.length > 0,
      );

      return html`
        <details class="deprecation-test">
          <summary>
            <span class="deprecation-icon">⚠</span>
            <strong
              >${test.suite && test.suite.length > 0
                ? test.suite[0]
                : "unknown"}</strong
            >
            :: ${caseId}
            <span class="deprecation-badge">${checksWithWarnings.reduce((sum, cr) => sum + (cr.deprecationWarnings?.length || 0), 0)} warning${checksWithWarnings.reduce((sum, cr) => sum + (cr.deprecationWarnings?.length || 0), 0) !== 1 ? "s" : ""}</span>
          </summary>
          <div class="deprecation-test-details">
            ${checksWithWarnings.map(
              (cr) => html`<div class="check-result check-passed check-with-deprecations">
                <span class="check-icon">✓</span>
                <span class="check-name">${cr.name}</span>
                <div class="deprecation-details">
                  ${Array.from(
                    new Map(
                      cr.deprecationWarnings!.filter((w) => w.attribute).map((w) => [
                        w.attribute!,
                        cr.deprecationWarnings!.filter((x) => x.attribute === w.attribute),
                      ]),
                    ).entries(),
                  ).map(
                    ([attr, warnings]) => html`<div class="deprecation-item">
                      <code>${attr}</code> (${warnings.length} span${warnings.length > 1 ? "s" : ""})
                      <div class="deprecation-message">${warnings[0].message}</div>
                    </div>`,
                  )}
                </div>
              </div>`,
            )}
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
          .severity-badges {
            display: inline-flex;
            gap: 6px;
            margin-left: 8px;
            vertical-align: middle;
          }
          .sev-badge {
            display: inline-flex;
            align-items: center;
            gap: 3px;
            font-size: 11px;
            font-weight: 600;
            padding: 1px 7px;
            border-radius: 10px;
            line-height: 1.4;
          }
          .sev-badge-critical {
            background: #ffcdd2;
            color: #b71c1c;
          }
          .sev-badge-normal {
            background: #ffcdd2;
            color: #c62828;
          }
          .sev-badge-warning {
            background: #fff3e0;
            color: #e65100;
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
          /* Check results breakdown */
          .check-results-breakdown {
            margin: 10px 0 15px 0;
          }
          .check-section {
            margin-bottom: 8px;
            padding: 8px 12px;
            border: 1px solid #e0e0e0;
            border-radius: 4px;
            background: #fafafa;
          }
          .check-section-label {
            font-size: 11px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 4px;
            color: #888;
          }
          .check-section-critical {
            border-color: #ef9a9a;
            background: #fff5f5;
          }
          .check-section-critical .check-section-label {
            color: #b71c1c;
          }
          .check-section-warning {
            border-color: #ffe082;
            background: #fffde7;
          }
          .check-section-warning .check-section-label {
            color: #f57f17;
          }
          .check-result {
            padding: 4px 0 4px 8px;
            font-size: 13px;
            border-left: 3px solid transparent;
            margin: 2px 0;
          }
          .check-result .check-icon {
            display: inline-block;
            width: 16px;
            font-weight: bold;
          }
          .check-result .check-name {
            font-family: monospace;
            font-size: 12px;
          }
          .check-passed {
            border-left-color: #4caf50;
          }
          .check-passed .check-icon {
            color: #2e7d32;
          }
          .check-skipped {
            border-left-color: #ffc107;
          }
          .check-skipped .check-icon {
            color: #f57f17;
          }
          .check-skip-reason {
            color: #999;
            font-size: 12px;
            margin-left: 8px;
          }
          .check-failed {
            border-left-color: #f44336;
            background: #fff8f8;
          }
          .check-failed .check-icon {
            color: #c62828;
          }
          .check-failed .check-name {
            font-weight: 600;
          }
          .check-severity-critical {
            border-left-color: #b71c1c;
            background: #ffebee;
          }
          .check-severity-critical .check-icon {
            color: #b71c1c;
          }
          .check-severity-warning {
            border-left-color: #f9a825;
            background: #fffde7;
          }
          .check-severity-warning .check-icon {
            color: #f57f17;
          }
          .check-with-deprecations {
            border-left-color: #ff9800;
          }
          .deprecation-badge {
            display: inline-block;
            background: #fff3e0;
            color: #e65100;
            padding: 2px 6px;
            border-radius: 3px;
            font-size: 11px;
            margin-left: 8px;
            font-weight: 600;
          }
          .deprecation-details {
            margin: 8px 0 4px 24px;
            padding: 8px;
            background: #fffdf7;
            border: 1px solid #ffe0b2;
            border-radius: 4px;
            font-size: 12px;
          }
          .deprecation-label {
            font-weight: 600;
            color: #e65100;
            margin-bottom: 6px;
          }
          .deprecation-item {
            margin: 4px 0;
            padding: 4px 0;
          }
          .deprecation-item code {
            background: #fff;
            padding: 2px 4px;
            border-radius: 2px;
            border: 1px solid #ddd;
            font-size: 11px;
            color: #d84315;
          }
          .deprecation-message {
            color: #666;
            margin-top: 2px;
            font-style: italic;
          }
          .deprecation-section-desc {
            color: #666;
            font-size: 14px;
            margin: -10px 0 15px 0;
          }
          .deprecation-test {
            margin: 15px 0;
            border: 1px solid #ffe0b2;
            border-radius: 4px;
          }
          .deprecation-test summary {
            padding: 15px;
            cursor: pointer;
            background: #fffdf7;
            user-select: none;
          }
          .deprecation-test summary:hover {
            background: #fff8e1;
          }
          .deprecation-test[open] summary {
            border-bottom: 1px solid #ffe0b2;
          }
          .deprecation-icon {
            color: #e65100;
            margin-right: 8px;
          }
          .deprecation-test-details {
            padding: 15px;
          }
          .check-error-msg {
            margin: 4px 0 4px 24px;
            font-size: 12px;
            color: #888;
            white-space: pre-wrap;
            font-family: monospace;
            max-height: 120px;
            overflow: auto;
          }
          .check-locations {
            margin: 6px 0 2px 24px;
            font-size: 12px;
          }
          .span-group {
            margin: 4px 0;
            border: 1px solid #e0e0e0;
            border-radius: 4px;
            overflow: hidden;
          }
          .span-group-header {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 4px 8px;
            background: #f5f5f5;
            border-bottom: 1px solid #e0e0e0;
            justify-content: space-between;
          }
          .span-group-errors {
            padding: 2px 8px;
          }
          .check-location {
            padding: 2px 0;
            font-family: monospace;
            display: flex;
            gap: 8px;
            align-items: baseline;
            flex-wrap: wrap;
          }
          .loc-span {
            color: #1565c0;
            font-weight: 600;
            font-family: monospace;
            font-size: 12px;
            white-space: nowrap;
          }
          .loc-attr {
            color: #c62828;
            font-weight: 600;
            white-space: nowrap;
          }
          .loc-msg {
            color: #555;
            flex: 1;
          }
          .show-span-btn {
            width: 22px;
            height: 22px;
            padding: 0;
            background: none;
            border: 1px solid #90caf9;
            border-radius: 3px;
            cursor: pointer;
            flex-shrink: 0;
            color: #1565c0;
            display: inline-flex;
            align-items: center;
            justify-content: center;
          }
          .show-span-btn svg {
            width: 14px;
            height: 14px;
          }
          .show-span-btn:hover {
            background: #e3f2fd;
          }
          .show-span-btn.open {
            background: #bbdefb;
          }
          .span-preview {
            margin: 0;
            padding: 10px 15px;
            background: #263238;
            color: #aed581;
            font-size: 12px;
            border-radius: 0;
            overflow-x: auto;
            max-height: 300px;
          }
          .span-preview .highlight-error {
            background: rgba(244, 67, 54, 0.25);
            display: inline-block;
            width: 100%;
            margin: 0 -15px;
            padding: 0 15px;
            border-left: 3px solid #f44336;
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
          ${DeprecationWarningsSection({ tests: report.results.tests })}
        </div>
        <script dangerouslySetInnerHTML=${{ __html: `
          function toggleSpanPreview(btn) {
            var group = btn.closest('.span-group');
            if (!group) return;
            var pre = group.querySelector('.span-preview');
            if (!pre) return;
            var showing = pre.style.display !== 'none';
            pre.style.display = showing ? 'none' : 'block';
            btn.classList.toggle('open', !showing);
          }
        ` }}></script>
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
