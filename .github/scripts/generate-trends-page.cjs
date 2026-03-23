#!/usr/bin/env node
/**
 * Generates a standalone HTML page with trend charts from history.json.
 * Supports per-platform filtering when history entries contain `platforms` data.
 *
 * Usage:
 *   node .github/scripts/generate-trends-page.cjs <history-json> [output-path] [reports-dir]
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

  /* ---- Filter Bar ---- */
  .filter-bar {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 16px;
  }
  .filter-bar label {
    font-size: 12px;
    font-weight: 600;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }
  .filter-bar select {
    font-family: var(--sans);
    font-size: 13px;
    padding: 5px 28px 5px 10px;
    border: 1px solid var(--border-heavy);
    border-radius: var(--radius);
    background: var(--bg);
    color: var(--text);
    cursor: pointer;
    appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%23656d76'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 8px center;
  }
  .filter-bar select:focus {
    outline: none;
    border-color: var(--text-secondary);
  }
  .filter-note {
    font-size: 11px;
    color: var(--text-muted);
    font-style: italic;
    margin-left: 4px;
  }

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

  .no-data-msg {
    text-align: center;
    padding: 32px 16px;
    color: var(--text-muted);
    font-size: 13px;
  }
`;

// ---------------------------------------------------------------------------
// Page generation — charts are now rendered client-side via JavaScript
// ---------------------------------------------------------------------------

function generateHTML(history, availableDates) {
  const latest = history.length > 0 ? history[history.length - 1] : null;

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
    <div class="filter-bar">
      <label for="platform-filter">Platform:</label>
      <select id="platform-filter">
        <option value="">All platforms</option>
        <option value="js">JavaScript (all)</option>
        <option value="node">Node.js</option>
        <option value="browser">Browser</option>
        <option value="nextjs">Next.js</option>
        <option value="cloudflare">Cloudflare</option>
        <option value="python">Python</option>
        <option value="php">PHP</option>
      </select>
      <span class="filter-note" id="filter-note"></span>
    </div>

    <div class="summary-row" id="summary-row"></div>

    <div class="chart-card">
      <div class="chart-title">Pass Rate Over Time</div>
      <div class="legend">
        <div class="legend-item"><span class="legend-dot" style="background:#3fb950"></span> Pass Rate</div>
      </div>
      <div class="chart-container" id="chart-rate">
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
        <tbody id="history-tbody"></tbody>
      </table>
    </div>
  </div>

  <script>
    // Embedded data
    var rawHistory = ${JSON.stringify(history)};
    var availableDates = ${JSON.stringify([...availableDates])};
    var availableDateSet = new Set(availableDates);

    // JS platform groups
    var JS_PLATFORMS = ['node', 'browser', 'nextjs', 'cloudflare'];

    // -----------------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------------
    function formatDate(dateStr) {
      var d = new Date(dateStr + 'T00:00:00Z');
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
    }
    function formatDuration(ms) {
      if (ms < 1000) return ms + 'ms';
      if (ms < 60000) return (ms / 1000).toFixed(0) + 's';
      var m = Math.floor(ms / 60000);
      var s = Math.round((ms % 60000) / 1000);
      return m + 'm ' + s + 's';
    }
    function rate(passed, total) {
      return total > 0 ? ((passed / total) * 100).toFixed(1) : '0.0';
    }

    // -----------------------------------------------------------------------
    // Filter history to a platform view
    // -----------------------------------------------------------------------
    function filterHistory(platformFilter) {
      if (!platformFilter) return rawHistory; // "All platforms"

      var targetPlatforms = platformFilter === 'js' ? JS_PLATFORMS : [platformFilter];

      return rawHistory.map(function(entry) {
        if (!entry.platforms) return null; // no platform data for this entry

        var total = 0, passed = 0, failed = 0;
        for (var i = 0; i < targetPlatforms.length; i++) {
          var p = entry.platforms[targetPlatforms[i]];
          if (p) {
            total += p.total;
            passed += p.passed;
            failed += p.failed;
          }
        }
        if (total === 0) return null; // platform had no tests this day

        return {
          date: entry.date,
          total: total,
          passed: passed,
          failed: failed,
          duration: entry.duration // duration is aggregate-only
        };
      }).filter(Boolean);
    }

    // -----------------------------------------------------------------------
    // SVG chart rendering (client-side)
    // -----------------------------------------------------------------------
    function svgEl(tag, attrs, children) {
      var ns = 'http://www.w3.org/2000/svg';
      var el = document.createElementNS(ns, tag);
      for (var k in attrs) el.setAttribute(k, attrs[k]);
      if (children) {
        if (typeof children === 'string') el.textContent = children;
        else children.forEach(function(c) { el.appendChild(c); });
      }
      return el;
    }

    function renderPassRateChart(container, history) {
      // Remove old SVG if any
      var old = container.querySelector('svg');
      if (old) old.remove();

      if (history.length === 0) {
        container.insertAdjacentHTML('afterbegin', '<p class="no-data-msg">No data for this filter.</p>');
        return;
      }
      var msg = container.querySelector('.no-data-msg');
      if (msg) msg.remove();

      var W = 900, H = 280;
      var pad = { top: 24, right: 24, bottom: 56, left: 48 };
      var cW = W - pad.left - pad.right;
      var cH = H - pad.top - pad.bottom;

      function xPos(i) { return pad.left + (history.length > 1 ? (i / (history.length - 1)) * cW : cW / 2); }
      function yPos(pct) { return pad.top + cH - (pct / 100) * cH; }

      var svg = svgEl('svg', { viewBox: '0 0 ' + W + ' ' + H, xmlns: 'http://www.w3.org/2000/svg', style: 'width:100%;max-width:' + W + 'px;height:auto;' });

      // Y grid
      [0, 25, 50, 75, 100].forEach(function(val) {
        svg.appendChild(svgEl('line', { x1: pad.left, y1: yPos(val), x2: W - pad.right, y2: yPos(val), stroke: 'rgba(0,0,0,0.06)', 'stroke-width': 1 }));
        svg.appendChild(svgEl('text', { x: pad.left - 8, y: yPos(val) + 4, 'text-anchor': 'end', 'font-size': 10, fill: '#8b949e' }, val + '%'));
      });

      // Axes
      svg.appendChild(svgEl('line', { x1: pad.left, y1: pad.top, x2: pad.left, y2: pad.top + cH, stroke: 'rgba(0,0,0,0.08)', 'stroke-width': 1 }));
      svg.appendChild(svgEl('line', { x1: pad.left, y1: pad.top + cH, x2: W - pad.right, y2: pad.top + cH, stroke: 'rgba(0,0,0,0.08)', 'stroke-width': 1 }));

      // X labels
      var maxLabels = 15;
      var step = Math.max(1, Math.ceil(history.length / maxLabels));
      history.forEach(function(e, i) {
        if (i % step !== 0 && i !== history.length - 1) return;
        var t = svgEl('text', { x: xPos(i), y: pad.top + cH + 18, 'text-anchor': 'middle', 'font-size': 10, fill: '#8b949e', transform: 'rotate(-40, ' + xPos(i) + ', ' + (pad.top + cH + 18) + ')' }, formatDate(e.date));
        svg.appendChild(t);
      });

      // Pass rate line + area
      var rates = history.map(function(e) { return e.total > 0 ? (e.passed / e.total) * 100 : 0; });
      var linePoints = rates.map(function(r, i) { return xPos(i) + ',' + yPos(r); }).join(' ');
      var areaPoints = xPos(0) + ',' + yPos(0) + ' ' + linePoints + ' ' + xPos(rates.length - 1) + ',' + yPos(0);

      svg.appendChild(svgEl('polygon', { points: areaPoints, fill: 'rgba(63,185,80,0.08)' }));
      svg.appendChild(svgEl('polyline', { points: linePoints, fill: 'none', stroke: '#3fb950', 'stroke-width': 2 }));

      rates.forEach(function(r, i) {
        svg.appendChild(svgEl('circle', { cx: xPos(i), cy: yPos(r), r: 3, fill: '#3fb950', class: 'dot', 'data-idx': i }));
      });

      container.insertBefore(svg, container.firstChild);
    }

    function renderCountsChart(container, history) {
      var old = container.querySelector('svg');
      if (old) old.remove();

      if (history.length === 0) {
        container.insertAdjacentHTML('afterbegin', '<p class="no-data-msg">No data for this filter.</p>');
        return;
      }
      var msg = container.querySelector('.no-data-msg');
      if (msg) msg.remove();

      var W = 900, H = 220;
      var pad = { top: 24, right: 24, bottom: 56, left: 48 };
      var cW = W - pad.left - pad.right;
      var cH = H - pad.top - pad.bottom;

      var maxVal = Math.max.apply(null, history.map(function(e) { return e.total; }).concat([1]));
      var yMax = Math.ceil(maxVal / 50) * 50 || 50;

      function xPos(i) { return pad.left + (history.length > 1 ? (i / (history.length - 1)) * cW : cW / 2); }
      function yPos(val) { return pad.top + cH - (val / yMax) * cH; }

      var svg = svgEl('svg', { viewBox: '0 0 ' + W + ' ' + H, xmlns: 'http://www.w3.org/2000/svg', style: 'width:100%;max-width:' + W + 'px;height:auto;' });

      // Y grid
      var yTicks = 5;
      for (var t = 0; t <= yTicks; t++) {
        var val = Math.round((yMax / yTicks) * t);
        svg.appendChild(svgEl('line', { x1: pad.left, y1: yPos(val), x2: W - pad.right, y2: yPos(val), stroke: 'rgba(0,0,0,0.06)', 'stroke-width': 1 }));
        svg.appendChild(svgEl('text', { x: pad.left - 8, y: yPos(val) + 4, 'text-anchor': 'end', 'font-size': 10, fill: '#8b949e' }, '' + val));
      }

      // Axes
      svg.appendChild(svgEl('line', { x1: pad.left, y1: pad.top, x2: pad.left, y2: pad.top + cH, stroke: 'rgba(0,0,0,0.08)', 'stroke-width': 1 }));
      svg.appendChild(svgEl('line', { x1: pad.left, y1: pad.top + cH, x2: W - pad.right, y2: pad.top + cH, stroke: 'rgba(0,0,0,0.08)', 'stroke-width': 1 }));

      // X labels
      var maxLabels = 15;
      var step = Math.max(1, Math.ceil(history.length / maxLabels));
      history.forEach(function(e, i) {
        if (i % step !== 0 && i !== history.length - 1) return;
        svg.appendChild(svgEl('text', { x: xPos(i), y: pad.top + cH + 18, 'text-anchor': 'middle', 'font-size': 10, fill: '#8b949e', transform: 'rotate(-40, ' + xPos(i) + ', ' + (pad.top + cH + 18) + ')' }, formatDate(e.date)));
      });

      function addPolyline(values, color) {
        var points = values.map(function(v, i) { return xPos(i) + ',' + yPos(v); }).join(' ');
        svg.appendChild(svgEl('polyline', { points: points, fill: 'none', stroke: color, 'stroke-width': 2 }));
        values.forEach(function(v, i) {
          svg.appendChild(svgEl('circle', { cx: xPos(i), cy: yPos(v), r: 3, fill: color, class: 'dot', 'data-idx': i }));
        });
      }

      addPolyline(history.map(function(e) { return e.total; }), '#8b949e');
      addPolyline(history.map(function(e) { return e.passed; }), '#3fb950');
      addPolyline(history.map(function(e) { return e.failed; }), '#f85149');

      container.insertBefore(svg, container.firstChild);
    }

    // -----------------------------------------------------------------------
    // Summary stats
    // -----------------------------------------------------------------------
    function renderSummary(history) {
      var el = document.getElementById('summary-row');
      var latest = history.length > 0 ? history[history.length - 1] : null;
      var passRate = latest && latest.total > 0 ? rate(latest.passed, latest.total) : '\\u2014';

      el.innerHTML =
        '<div class="stat-card"><div class="stat-card-label">Total</div><div class="stat-card-value">' + (latest ? latest.total : '\\u2014') + '</div></div>' +
        '<div class="stat-card pass"><div class="stat-card-label">Passed</div><div class="stat-card-value">' + (latest ? latest.passed : '\\u2014') + '</div></div>' +
        '<div class="stat-card fail"><div class="stat-card-label">Failed</div><div class="stat-card-value">' + (latest ? latest.failed : '\\u2014') + '</div></div>' +
        '<div class="stat-card rate"><div class="stat-card-label">Pass Rate</div><div class="stat-card-value">' + passRate + '%</div></div>' +
        '<div class="stat-card"><div class="stat-card-label">Runs</div><div class="stat-card-value">' + history.length + '</div></div>';
    }

    // -----------------------------------------------------------------------
    // History table
    // -----------------------------------------------------------------------
    function renderHistoryTable(history) {
      var tbody = document.getElementById('history-tbody');
      var reversed = history.slice().reverse();

      var rows = reversed.map(function(e, i) {
        var r = rate(e.passed, e.total);
        var origIdx = history.length - 1 - i;
        var isRegression = false;
        if (origIdx > 0) {
          var prev = history[origIdx - 1];
          var prevRate = prev.total > 0 ? (prev.passed / prev.total) * 100 : 0;
          var currRate = e.total > 0 ? (e.passed / e.total) * 100 : 0;
          isRegression = prevRate - currRate >= 5;
        }

        var rowClass = isRegression ? ' class="regression-row"' : '';
        var flag = isRegression ? '<span class="regression-flag">\\u25BC regression</span>' : '';
        var viewCell = availableDateSet.has(e.date)
          ? '<a href="reports/' + e.date + '/index.html" style="color:var(--text-secondary);font-size:11px;">view</a>'
          : '';

        return '<tr' + rowClass + '>' +
          '<td>' + formatDate(e.date) + flag + '</td>' +
          '<td>' + e.total + '</td>' +
          '<td class="val-pass">' + e.passed + '</td>' +
          '<td class="val-fail">' + e.failed + '</td>' +
          '<td class="val-rate">' + r + '%</td>' +
          '<td>' + formatDuration(e.duration) + '</td>' +
          '<td>' + viewCell + '</td>' +
          '</tr>';
      }).join('\\n');

      tbody.innerHTML = rows;
    }

    // -----------------------------------------------------------------------
    // Tooltips
    // -----------------------------------------------------------------------
    function setupTooltips(containerId, tooltipId, history) {
      var tooltip = document.getElementById(tooltipId);
      var container = document.getElementById(containerId);
      if (!container || !tooltip) return;
      var dots = container.querySelectorAll('.dot');
      dots.forEach(function(dot) {
        dot.addEventListener('mouseenter', function() {
          var idx = parseInt(dot.getAttribute('data-idx'));
          var e = history[idx];
          if (!e) return;
          tooltip.innerHTML = '<div class="tt-date">' + formatDate(e.date) + '</div>'
            + '<div class="tt-row"><span>Total:</span><span>' + e.total + '</span></div>'
            + '<div class="tt-row"><span>Passed:</span><span>' + e.passed + '</span></div>'
            + '<div class="tt-row"><span>Failed:</span><span>' + e.failed + '</span></div>'
            + '<div class="tt-row"><span>Rate:</span><span>' + rate(e.passed, e.total) + '%</span></div>'
            + '<div class="tt-row"><span>Duration:</span><span>' + formatDuration(e.duration) + '</span></div>';
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

    // -----------------------------------------------------------------------
    // Render everything for current filter
    // -----------------------------------------------------------------------
    function renderAll(platformFilter) {
      var history = filterHistory(platformFilter);

      // Show note when filtering and some entries lack platform data
      var note = document.getElementById('filter-note');
      if (platformFilter) {
        var missing = rawHistory.filter(function(e) { return !e.platforms; }).length;
        note.textContent = missing > 0 ? missing + ' older run(s) lack platform data' : '';
      } else {
        note.textContent = '';
      }

      renderSummary(history);
      renderPassRateChart(document.getElementById('chart-rate'), history);
      renderCountsChart(document.getElementById('chart-counts'), history);
      renderHistoryTable(history);
      setupTooltips('chart-rate', 'tooltip-rate', history);
      setupTooltips('chart-counts', 'tooltip-counts', history);
    }

    // -----------------------------------------------------------------------
    // Init
    // -----------------------------------------------------------------------
    var select = document.getElementById('platform-filter');

    // Restore filter from URL hash
    var initialFilter = '';
    if (location.hash) {
      var hashVal = location.hash.slice(1);
      for (var i = 0; i < select.options.length; i++) {
        if (select.options[i].value === hashVal) {
          initialFilter = hashVal;
          select.value = hashVal;
          break;
        }
      }
    }

    select.addEventListener('change', function() {
      var val = select.value;
      location.hash = val || '';
      renderAll(val);
    });

    renderAll(initialFilter);
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
