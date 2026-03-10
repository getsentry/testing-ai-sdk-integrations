#!/usr/bin/env node
/**
 * Generates a standalone HTML page with trend charts from history.json.
 *
 * Usage:
 *   node .github/scripts/generate-trends-page.cjs <history-json> [output-path]
 */

const fs = require("fs");
const path = require("path");

function formatDate(dateStr) {
  const d = new Date(dateStr + "T00:00:00Z");
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(0)}s`;
  const m = Math.floor(ms / 60000);
  const s = Math.round((ms % 60000) / 1000);
  return `${m}m ${s}s`;
}

// ---------------------------------------------------------------------------
// Shared CSS (must match html-generator.ts)
// ---------------------------------------------------------------------------

const FONT_LINK = `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">`;

const SHARED_CSS = `
  :root {
    --bg: #ffffff;
    --bg-alt: #f6f8fa;
    --bg-hover: #eef1f5;
    --bg-surface: #ffffff;
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
    font-size: 13px;
    line-height: 1.5;
    -webkit-font-smoothing: antialiased;
  }

  /* ---- Nav Bar ---- */
  .topnav {
    display: flex;
    align-items: center;
    padding: 0 24px;
    height: 42px;
    background: var(--bg);
    border-bottom: 1px solid var(--border);
    position: sticky;
    top: 0;
    z-index: 100;
  }
  .topnav-title {
    font-weight: 700;
    font-size: 13px;
    color: var(--text);
    letter-spacing: -0.01em;
    white-space: nowrap;
    font-family: var(--mono);
  }
  .topnav-links {
    display: flex;
    margin-left: 32px;
    height: 100%;
  }
  .topnav-link {
    display: flex;
    align-items: center;
    padding: 0 14px;
    font-size: 13px;
    font-weight: 500;
    color: var(--text-secondary);
    text-decoration: none;
    border-bottom: 2px solid transparent;
    transition: color var(--transition), border-color var(--transition);
  }
  .topnav-link:hover { color: var(--text); }
  .topnav-link.active { color: var(--text); border-bottom-color: var(--text); }
  .topnav-meta {
    margin-left: auto;
    font-size: 12px;
    color: var(--text-muted);
    font-family: var(--mono);
  }
`;

// ---------------------------------------------------------------------------
// Trends-specific CSS
// ---------------------------------------------------------------------------

const TRENDS_CSS = `
  ${SHARED_CSS}

  .main { max-width: 1000px; margin: 0 auto; padding: 16px 24px 48px; }

  /* ---- Summary Stats ---- */
  .summary-row {
    display: flex;
    gap: 12px;
    margin-bottom: 16px;
    flex-wrap: wrap;
  }
  .stat-card {
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    padding: 12px 18px;
    min-width: 110px;
    text-align: center;
  }
  .stat-card-label {
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-muted);
    margin-bottom: 2px;
  }
  .stat-card-value {
    font-family: var(--mono);
    font-size: 22px;
    font-weight: 700;
    color: var(--text);
    line-height: 1.2;
  }
  .stat-card.pass .stat-card-value { color: var(--pass); }
  .stat-card.fail .stat-card-value { color: var(--fail); }
  .stat-card.rate .stat-card-value { font-size: 22px; }

  /* ---- Chart Sections ---- */
  .chart-card {
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    padding: 16px 20px;
    margin-bottom: 12px;
  }
  .chart-title {
    font-size: 12px;
    font-weight: 600;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.03em;
    margin-bottom: 12px;
  }
  .chart-container { position: relative; }

  .legend {
    display: flex;
    gap: 16px;
    margin-bottom: 10px;
    font-size: 12px;
    color: var(--text-secondary);
  }
  .legend-item { display: flex; align-items: center; gap: 5px; }
  .legend-dot { width: 8px; height: 8px; border-radius: 50%; }

  .tooltip {
    position: absolute;
    background: var(--text);
    color: #fff;
    padding: 8px 12px;
    border-radius: var(--radius-lg);
    font-size: 12px;
    font-family: var(--mono);
    pointer-events: none;
    opacity: 0;
    transition: opacity var(--transition);
    white-space: nowrap;
    z-index: 10;
  }
  .tooltip .tt-date { font-weight: 600; margin-bottom: 4px; font-family: var(--sans); }
  .tooltip .tt-row { display: flex; justify-content: space-between; gap: 16px; }

  svg .dot { cursor: pointer; transition: r var(--transition); }
  svg .dot:hover { r: 5; }
  svg text { font-family: var(--mono); }

  /* ---- History Table ---- */
  .table-card {
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    overflow: hidden;
  }
  .table-card-header {
    padding: 12px 16px;
    border-bottom: 1px solid var(--border);
    font-size: 12px;
    font-weight: 600;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }
  .history-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
    font-family: var(--mono);
  }
  .history-table th {
    padding: 8px 14px;
    text-align: right;
    font-weight: 600;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--text-muted);
    border-bottom: 1px solid var(--border);
    font-family: var(--sans);
  }
  .history-table th:first-child { text-align: left; }
  .history-table td {
    padding: 7px 14px;
    text-align: right;
    border-bottom: 1px solid var(--border);
    height: 34px;
  }
  .history-table td:first-child { text-align: left; font-family: var(--sans); font-weight: 500; }
  .history-table tr:last-child td { border-bottom: none; }
  .history-table tr:hover td { background: var(--bg-hover); }
  .history-table .val-pass { color: var(--pass); font-weight: 600; }
  .history-table .val-fail { color: var(--fail); font-weight: 600; }
  .history-table .val-rate { font-weight: 600; }

  /* Regression flag */
  .regression-row td { background: var(--fail-bg); }
  .regression-row td:first-child { border-left: 3px solid var(--fail); }
  .regression-flag {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    font-size: 10px;
    font-weight: 600;
    font-family: var(--sans);
    padding: 1px 6px;
    border-radius: 10px;
    background: var(--fail-bg);
    color: var(--fail);
    border: 1px solid var(--fail-border);
    margin-left: 6px;
  }
`;

// ---------------------------------------------------------------------------
// SVG Charts
// ---------------------------------------------------------------------------

function generatePassRateChart(history) {
  if (history.length === 0) return "<p>No data available yet.</p>";

  const width = 900;
  const height = 280;
  const padding = { top: 24, right: 24, bottom: 56, left: 48 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  function x(i) {
    return (
      padding.left +
      (history.length > 1 ? (i / (history.length - 1)) * chartW : chartW / 2)
    );
  }
  function y(pct) {
    return padding.top + chartH - (pct / 100) * chartH;
  }

  // Y grid lines (pass rate 0-100%)
  const yTicks = [0, 25, 50, 75, 100];
  const yLines = yTicks
    .map(
      (val) =>
        `<line x1="${padding.left}" y1="${y(val)}" x2="${width - padding.right}" y2="${y(val)}" stroke="rgba(0,0,0,0.06)" stroke-width="1"/>
        <text x="${padding.left - 8}" y="${y(val) + 4}" text-anchor="end" font-size="10" fill="#8b949e">${val}%</text>`,
    )
    .join("\n");

  // X labels
  const maxLabels = 15;
  const labelStep = Math.max(1, Math.ceil(history.length / maxLabels));
  const xLabels = history
    .map((e, i) => {
      if (i % labelStep !== 0 && i !== history.length - 1) return "";
      return `<text x="${x(i)}" y="${padding.top + chartH + 18}" text-anchor="middle" font-size="10" fill="#8b949e" transform="rotate(-40, ${x(i)}, ${padding.top + chartH + 18})">${formatDate(e.date)}</text>`;
    })
    .filter(Boolean)
    .join("\n");

  // Pass rate line + area fill
  const rates = history.map(
    (e) => (e.total > 0 ? (e.passed / e.total) * 100 : 0),
  );
  const linePoints = rates.map((r, i) => `${x(i)},${y(r)}`).join(" ");
  const areaPoints = `${x(0)},${y(0)} ${linePoints} ${x(rates.length - 1)},${y(0)}`;

  const dots = rates
    .map(
      (r, i) =>
        `<circle cx="${x(i)}" cy="${y(r)}" r="3" fill="#3fb950" class="dot" data-series="rate" data-idx="${i}"/>`,
    )
    .join("\n");

  return `<svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:${width}px;height:auto;">
    ${yLines}
    <line x1="${padding.left}" y1="${padding.top}" x2="${padding.left}" y2="${padding.top + chartH}" stroke="rgba(0,0,0,0.08)" stroke-width="1"/>
    <line x1="${padding.left}" y1="${padding.top + chartH}" x2="${width - padding.right}" y2="${padding.top + chartH}" stroke="rgba(0,0,0,0.08)" stroke-width="1"/>
    <polygon points="${areaPoints}" fill="rgba(63,185,80,0.08)"/>
    <polyline points="${linePoints}" fill="none" stroke="#3fb950" stroke-width="2"/>
    ${dots}
    ${xLabels}
  </svg>`;
}

function generateCountsChart(history) {
  if (history.length === 0) return "";

  const width = 900;
  const height = 220;
  const padding = { top: 24, right: 24, bottom: 56, left: 48 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  const maxVal = Math.max(...history.map((e) => e.total), 1);
  const yMax = Math.ceil(maxVal / 50) * 50 || 50;

  function x(i) {
    return (
      padding.left +
      (history.length > 1 ? (i / (history.length - 1)) * chartW : chartW / 2)
    );
  }
  function y(val) {
    return padding.top + chartH - (val / yMax) * chartH;
  }

  const yTicks = 5;
  const yLines = [];
  for (let i = 0; i <= yTicks; i++) {
    const val = Math.round((yMax / yTicks) * i);
    yLines.push(
      `<line x1="${padding.left}" y1="${y(val)}" x2="${width - padding.right}" y2="${y(val)}" stroke="rgba(0,0,0,0.06)" stroke-width="1"/>`,
    );
    yLines.push(
      `<text x="${padding.left - 8}" y="${y(val) + 4}" text-anchor="end" font-size="10" fill="#8b949e">${val}</text>`,
    );
  }

  const maxLabels = 15;
  const labelStep = Math.max(1, Math.ceil(history.length / maxLabels));
  const xLabels = history
    .map((e, i) => {
      if (i % labelStep !== 0 && i !== history.length - 1) return "";
      return `<text x="${x(i)}" y="${padding.top + chartH + 18}" text-anchor="middle" font-size="10" fill="#8b949e" transform="rotate(-40, ${x(i)}, ${padding.top + chartH + 18})">${formatDate(e.date)}</text>`;
    })
    .filter(Boolean)
    .join("\n");

  function polyline(values, color, id) {
    const points = values.map((v, i) => `${x(i)},${y(v)}`).join(" ");
    const dots = values
      .map(
        (v, i) =>
          `<circle cx="${x(i)}" cy="${y(v)}" r="3" fill="${color}" class="dot" data-series="${id}" data-idx="${i}"/>`,
      )
      .join("\n");
    return `<polyline points="${points}" fill="none" stroke="${color}" stroke-width="2" />\n${dots}`;
  }

  return `<svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:${width}px;height:auto;">
    ${yLines.join("\n")}
    <line x1="${padding.left}" y1="${padding.top}" x2="${padding.left}" y2="${padding.top + chartH}" stroke="rgba(0,0,0,0.08)" stroke-width="1"/>
    <line x1="${padding.left}" y1="${padding.top + chartH}" x2="${width - padding.right}" y2="${padding.top + chartH}" stroke="rgba(0,0,0,0.08)" stroke-width="1"/>
    ${polyline(history.map((e) => e.passed), "#3fb950", "passed")}
    ${polyline(history.map((e) => e.failed), "#f85149", "failed")}
    ${polyline(history.map((e) => e.total), "#8b949e", "total")}
    ${xLabels}
  </svg>`;
}

// ---------------------------------------------------------------------------
// History Table with regression detection
// ---------------------------------------------------------------------------

function generateHistoryTable(history, availableDates) {
  const reversed = history.slice().reverse();

  const rows = reversed
    .map((e, i) => {
      const rate =
        e.total > 0 ? ((e.passed / e.total) * 100).toFixed(1) : "0.0";

      // Detect regression: pass rate dropped >= 5 points from previous run
      let isRegression = false;
      const origIdx = history.length - 1 - i;
      if (origIdx > 0) {
        const prev = history[origIdx - 1];
        const prevRate =
          prev.total > 0 ? (prev.passed / prev.total) * 100 : 0;
        const currRate = e.total > 0 ? (e.passed / e.total) * 100 : 0;
        isRegression = prevRate - currRate >= 5;
      }

      const rowClass = isRegression ? ' class="regression-row"' : "";
      const regressionFlag = isRegression
        ? '<span class="regression-flag">\u25BC regression</span>'
        : "";

      const hasReport = availableDates.has(e.date);
      const viewCell = hasReport
        ? `<a href="reports/${e.date}/index.html" style="color:var(--text-secondary);font-size:11px;">view</a>`
        : '';
      return `<tr${rowClass}>
        <td>${formatDate(e.date)}${regressionFlag}</td>
        <td>${e.total}</td>
        <td class="val-pass">${e.passed}</td>
        <td class="val-fail">${e.failed}</td>
        <td class="val-rate">${rate}%</td>
        <td>${formatDuration(e.duration)}</td>
        <td>${viewCell}</td>
      </tr>`;
    })
    .join("\n");

  return rows;
}

// ---------------------------------------------------------------------------
// Page generation
// ---------------------------------------------------------------------------

function generateHTML(history, availableDates) {
  const latest = history.length > 0 ? history[history.length - 1] : null;
  const passRate =
    latest && latest.total > 0
      ? ((latest.passed / latest.total) * 100).toFixed(1)
      : "\u2014";

  const tooltipData = history.map((e) => ({
    date: formatDate(e.date),
    total: e.total,
    passed: e.passed,
    failed: e.failed,
    rate:
      e.total > 0 ? ((e.passed / e.total) * 100).toFixed(1) + "%" : "0.0%",
    duration: formatDuration(e.duration),
  }));

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Trends \u2014 Sentry AI SDK Tests</title>
  ${FONT_LINK}
  <style>${TRENDS_CSS}</style>
</head>
<body>
  <nav class="topnav">
    <span class="topnav-title">sentry/ai-sdk-tests</span>
    <div class="topnav-links">
      <a class="topnav-link" href="index.html">Results</a>
      <a class="topnav-link active" href="#">Trends</a>
    </div>
    <span class="topnav-meta">${latest ? formatDate(latest.date) : ""}</span>
  </nav>

  <div class="main">
    <div class="summary-row">
      <div class="stat-card">
        <div class="stat-card-label">Total</div>
        <div class="stat-card-value">${latest ? latest.total : "\u2014"}</div>
      </div>
      <div class="stat-card pass">
        <div class="stat-card-label">Passed</div>
        <div class="stat-card-value">${latest ? latest.passed : "\u2014"}</div>
      </div>
      <div class="stat-card fail">
        <div class="stat-card-label">Failed</div>
        <div class="stat-card-value">${latest ? latest.failed : "\u2014"}</div>
      </div>
      <div class="stat-card rate">
        <div class="stat-card-label">Pass Rate</div>
        <div class="stat-card-value">${passRate}%</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-label">Runs</div>
        <div class="stat-card-value">${history.length}</div>
      </div>
    </div>

    <div class="chart-card">
      <div class="chart-title">Pass Rate Over Time</div>
      <div class="legend">
        <div class="legend-item"><span class="legend-dot" style="background:#3fb950"></span> Pass Rate</div>
      </div>
      <div class="chart-container" id="chart-rate">
        ${generatePassRateChart(history)}
        <div class="tooltip" id="tooltip-rate"></div>
      </div>
    </div>

    <div class="chart-card">
      <div class="chart-title">Test Counts</div>
      <div class="legend">
        <div class="legend-item"><span class="legend-dot" style="background:#8b949e"></span> Total</div>
        <div class="legend-item"><span class="legend-dot" style="background:#3fb950"></span> Passed</div>
        <div class="legend-item"><span class="legend-dot" style="background:#f85149"></span> Failed</div>
      </div>
      <div class="chart-container" id="chart-counts">
        ${generateCountsChart(history)}
        <div class="tooltip" id="tooltip-counts"></div>
      </div>
    </div>

    <div class="table-card">
      <div class="table-card-header">Run History</div>
      <table class="history-table">
        <thead>
          <tr>
            <th style="text-align:left">Date</th>
            <th>Total</th>
            <th>Passed</th>
            <th>Failed</th>
            <th>Pass Rate</th>
            <th>Duration</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${generateHistoryTable(history, availableDates)}
        </tbody>
      </table>
    </div>
  </div>

  <script>
    var tooltipData = ${JSON.stringify(tooltipData)};

    function setupTooltips(containerId, tooltipId) {
      var tooltip = document.getElementById(tooltipId);
      var container = document.getElementById(containerId);
      if (!container || !tooltip) return;
      var dots = container.querySelectorAll('.dot');
      dots.forEach(function(dot) {
        dot.addEventListener('mouseenter', function() {
          var idx = parseInt(dot.getAttribute('data-idx'));
          var d = tooltipData[idx];
          if (!d) return;
          tooltip.innerHTML = '<div class="tt-date">' + d.date + '</div>'
            + '<div class="tt-row"><span>Total:</span><span>' + d.total + '</span></div>'
            + '<div class="tt-row"><span>Passed:</span><span>' + d.passed + '</span></div>'
            + '<div class="tt-row"><span>Failed:</span><span>' + d.failed + '</span></div>'
            + '<div class="tt-row"><span>Rate:</span><span>' + d.rate + '</span></div>'
            + '<div class="tt-row"><span>Duration:</span><span>' + d.duration + '</span></div>';
          tooltip.style.opacity = '1';
          var svg = dot.closest('svg');
          var svgRect = svg.getBoundingClientRect();
          var containerRect = container.getBoundingClientRect();
          var cx = parseFloat(dot.getAttribute('cx'));
          var cy = parseFloat(dot.getAttribute('cy'));
          var svgWidth = parseFloat(svg.getAttribute('viewBox').split(' ')[2]);
          var svgHeight = parseFloat(svg.getAttribute('viewBox').split(' ')[3]);
          var scaleX = svgRect.width / svgWidth;
          var scaleY = svgRect.height / svgHeight;
          var left = cx * scaleX + (svgRect.left - containerRect.left) + 12;
          var top = cy * scaleY + (svgRect.top - containerRect.top) - 10;
          tooltip.style.left = left + 'px';
          tooltip.style.top = top + 'px';
        });
        dot.addEventListener('mouseleave', function() {
          tooltip.style.opacity = '0';
        });
      });
    }

    setupTooltips('chart-rate', 'tooltip-rate');
    setupTooltips('chart-counts', 'tooltip-counts');
  </script>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);

if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
  console.log(`
Usage: node .github/scripts/generate-trends-page.cjs <history-json> [output-path] [reports-dir]

Generate an HTML trends page from test history data.

Arguments:
  history-json   Path to the history.json file
  output-path    Optional: Output HTML file path (default: test-results/trends.html)
  reports-dir    Optional: Path to reports directory to detect available dated reports
`);
  process.exit(0);
}

const inputFile = args[0];
const outputPath = args[1] || "test-results/trends.html";
const reportsDir = args[2] || null;

// Scan reports directory to find which dates have reports
const availableDates = new Set();
if (reportsDir && fs.existsSync(reportsDir)) {
  for (const entry of fs.readdirSync(reportsDir)) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(entry)) {
      const reportFile = path.join(reportsDir, entry, "index.html");
      if (fs.existsSync(reportFile)) {
        availableDates.add(entry);
      }
    }
  }
  console.log(`Found ${availableDates.size} dated reports in ${reportsDir}`);
}

try {
  const content = fs.readFileSync(inputFile, "utf-8");
  const history = JSON.parse(content);

  console.log(`Read ${history.length} history entries from ${inputFile}`);

  const htmlContent = generateHTML(history, availableDates);

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, htmlContent, "utf-8");
  console.log(`Trends page written to: ${outputPath}`);
} catch (error) {
  if (error.code === "ENOENT") {
    console.error(`Error: File not found: ${inputFile}`);
  } else {
    console.error("Error:", error);
  }
  process.exit(1);
}
