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

// ---------------------------------------------------------------------------
// Utility functions
// ---------------------------------------------------------------------------

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60000);
  const s = Math.round((ms % 60000) / 1000);
  return `${m}m ${s}s`;
}

function getStatusIcon(status: string): string {
  switch (status) {
    case "passed":
      return "\u2713";
    case "failed":
      return "\u2717";
    case "timeout":
      return "\u23F1";
    case "skipped":
      return "\u25CB";
    case "error":
      return "\u26D4";
    default:
      return "-";
  }
}

function naturalSortCompare(a: string, b: string): number {
  const aMatch = a.match(/^(\d+)/);
  const bMatch = b.match(/^(\d+)/);
  if (aMatch && bMatch) {
    const aNum = parseInt(aMatch[1], 10);
    const bNum = parseInt(bMatch[1], 10);
    if (aNum !== bNum) return aNum - bNum;
    return a.localeCompare(b);
  }
  if (aMatch) return -1;
  if (bMatch) return 1;
  return a.localeCompare(b);
}

function getBaseTestName(testName: string): string {
  return testName.replace(/\s*\([^)]*\)\s*$/, "").trim();
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

interface CombinedTestResult {
  passed: number;
  failed: number;
  skipped: number;
  other: number;
  total: number;
  variations: Array<{ mode: string; status: string }>;
}

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
}

interface ReportAuditedAttribute {
  attribute: string;
  status: "known" | "deprecated" | "unknown";
  replacement?: string;
  message: string;
  spanIds: string[];
}

interface ReportAttributeAudit {
  totalAttributes: number;
  knownAttributes: ReportAuditedAttribute[];
  deprecatedAttributes: ReportAuditedAttribute[];
  unknownAttributes: ReportAuditedAttribute[];
}

// ---------------------------------------------------------------------------
// CSS
// ---------------------------------------------------------------------------

const FONT_LINK = `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">`;

const STYLES = `
  :root {
    --bg: #ffffff;
    --bg-alt: #f6f8fa;
    --bg-hover: #eef1f5;
    --text: #1a1a2e;
    --text-secondary: #656d76;
    --text-muted: #8b949e;
    --border: rgba(0,0,0,0.1);
    --border-heavy: rgba(0,0,0,0.15);
    --pass: #3fb950;
    --pass-bg: rgba(63,185,80,0.08);
    --pass-border: rgba(63,185,80,0.3);
    --fail: #f85149;
    --fail-bg: rgba(248,81,73,0.08);
    --fail-border: rgba(248,81,73,0.3);
    --warn: #d29922;
    --warn-bg: rgba(210,153,34,0.08);
    --warn-border: rgba(210,153,34,0.3);
    --skip: #8b949e;
    --skip-bg: rgba(139,148,158,0.08);
    --mono: 'JetBrains Mono', 'Fira Code', 'SF Mono', 'Cascadia Code', 'Consolas', monospace;
    --sans: 'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif;
    --radius: 4px;
    --radius-lg: 6px;
    --transition: 150ms ease;
  }

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: var(--sans);
    background: var(--bg-alt);
    color: var(--text);
    font-size: 14px;
    line-height: 1.5;
    -webkit-font-smoothing: antialiased;
  }

  /* ---- Nav Bar ---- */
  .topnav {
    display: flex; align-items: center; padding: 0 24px; height: 42px;
    background: var(--bg); border-bottom: 1px solid var(--border);
    position: sticky; top: 0; z-index: 100;
  }
  .topnav-title {
    font-weight: 700; font-size: 13px; color: var(--text);
    letter-spacing: -0.01em; white-space: nowrap; font-family: var(--mono);
  }
  .topnav-links { display: flex; margin-left: 32px; height: 100%; }
  .topnav-link {
    display: flex; align-items: center; padding: 0 14px;
    font-size: 13px; font-weight: 500; color: var(--text-secondary);
    text-decoration: none; border-bottom: 2px solid transparent;
    transition: color var(--transition), border-color var(--transition);
  }
  .topnav-link:hover { color: var(--text); }
  .topnav-link.active { color: var(--text); border-bottom-color: var(--text); }
  .topnav-meta {
    margin-left: auto; font-size: 12px; color: var(--text-muted); font-family: var(--mono);
  }

  /* ---- Summary Bar ---- */
  .summary-bar {
    background: var(--bg); border-bottom: 1px solid var(--border); padding: 14px 24px 0;
  }
  .summary-stats {
    display: flex; align-items: baseline; gap: 24px; flex-wrap: wrap; padding-bottom: 12px;
  }
  .stat { display: flex; align-items: baseline; gap: 6px; }
  .stat-value {
    font-family: var(--mono); font-size: 20px; font-weight: 700;
    color: var(--text); line-height: 1;
  }
  .stat-label {
    font-size: 12px; color: var(--text-muted); text-transform: uppercase;
    letter-spacing: 0.03em; font-weight: 500;
  }
  .stat-passed .stat-value { color: var(--pass); }
  .stat-failed .stat-value { color: var(--fail); }
  .stat-skipped .stat-value { color: var(--warn); }

  .status-track {
    height: 4px; border-radius: 2px; background: var(--bg-alt);
    overflow: hidden; display: flex;
  }
  .status-fill-pass { background: var(--pass); }
  .status-fill-fail { background: var(--fail); }
  .status-fill-skip { background: var(--warn); }
  .status-fill-error { background: var(--skip); }

  /* ---- Main Content ---- */
  .main { max-width: 1400px; margin: 0 auto; padding: 20px 24px 48px; }

  /* ---- Section Headers ---- */
  .section-title {
    font-family: var(--sans); font-size: 14px; font-weight: 700;
    color: var(--text); margin: 28px 0 10px; letter-spacing: -0.01em;
  }
  .section-title:first-child { margin-top: 0; }

  /* ---- Matrix ---- */
  .matrix {
    width: 100%; border-collapse: collapse; font-size: 13px;
    background: var(--bg);
  }
  .matrix th, .matrix td {
    border: 1px solid var(--border); padding: 8px 6px; text-align: center;
  }
  .matrix th {
    background: var(--text); color: #fff; font-weight: 600; font-size: 12px;
    font-family: var(--mono); padding: 6px 8px;
  }
  .matrix .sdk-name {
    text-align: left; font-weight: 600; background: var(--bg-alt);
    font-family: var(--mono); font-size: 12px; white-space: nowrap;
  }
  .matrix td.status-passed { background: var(--pass-bg); color: var(--pass); font-weight: 700; }
  .matrix td.status-failed { background: var(--fail-bg); color: var(--fail); font-weight: 700; }
  .matrix td.status-timeout { background: var(--warn-bg); color: var(--warn); font-weight: 700; }
  .matrix td.status-skipped { background: var(--skip-bg); color: var(--skip); }
  .matrix td.status-not-run { background: var(--bg-alt); color: var(--text-muted); }
  .matrix td.status-partial { background: var(--warn-bg); color: var(--warn); font-weight: 700; }
  .matrix td.multi-status { padding: 3px; }
  .status-grid {
    display: flex; flex-wrap: wrap; gap: 2px; justify-content: center; align-items: center;
  }
  .mini-status {
    display: inline-flex; align-items: center; justify-content: center;
    width: 18px; height: 18px; font-size: 11px; border-radius: 3px; font-weight: 700;
  }
  .mini-status.status-passed { background: var(--pass-bg); color: var(--pass); }
  .mini-status.status-failed { background: var(--fail-bg); color: var(--fail); }
  .mini-status.status-timeout { background: var(--warn-bg); color: var(--warn); }
  .mini-status.status-skipped { background: var(--skip-bg); color: var(--skip); }
  .mini-status.status-other { background: var(--bg-alt); color: var(--text-muted); }
  .matrix td.status-error { background: var(--skip-bg); color: var(--skip); }
  .mini-status.status-error { background: var(--skip-bg); color: var(--skip); }

  /* ---- Failed Tests Details ---- */
  .failed-test {
    margin: 8px 0; border: 1px solid var(--border);
    border-radius: var(--radius-lg); overflow: hidden; background: var(--bg);
  }
  .failed-test.timeout-test { border-color: var(--warn-border); }
  .timeout-test .failed-icon { color: var(--warn); }
  .failed-test summary {
    padding: 10px 14px; cursor: pointer; background: var(--bg);
    user-select: none; font-size: 13px; transition: background var(--transition);
    display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
  }
  .failed-test summary:hover { background: var(--bg-hover); }
  .failed-test[open] summary { border-bottom: 1px solid var(--border); }
  .failed-icon { color: var(--fail); flex-shrink: 0; font-family: var(--mono); font-variant-emoji: text; }
  .failed-test summary strong { font-family: var(--mono); font-size: 12px; }

  .severity-badges { display: inline-flex; gap: 4px; margin-left: 4px; }
  .sev-badge {
    display: inline-flex; align-items: center; gap: 2px;
    font-size: 11px; font-weight: 700; padding: 1px 5px;
    border-radius: var(--radius); line-height: 1.4; font-family: var(--mono);
    text-rendering: geometricPrecision;
  }
  .sev-badge .sev-icon {
    font-family: var(--mono);
    font-style: normal;
    font-variant-emoji: text;
  }
  .sev-badge-timeout { background: var(--warn-bg); color: var(--warn); border: 1px solid var(--warn-border); }
  .sev-badge-critical { background: var(--fail-bg); color: #d1242f; border: 1px solid var(--fail-border); }
  .sev-badge-normal { background: var(--fail-bg); color: var(--fail); border: 1px solid var(--fail-border); }
  .sev-badge-warning { background: var(--warn-bg); color: var(--warn); border: 1px solid var(--warn-border); }
  .duration { color: var(--text-muted); font-size: 12px; font-family: var(--mono); margin-left: auto; }

  .error-details { padding: 12px 14px; }

  /* ---- Check Results ---- */
  .check-results-breakdown { margin: 8px 0 12px; }
  .check-section {
    margin-bottom: 10px; padding: 0;
    border: none; background: none;
  }
  .check-section-critical { }
  .check-section-critical .check-section-label { color: var(--fail); }
  .check-section-warning { }
  .check-section-warning .check-section-label { color: var(--warn); }
  .check-section-label {
    font-size: 11px; font-weight: 600; text-transform: uppercase;
    letter-spacing: 0.05em; color: var(--text-muted); margin-bottom: 2px;
    padding-bottom: 2px; border-bottom: 1px solid var(--border);
  }
  .check-result {
    padding: 4px 0 4px 10px; font-size: 13px;
    border-left: 2px solid transparent; margin: 0; line-height: 1.4;
  }
  .check-icon {
    display: inline-block; width: 14px; font-weight: 700; font-size: 12px;
    font-family: var(--mono); font-variant-emoji: text;
  }
  .check-name { font-family: var(--mono); font-size: 12px; }
  .check-passed { border-left-color: var(--pass); }
  .check-passed .check-icon { color: var(--pass); }
  .check-skipped { border-left-color: var(--warn); }
  .check-skipped .check-icon { color: var(--warn); }
  .check-skip-reason { color: var(--text-muted); font-size: 12px; margin-left: 6px; }
  .check-failed { border-left-color: var(--fail); }
  .check-failed .check-icon { color: var(--fail); }
  .check-failed .check-name { font-weight: 600; }
  .check-severity-critical { border-left-color: #d1242f; }
  .check-severity-critical .check-icon { color: #d1242f; }
  .check-severity-warning { border-left-color: var(--warn); }
  .check-severity-warning .check-icon { color: var(--warn); }

  .check-error-msg {
    margin: 2px 0 2px 26px; font-size: 12px; color: var(--text-muted);
    white-space: pre-wrap; font-family: var(--mono);
    max-height: 100px; overflow: auto; line-height: 1.5;
  }
  .check-locations { margin: 4px 0 2px 26px; font-size: 12px; }
  .span-group {
    margin: 2px 0; overflow: hidden; background: var(--bg);
  }
  .span-group-header {
    display: flex; align-items: center; gap: 8px; padding: 2px 0;
    justify-content: space-between;
  }
  .span-group-errors { padding: 0; }
  .check-location {
    padding: 1px 0; font-family: var(--mono); display: flex;
    gap: 6px; align-items: baseline; flex-wrap: wrap; font-size: 12px;
  }
  .loc-span { color: #1565c0; font-weight: 600; font-family: var(--mono); font-size: 12px; white-space: nowrap; }
  .loc-attr { color: var(--fail); font-weight: 600; white-space: nowrap; }
  .loc-msg { color: var(--text-secondary); flex: 1; }

  .span-view-row { margin: 2px 0 4px; }
  .show-span-btn {
    padding: 2px 8px; background: none;
    border: 1px solid var(--border); border-radius: var(--radius);
    cursor: pointer; color: var(--text-muted);
    font-size: 11px; font-family: var(--mono); font-weight: 500;
    transition: background var(--transition), color var(--transition);
  }
  .show-span-btn:hover { background: var(--bg-alt); color: var(--text-secondary); }
  .show-span-btn.open { background: var(--bg-alt); color: var(--text); border-color: var(--border-heavy); }
  .span-preview {
    margin: 4px 0; padding: 10px 14px;
    background: #1a1b26; color: #a9b1d6;
    font-size: 12px; font-family: var(--mono);
    overflow-x: auto; max-height: 250px; line-height: 1.6;
    border-radius: var(--radius);
  }
  .span-preview .highlight-error {
    background: rgba(248,81,73,0.15); display: inline-block; width: 100%;
    margin: 0 -14px; padding: 0 14px; border-left: 2px solid var(--fail);
  }

  /* JSON syntax highlighting */
  .j-key { color: #7aa2f7; }
  .j-str { color: #9ece6a; }
  .j-num { color: #ff9e64; }
  .j-bool { color: #bb9af7; }

  /* Spans section */
  .spans-section {
    margin-top: 10px; border: 1px solid var(--border);
    border-radius: var(--radius); overflow: hidden;
  }
  .spans-toggle {
    padding: 6px 12px; cursor: pointer; background: var(--bg);
    user-select: none; font-weight: 500; font-size: 12px; color: var(--text-secondary);
  }
  .spans-toggle:hover { background: var(--bg-hover); }
  .spans-icon { font-family: var(--mono); font-weight: 700; margin-right: 6px; }
  .spans-section[open] .spans-toggle { border-bottom: 1px solid var(--border); }
  .spans-json {
    margin: 0; padding: 12px 14px;
    background: #1a1b26; color: #a9b1d6;
    font-size: 12px; font-family: var(--mono);
    max-height: 350px; overflow: auto; line-height: 1.6;
  }
  .no-spans {
    margin-top: 8px; padding: 6px 12px;
    background: var(--warn-bg); color: var(--warn);
    border-radius: var(--radius); font-size: 12px; font-style: italic;
    border: 1px solid var(--warn-border);
  }

  /* ---- Filters ---- */
  .filter-bar {
    background: var(--bg); border: 1px solid var(--border); border-radius: var(--radius-lg);
    padding: 12px 16px; margin: 20px 0 4px; display: flex; align-items: center;
    gap: 10px; flex-wrap: wrap;
  }
  .filter-bar-label {
    font-size: 12px; font-weight: 600; color: var(--text-muted);
    text-transform: uppercase; letter-spacing: 0.04em; white-space: nowrap;
  }
  .filter-select {
    appearance: none; -webkit-appearance: none;
    background: var(--bg-alt) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%23656d76'/%3E%3C/svg%3E") no-repeat right 8px center;
    border: 1px solid var(--border); border-radius: var(--radius);
    padding: 5px 26px 5px 10px; font-size: 12px; font-family: var(--mono);
    color: var(--text); cursor: pointer; transition: border-color var(--transition);
    min-width: 100px;
  }
  .filter-select:hover { border-color: var(--border-heavy); }
  .filter-select:focus { outline: none; border-color: var(--text-muted); }
  .filter-reset {
    background: none; border: 1px solid var(--border); border-radius: var(--radius);
    padding: 5px 10px; font-size: 12px; font-family: var(--mono); color: var(--text-muted);
    cursor: pointer; transition: background var(--transition), color var(--transition);
    margin-left: auto;
  }
  .filter-reset:hover { background: var(--bg-alt); color: var(--text); }
  .filter-count {
    font-size: 11px; color: var(--text-muted); font-family: var(--mono);
  }
  .test-item-hidden { display: none !important; }
  .section-hidden { display: none !important; }

  /* ---- Setup Errors ---- */
  .setup-error {
    margin: 8px 0; border: 1px solid var(--skip);
    border-radius: var(--radius-lg); overflow: hidden; background: var(--bg);
  }
  .setup-error summary {
    padding: 10px 14px; cursor: pointer; background: var(--bg);
    user-select: none; font-size: 13px; transition: background var(--transition);
    display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
  }
  .setup-error summary:hover { background: var(--bg-hover); }
  .setup-error[open] summary { border-bottom: 1px solid var(--border); }
  .setup-error-icon { color: var(--skip); flex-shrink: 0; font-family: var(--mono); font-variant-emoji: text; }
  .setup-error summary strong { font-family: var(--mono); font-size: 12px; }
  .setup-error-details { padding: 12px 14px; }
  .setup-error-msg {
    font-size: 12px; color: var(--text-secondary);
    white-space: pre-wrap; font-family: var(--mono);
    max-height: 200px; overflow: auto; line-height: 1.5;
    background: var(--bg-alt); padding: 10px 14px;
    border-radius: var(--radius); border: 1px solid var(--border);
  }
  .sev-badge-error { background: var(--skip-bg); color: var(--skip); border: 1px solid var(--skip); }
  .stat-errors .stat-value { color: var(--skip); }

  /* ---- pre ---- */
  pre {
    background: var(--bg-alt); padding: 10px 14px; border-radius: var(--radius);
    overflow-x: auto; font-size: 12px; font-family: var(--mono); line-height: 1.5;
  }

  /* ---- Audit ---- */
  .audit-section-desc {
    color: var(--text-secondary); font-size: 13px; margin: -6px 0 12px;
  }
  .audit-section-desc code {
    font-family: var(--mono); background: var(--bg-alt); padding: 1px 4px;
    border-radius: 2px; font-size: 12px;
  }
  .audit-test {
    margin: 8px 0; border: 1px solid var(--warn-border);
    border-radius: var(--radius-lg); overflow: hidden;
  }
  .audit-test summary {
    padding: 10px 14px; cursor: pointer; background: var(--bg);
    user-select: none; font-size: 13px; transition: background var(--transition);
    display: flex; align-items: center; gap: 6px;
  }
  .audit-test summary:hover { background: var(--bg-hover); }
  .audit-test[open] summary { border-bottom: 1px solid var(--warn-border); }
  .audit-icon { color: var(--warn); flex-shrink: 0; font-family: var(--mono); font-variant-emoji: text; }
  .audit-test summary strong { font-family: var(--mono); font-size: 12px; }
  .audit-badge {
    display: inline-block; background: var(--warn-bg); color: var(--warn);
    padding: 1px 6px; border-radius: 3px; font-size: 11px;
    margin-left: 6px; font-weight: 600; border: 1px solid var(--warn-border);
  }
  .audit-test-details { padding: 12px 14px; }
  .audit-inline { margin: 10px 0; }
  .audit-group {
    margin: 8px 0; padding: 0; border: none; background: none;
  }
  .audit-group-deprecated .audit-group-label { color: var(--warn); }
  .audit-group-unknown .audit-group-label { color: var(--text-muted); }
  .audit-group-label {
    font-size: 11px; font-weight: 600; text-transform: uppercase;
    letter-spacing: 0.05em; margin-bottom: 2px;
    padding-bottom: 2px; border-bottom: 1px solid var(--border);
  }
  .audit-item { margin: 0; padding: 4px 0 4px 10px; }
  .audit-item-deprecated { border-left: 2px solid var(--warn); }
  .audit-item-unknown { border-left: 2px solid var(--skip); }
  .audit-attr {
    font-family: var(--mono); background: var(--bg); padding: 1px 4px;
    border-radius: 2px; border: 1px solid var(--border); font-size: 11px;
  }
  .audit-item-deprecated .audit-attr { color: var(--warn); }
  .audit-item-unknown .audit-attr { color: var(--text-secondary); }
  .audit-span-count { color: var(--text-muted); font-size: 11px; margin-left: 4px; }
  .audit-arrow { color: var(--pass); font-weight: 700; margin: 0 4px; }
  .audit-replacement {
    font-family: var(--mono); background: var(--pass-bg); padding: 1px 4px;
    border-radius: 2px; border: 1px solid var(--pass-border); font-size: 11px; color: var(--pass);
  }
  .audit-message { color: var(--text-muted); margin-top: 2px; font-size: 11px; font-style: italic; }

  /* ---- Warnings Section ---- */
  .warnings-section-desc {
    color: var(--text-secondary); font-size: 13px; margin: -6px 0 12px;
  }
  .warning-test {
    margin: 8px 0; border: 1px solid var(--warn-border);
    border-radius: var(--radius-lg); overflow: hidden;
  }
  .warning-test summary {
    padding: 10px 14px; cursor: pointer; background: var(--bg);
    user-select: none; font-size: 13px; transition: background var(--transition);
    display: flex; align-items: center; gap: 6px;
  }
  .warning-test summary:hover { background: var(--bg-hover); }
  .warning-test[open] summary { border-bottom: 1px solid var(--warn-border); }
  .warning-icon { color: var(--warn); flex-shrink: 0; font-family: var(--mono); font-variant-emoji: text; }
  .warning-test summary strong { font-family: var(--mono); font-size: 12px; }
  .warning-test-details { padding: 12px 14px; }
`;

// ---------------------------------------------------------------------------
// Span JSON rendering
// ---------------------------------------------------------------------------

/**
 * Syntax-highlight a single line of JSON (already HTML-escaped).
 */
function highlightJsonLine(escaped: string): string {
  return escaped
    // Keys: "key":
    .replace(
      /^(\s*)(&quot;)([\w.$]+)(&quot;)(\s*:)/,
      '$1<span class="j-key">$2$3$4</span>$5',
    )
    // String values (after colon or in arrays)
    .replace(
      /: (&quot;)(.*?)(&quot;)/g,
      ': <span class="j-str">$1$2$3</span>',
    )
    .replace(
      /^(\s+)(&quot;)(.*?)(&quot;)(,?)$/,
      '$1<span class="j-str">$2$3$4</span>$5',
    )
    // Numbers
    .replace(
      /: (\d+\.?\d*)(,?)$/,
      ': <span class="j-num">$1</span>$2',
    )
    // Booleans and null
    .replace(
      /: (true|false|null)(,?)$/,
      ': <span class="j-bool">$1</span>$2',
    );
}

function renderSpanJson(span: unknown, highlightAttrs?: Set<string>): string {
  const spanJson = JSON.stringify(span, null, 2);
  return spanJson
    .split("\n")
    .map((line) => {
      const escaped = escapeHtml(line);
      // Check for error highlight
      if (highlightAttrs && highlightAttrs.size > 0) {
        for (const attr of highlightAttrs) {
          const attrEscaped = attr.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          if (new RegExp(`^\\s*"${attrEscaped}"\\s*:`).test(line)) {
            return `<span class="highlight-error">${highlightJsonLine(escaped)}</span>`;
          }
        }
      }
      return highlightJsonLine(escaped);
    })
    .join("\n");
}

// ---------------------------------------------------------------------------
// Combined status helpers (for matrix)
// ---------------------------------------------------------------------------

function getCombinedStatus(result: CombinedTestResult): string {
  if (result.failed > 0) return "failed";
  if (result.other > 0) return "failed";
  if (result.passed > 0 && result.skipped === 0) return "passed";
  if (result.passed > 0) return "partial";
  if (result.skipped > 0) return "skipped";
  return "not-run";
}

function CombinedStatusCell({ result }: { result: CombinedTestResult }) {
  const overallStatus = getCombinedStatus(result);

  if (result.total === 1) {
    const v = result.variations[0];
    return html`<td class="status-${v.status}" title="${v.mode}">${getStatusIcon(v.status)}</td>`;
  }

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

// ---------------------------------------------------------------------------
// Test Matrix
// ---------------------------------------------------------------------------

function TestMatrixByType({
  tests,
  testType,
  title,
}: {
  tests: Test[];
  testType: string;
  title: string;
}) {
  const filteredTests = tests.filter(
    (t) => (t.extra as Record<string, unknown>)?.testType === testType,
  );
  if (filteredTests.length === 0) return html``;

  const sdks = [
    ...new Set(
      filteredTests.map((t: Test) =>
        t.suite && t.suite.length > 0 ? t.suite[0] : "unknown",
      ),
    ),
  ].sort();

  const testCases = [
    ...new Set(
      filteredTests.map((t: Test) => {
        const fullName = t.name.split(" :: ")[1] || t.name;
        return getBaseTestName(fullName);
      }),
    ),
  ].sort(naturalSortCompare);

  const testMap = new Map<string, CombinedTestResult>();
  for (const test of filteredTests) {
    const fullName = test.name.split(" :: ")[1] || test.name;
    const baseName = getBaseTestName(fullName);
    const suite =
      test.suite && test.suite.length > 0 ? test.suite[0] : "unknown";
    const key = `${suite}::${baseName}`;
    const modeMatch = fullName.match(/\(([^)]+)\)$/);
    const mode = modeMatch ? modeMatch[1] : "default";

    if (!testMap.has(key)) {
      testMap.set(key, { passed: 0, failed: 0, skipped: 0, other: 0, total: 0, variations: [] });
    }
    const result = testMap.get(key)!;
    result.total++;
    const extra = test.extra as Record<string, unknown> | undefined;
    const displayStatus = (extra?.originalStatus as string) || test.status;
    result.variations.push({ mode, status: displayStatus });
    switch (test.status) {
      case "passed": result.passed++; break;
      case "failed": result.failed++; break;
      case "skipped": result.skipped++; break;
      default: result.other++;
    }
  }

  return html`
    <h2 class="section-title">${title}</h2>
    <table class="matrix">
      <thead>
        <tr>
          <th style="text-align:left">SDK</th>
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
                if (!result) return html`<td class="status-not-run">-</td>`;
                return CombinedStatusCell({ result });
              })}
            </tr>
          `,
        )}
      </tbody>
    </table>
  `;
}

function TestMatrix({ report }: { report: Report }) {
  return html`
    ${TestMatrixByType({ tests: report.results.tests, testType: "llm", title: "LLM Tests" })}
    ${TestMatrixByType({ tests: report.results.tests, testType: "agent", title: "Agent Tests" })}
    ${TestMatrixByType({ tests: report.results.tests, testType: "embeddings", title: "Embeddings Tests" })}
  `;
}

// ---------------------------------------------------------------------------
// Check results rendering
// ---------------------------------------------------------------------------

function FailedCheckDetail({
  cr,
  spanById,
}: {
  cr: ReportCheckResult;
  spanById: Map<string, unknown>;
}) {
  const severity = cr.severity || "normal";
  const icon =
    severity === "critical" ? "\u2757" : severity === "warning" ? "\u26A0" : "\u2717";

  const groups = new Map<string, typeof cr.errorLocations>();
  if (cr.errorLocations) {
    for (const loc of cr.errorLocations) {
      if (!groups.has(loc.spanId)) groups.set(loc.spanId, []);
      groups.get(loc.spanId)!.push(loc);
    }
  }

  // Only show the raw error text if there are no structured locations
  const showRawError = cr.error && groups.size === 0;

  return html`<div class="check-result check-failed check-severity-${severity}">
    <span class="check-icon">${icon}</span>
    <span class="check-name">${cr.name}</span>
    ${showRawError ? html`<div class="check-error-msg">${cr.error}</div>` : ""}
    ${groups.size > 0
      ? html`<div class="check-locations">
          ${[...groups.entries()].map(([spanId, locs]) => {
            const highlightAttrs = new Set<string>();
            for (const loc of locs!) {
              if (loc.attribute) highlightAttrs.add(loc.attribute);
            }
            const span = spanById.get(spanId);
            return html`<div class="span-group">
              ${locs!.map(
                (loc) => html`<div class="check-location">
                  <span class="loc-span">${spanId.substring(0, 8)}</span>
                  ${loc.attribute ? html`<span class="loc-attr">${loc.attribute}</span>` : ""}
                  <span class="loc-msg">${loc.message}</span>
                </div>`,
              )}
              ${span
                ? html`<div class="span-view-row">
                    <button class="show-span-btn" onclick="toggleSpanPreview(this)" title="View span data">View span</button>
                    <pre class="span-preview" style="display:none" dangerouslySetInnerHTML=${{ __html: renderSpanJson(span, highlightAttrs) }}></pre>
                  </div>`
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

  const spanById = new Map<string, unknown>();
  if (spans) {
    for (const s of spans) {
      const id = (s as Record<string, unknown>).span_id as string | undefined;
      if (id) spanById.set(id, s);
    }
  }

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
          return html`<div class="check-result check-passed">
            <span class="check-icon">\u2713</span>
            <span class="check-name">${cr.name}</span>
          </div>`;
        } else if (cr.status === "skipped") {
          return html`<div class="check-result check-skipped">
            <span class="check-icon">\u25CB</span>
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

  return html`<div class="check-results-breakdown">${sections}</div>`;
}

function InlineAuditDisplay({ audit }: { audit: ReportAttributeAudit }) {
  if (audit.deprecatedAttributes.length === 0 && audit.unknownAttributes.length === 0) return "";

  return html`<div class="audit-inline">
    ${audit.deprecatedAttributes.length > 0
      ? html`<div class="audit-group audit-group-deprecated">
          <div class="audit-group-label">Deprecated Attributes</div>
          ${audit.deprecatedAttributes.slice().sort((a, b) => a.attribute.localeCompare(b.attribute)).map(
            (attr) => html`<div class="audit-item audit-item-deprecated">
              <code class="audit-attr">${attr.attribute}</code>
              <span class="audit-span-count">(${attr.spanIds.length} span${attr.spanIds.length !== 1 ? "s" : ""})</span>
              ${attr.replacement ? html`<span class="audit-arrow">\u2192</span> <code class="audit-replacement">${attr.replacement}</code>` : ""}
              <div class="audit-message">${attr.message}</div>
            </div>`,
          )}
        </div>` : ""}
    ${audit.unknownAttributes.length > 0
      ? html`<div class="audit-group audit-group-unknown">
          <div class="audit-group-label">Unknown Attributes</div>
          ${audit.unknownAttributes.slice().sort((a, b) => a.attribute.localeCompare(b.attribute)).map(
            (attr) => html`<div class="audit-item audit-item-unknown">
              <code class="audit-attr">${attr.attribute}</code>
              <span class="audit-span-count">(${attr.spanIds.length} span${attr.spanIds.length !== 1 ? "s" : ""})</span>
              <div class="audit-message">${attr.message}</div>
            </div>`,
          )}
        </div>` : ""}
  </div>`;
}

// ---------------------------------------------------------------------------
// Failed Tests Details
// ---------------------------------------------------------------------------

function FailedTestsDetails({ tests }: { tests: Test[] }) {
  const failedTests = tests.filter((t) => (t.status === "failed" || t.status === "other") && !isSetupError(t));
  if (failedTests.length === 0) return html``;

  return html`
    <h2 class="section-title" data-section="failed">Failed Tests (<span class="section-count">${failedTests.length}</span>)</h2>
    ${failedTests.map((test) => {
      const caseId = test.name.split(" :: ")[1] || test.name;
      const extra = test.extra as Record<string, unknown> | undefined;
      const spans = extra?.spans as unknown[] | undefined;
      const spanCount = extra?.spanCount as number | undefined;
      const checkResults = extra?.checkResults as ReportCheckResult[] | undefined;
      const audit = extra?.attributeAudit as ReportAttributeAudit | undefined;
      const isTimeout = extra?.originalStatus === "timeout";
      const testType = (extra?.testType as string) || "";
      const platform = (extra?.platform as string) || "";
      const framework = (extra?.framework as string) || "";

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
        <details class="${isTimeout ? "failed-test timeout-test" : "failed-test"}" data-filterable data-type="${testType}" data-platform="${platform}" data-framework="${framework}" data-status="${test.status}">
          <summary>
            <span class="failed-icon">${isTimeout ? "\u23F1" : "\u2717"}</span>
            <strong>${test.suite && test.suite.length > 0 ? test.suite[0] : "unknown"}</strong>
            <span>\u00A0::\u00A0${caseId}</span>
            <span class="severity-badges">
              ${isTimeout ? html`<span class="sev-badge sev-badge-timeout"><span class="sev-icon">${"\u23F1\uFE0E"}</span> Timeout</span>` : ""}
              ${severityCounts.critical > 0 ? html`<span class="sev-badge sev-badge-critical"><span class="sev-icon">${"\u2757\uFE0E"}</span> ${severityCounts.critical}</span>` : ""}
              ${severityCounts.normal > 0 ? html`<span class="sev-badge sev-badge-normal"><span class="sev-icon">${"\u2717"}</span> ${severityCounts.normal}</span>` : ""}
              ${severityCounts.warning > 0 ? html`<span class="sev-badge sev-badge-warning"><span class="sev-icon">${"\u26A0\uFE0E"}</span> ${severityCounts.warning}</span>` : ""}
            </span>
            <span class="duration">${test.duration}ms</span>
          </summary>
          <div class="error-details">
            ${checkResults && checkResults.length > 0
              ? CheckResultsBreakdown({ checkResults, spans })
              : test.trace
                ? html`<div class="error-trace"><strong>Details:</strong><pre>${test.trace}</pre></div>`
                : ""}
            ${audit ? InlineAuditDisplay({ audit }) : ""}
            ${spans && spans.length > 0
              ? html`<details class="spans-section">
                  <summary class="spans-toggle"><span class="spans-icon">{}</span>Captured Spans (${spanCount || spans.length})</summary>
                  <pre class="spans-json" dangerouslySetInnerHTML=${{ __html: renderSpanJson(spans) }}></pre>
                </details>`
              : spanCount === 0
                ? html`<div class="no-spans">No spans captured</div>`
                : ""}
          </div>
        </details>
      `;
    })}
  `;
}

// ---------------------------------------------------------------------------
// Setup Errors Section
// ---------------------------------------------------------------------------

function isSetupError(test: Test): boolean {
  const extra = test.extra as Record<string, unknown> | undefined;
  return extra?.originalStatus === "error";
}

function SetupErrorsSection({ tests }: { tests: Test[] }) {
  const errorTests = tests.filter(isSetupError);
  if (errorTests.length === 0) return html``;

  return html`
    <h2 class="section-title" data-section="setup-errors">Setup Errors (<span class="section-count">${errorTests.length}</span>)</h2>
    ${errorTests.map((test) => {
      const caseId = test.name.split(" :: ")[1] || test.name;
      const extra = test.extra as Record<string, unknown> | undefined;
      const testType = (extra?.testType as string) || "";
      const platform = (extra?.platform as string) || "";
      const framework = (extra?.framework as string) || "";

      return html`
        <details class="setup-error" data-filterable data-type="${testType}" data-platform="${platform}" data-framework="${framework}" data-status="error">
          <summary>
            <span class="setup-error-icon">\u26D4</span>
            <strong>${test.suite && test.suite.length > 0 ? test.suite[0] : "unknown"}</strong>
            <span>\u00A0::\u00A0${caseId}</span>
            <span class="sev-badge sev-badge-error">Setup</span>
            <span class="duration">${test.duration}ms</span>
          </summary>
          <div class="setup-error-details">
            ${test.trace ? html`<pre class="setup-error-msg">${test.trace}</pre>` : test.message ? html`<pre class="setup-error-msg">${test.message}</pre>` : ""}
          </div>
        </details>
      `;
    })}
  `;
}

// ---------------------------------------------------------------------------
// Warnings Section
// ---------------------------------------------------------------------------

function WarningsSection({ tests }: { tests: Test[] }) {
  const testsWithWarnings = tests.filter((t) => {
    if (t.status === "failed") return false;
    const extra = t.extra as Record<string, unknown> | undefined;
    const checkResults = extra?.checkResults as ReportCheckResult[] | undefined;
    if (!checkResults) return false;
    return checkResults.some((cr) => cr.status === "failed" && cr.severity === "warning");
  });
  if (testsWithWarnings.length === 0) return html``;

  return html`
    <h2 class="section-title" data-section="warnings">Warnings (<span class="section-count">${testsWithWarnings.length}</span> test${testsWithWarnings.length !== 1 ? "s" : ""})</h2>
    <p class="warnings-section-desc">Passed tests with warning-level check failures.</p>
    ${testsWithWarnings.map((test) => {
      const caseId = test.name.split(" :: ")[1] || test.name;
      const extra = test.extra as Record<string, unknown>;
      const checkResults = extra.checkResults as ReportCheckResult[];
      const spans = extra.spans as unknown[] | undefined;
      const warningResults = checkResults.filter((cr) => cr.status === "failed" && cr.severity === "warning");

      const wTestType = (extra?.testType as string) || "";
      const wPlatform = (extra?.platform as string) || "";
      const wFramework = (extra?.framework as string) || "";

      const spanById = new Map<string, unknown>();
      if (spans) {
        for (const s of spans) {
          const id = (s as Record<string, unknown>).span_id as string | undefined;
          if (id) spanById.set(id, s);
        }
      }

      return html`
        <details class="warning-test" data-filterable data-type="${wTestType}" data-platform="${wPlatform}" data-framework="${wFramework}" data-status="passed">
          <summary>
            <span class="warning-icon">${"\u26A0\uFE0E"}</span>
            <strong>${test.suite && test.suite.length > 0 ? test.suite[0] : "unknown"}</strong>
            <span>\u00A0::\u00A0${caseId}</span>
            <span class="sev-badge sev-badge-warning"><span class="sev-icon">${"\u26A0\uFE0E"}</span> ${warningResults.length}</span>
          </summary>
          <div class="warning-test-details">
            ${warningResults.map((cr) => FailedCheckDetail({ cr, spanById }))}
          </div>
        </details>
      `;
    })}
  `;
}

// ---------------------------------------------------------------------------
// Attribute Audit Section
// ---------------------------------------------------------------------------

function AttributeAuditSection({ tests }: { tests: Test[] }) {
  const testsWithFindings = tests.filter((t) => {
    if (t.status === "failed") return false;
    const extra = t.extra as Record<string, unknown> | undefined;
    const audit = extra?.attributeAudit as ReportAttributeAudit | undefined;
    return audit && (audit.deprecatedAttributes.length > 0 || audit.unknownAttributes.length > 0);
  });
  if (testsWithFindings.length === 0) return html``;

  return html`
    <h2 class="section-title" data-section="audit">Attribute Audit (<span class="section-count">${testsWithFindings.length}</span> test${testsWithFindings.length !== 1 ? "s" : ""})</h2>
    <p class="audit-section-desc">Audit of <code>gen_ai.*</code> attributes found on captured spans.</p>
    ${testsWithFindings.map((test) => {
      const caseId = test.name.split(" :: ")[1] || test.name;
      const extra = test.extra as Record<string, unknown>;
      const audit = extra.attributeAudit as ReportAttributeAudit;
      const deprecated = audit.deprecatedAttributes.length;
      const unknown = audit.unknownAttributes.length;
      const aTestType = (extra?.testType as string) || "";
      const aPlatform = (extra?.platform as string) || "";
      const aFramework = (extra?.framework as string) || "";

      return html`
        <details class="audit-test" data-filterable data-type="${aTestType}" data-platform="${aPlatform}" data-framework="${aFramework}" data-status="passed">
          <summary>
            <span class="audit-icon">${"\u26A0\uFE0E"}</span>
            <strong>${test.suite && test.suite.length > 0 ? test.suite[0] : "unknown"}</strong>
            <span>\u00A0::\u00A0${caseId}</span>
            <span class="audit-badge">${deprecated > 0 ? `${deprecated} deprecated` : ""}${deprecated > 0 && unknown > 0 ? ", " : ""}${unknown > 0 ? `${unknown} unknown` : ""}</span>
          </summary>
          <div class="audit-test-details">
            ${InlineAuditDisplay({ audit })}
          </div>
        </details>
      `;
    })}
  `;
}

// ---------------------------------------------------------------------------
// Filter Bar
// ---------------------------------------------------------------------------

function FilterBar({ tests }: { tests: Test[] }) {
  const types = [...new Set(tests.map((t) => (t.extra as Record<string, unknown>)?.testType as string).filter(Boolean))].sort();
  const platforms = [...new Set(tests.map((t) => (t.extra as Record<string, unknown>)?.platform as string).filter(Boolean))].sort();
  const frameworks = [...new Set(tests.map((t) => (t.extra as Record<string, unknown>)?.framework as string).filter(Boolean))].sort();
  const statuses = [...new Set(tests.map((t) => {
    if (isSetupError(t)) return "error";
    return t.status;
  }).filter(Boolean))].sort();

  return html`
    <div class="filter-bar" id="filter-bar">
      <span class="filter-bar-label">Filters</span>
      <select class="filter-select" id="filter-type" onchange="applyFilters()">
        <option value="">All types</option>
        ${types.map((t) => html`<option value="${t}">${t}</option>`)}
      </select>
      <select class="filter-select" id="filter-platform" onchange="applyFilters()">
        <option value="">All platforms</option>
        ${platforms.map((p) => html`<option value="${p}">${p}</option>`)}
      </select>
      <select class="filter-select" id="filter-framework" onchange="applyFilters()">
        <option value="">All frameworks</option>
        ${frameworks.map((f) => html`<option value="${f}">${f}</option>`)}
      </select>
      <select class="filter-select" id="filter-status" onchange="applyFilters()">
        <option value="">All statuses</option>
        ${statuses.map((s) => html`<option value="${s}">${s}</option>`)}
      </select>
      <span class="filter-count" id="filter-count"></span>
      <button class="filter-reset" onclick="resetFilters()">Reset</button>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Main HTML generation
// ---------------------------------------------------------------------------

function flattenToString(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    if (value[0] === "!DOCTYPE") {
      return "<!DOCTYPE html>\n" + value.slice(2).map(flattenToString).join("");
    }
    return value.map(flattenToString).join("");
  }
  if (typeof value === "object" && value !== null) return "";
  return String(value);
}

export function generateHTML(report: Report): string {
  const summary = report.results.summary;
  const duration = summary.stop - summary.start;
  const total = summary.tests;
  const passRate = total > 0 ? ((summary.passed / total) * 100).toFixed(1) : "0.0";
  const timestamp = new Date(summary.stop).toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit",
  });

  // Count total warnings and setup errors
  const totalWarnings = report.results.tests.reduce((sum, t) => {
    const extra = t.extra as Record<string, unknown> | undefined;
    return sum + ((extra?.warningCount as number) || 0);
  }, 0);
  const totalErrors = report.results.tests.filter(isSetupError).length;

  const passWidth = total > 0 ? ((summary.passed / total) * 100).toFixed(1) : "0";
  const failWidth = total > 0 ? ((summary.failed / total) * 100).toFixed(1) : "0";
  const skipWidth = total > 0 ? ((summary.skipped / total) * 100).toFixed(1) : "0";
  const errorWidth = total > 0 ? ((totalErrors / total) * 100).toFixed(1) : "0";

  const htmlContent = html`
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Test Results \u2014 Sentry AI SDK Tests</title>
        <style dangerouslySetInnerHTML=${{ __html: STYLES }}></style>
      </head>
      <body>
        <nav class="topnav">
          <span class="topnav-title">sentry/ai-sdk-tests</span>
          <div class="topnav-links">
            <a class="topnav-link active" href="#">Results</a>
            <a class="topnav-link" href="trends.html">Trends</a>
          </div>
          <span class="topnav-meta">${timestamp}</span>
        </nav>

        <div class="summary-bar">
          <div class="summary-stats">
            <div class="stat"><span class="stat-value">${total}</span><span class="stat-label">total</span></div>
            <div class="stat stat-passed"><span class="stat-value">${summary.passed}</span><span class="stat-label">passed</span></div>
            <div class="stat stat-failed"><span class="stat-value">${summary.failed}</span><span class="stat-label">failed</span></div>
            <div class="stat stat-skipped"><span class="stat-value">${summary.skipped}</span><span class="stat-label">skipped</span></div>
            ${totalErrors > 0 ? html`<div class="stat stat-errors"><span class="stat-value">${totalErrors}</span><span class="stat-label">setup errors</span></div>` : ""}
            ${totalWarnings > 0 ? html`<div class="stat"><span class="stat-value" style="color:var(--warn)">${totalWarnings}</span><span class="stat-label">warnings</span></div>` : ""}
            <div class="stat"><span class="stat-value">${passRate}%</span><span class="stat-label">pass rate</span></div>
            <div class="stat"><span class="stat-value">${formatDuration(duration)}</span><span class="stat-label">duration</span></div>
          </div>
          <div class="status-track">
            <div class="status-fill-pass" style="width:${passWidth}%"></div>
            <div class="status-fill-fail" style="width:${failWidth}%"></div>
            <div class="status-fill-skip" style="width:${skipWidth}%"></div>
            <div class="status-fill-error" style="width:${errorWidth}%"></div>
          </div>
        </div>

        <div class="main">
          ${TestMatrix({ report })}
          ${FilterBar({ tests: report.results.tests })}
          ${SetupErrorsSection({ tests: report.results.tests })}
          ${FailedTestsDetails({ tests: report.results.tests })}
          ${WarningsSection({ tests: report.results.tests })}
          ${AttributeAuditSection({ tests: report.results.tests })}
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

          function applyFilters() {
            var type = document.getElementById('filter-type').value;
            var platform = document.getElementById('filter-platform').value;
            var framework = document.getElementById('filter-framework').value;
            var status = document.getElementById('filter-status').value;
            var items = document.querySelectorAll('[data-filterable]');
            var shown = 0;
            var total = items.length;

            items.forEach(function(el) {
              var match = true;
              if (type && el.dataset.type !== type) match = false;
              if (platform && el.dataset.platform !== platform) match = false;
              if (framework && el.dataset.framework !== framework) match = false;
              if (status && el.dataset.status !== status) match = false;
              if (match) {
                el.classList.remove('test-item-hidden');
                shown++;
              } else {
                el.classList.add('test-item-hidden');
              }
            });

            // Update section counts and visibility
            var sections = document.querySelectorAll('[data-section]');
            sections.forEach(function(heading) {
              var sectionName = heading.dataset.section;
              var sibling = heading.nextElementSibling;
              var visibleCount = 0;
              while (sibling && !sibling.matches('[data-section]')) {
                if (sibling.hasAttribute('data-filterable') && !sibling.classList.contains('test-item-hidden')) {
                  visibleCount++;
                }
                sibling = sibling.nextElementSibling;
              }
              var countEl = heading.querySelector('.section-count');
              if (countEl) countEl.textContent = visibleCount;
              // Hide section heading + description if no visible items
              var isFiltering = type || platform || framework || status;
              if (isFiltering && visibleCount === 0) {
                heading.classList.add('section-hidden');
                // Also hide the description paragraph if present
                var next = heading.nextElementSibling;
                if (next && (next.classList.contains('warnings-section-desc') || next.classList.contains('audit-section-desc'))) {
                  next.classList.add('section-hidden');
                }
              } else {
                heading.classList.remove('section-hidden');
                var next = heading.nextElementSibling;
                if (next && (next.classList.contains('warnings-section-desc') || next.classList.contains('audit-section-desc'))) {
                  next.classList.remove('section-hidden');
                }
              }
            });

            var countEl = document.getElementById('filter-count');
            var isFiltering = type || platform || framework || status;
            countEl.textContent = isFiltering ? shown + ' of ' + total : '';
          }

          function resetFilters() {
            document.getElementById('filter-type').value = '';
            document.getElementById('filter-platform').value = '';
            document.getElementById('filter-framework').value = '';
            document.getElementById('filter-status').value = '';
            applyFilters();
          }
        ` }}></script>
      </body>
    </html>
  `;

  return flattenToString(htmlContent).replace(
    "</head>",
    `${FONT_LINK}\n</head>`,
  );
}

// ---------------------------------------------------------------------------
// File output helpers
// ---------------------------------------------------------------------------

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

export async function writeHTMLReport(
  htmlContent: string,
  outputDir: string = "./test-results",
  timestamp?: string,
): Promise<string> {
  await mkdir(outputDir, { recursive: true });
  const ts = timestamp || getTimestamp();
  const filePath = join(outputDir, `test-report-${ts}.html`);
  await writeFile(filePath, htmlContent, "utf-8");
  return filePath;
}
