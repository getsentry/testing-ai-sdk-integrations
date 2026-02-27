#!/usr/bin/env node
/**
 * Generates a standalone HTML page with an SVG trend chart from history.json.
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
  return `${(ms / 1000).toFixed(0)}s`;
}

function generateSVGChart(history) {
  if (history.length === 0) return "<p>No data available yet.</p>";

  const width = 900;
  const height = 400;
  const padding = { top: 30, right: 30, bottom: 70, left: 55 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  const maxVal = Math.max(...history.map((e) => e.total), 1);
  const yMax = Math.ceil(maxVal / 50) * 50;

  const xStep = history.length > 1 ? chartW / (history.length - 1) : chartW;

  function x(i) {
    return padding.left + (history.length > 1 ? i * xStep : chartW / 2);
  }

  function y(val) {
    return padding.top + chartH - (val / yMax) * chartH;
  }

  function polyline(values, color, id) {
    const points = values.map((v, i) => `${x(i)},${y(v)}`).join(" ");
    const dots = values
      .map(
        (v, i) =>
          `<circle cx="${x(i)}" cy="${y(v)}" r="3.5" fill="${color}" class="dot" data-series="${id}" data-idx="${i}"/>`,
      )
      .join("\n");
    return `<polyline points="${points}" fill="none" stroke="${color}" stroke-width="2" />\n${dots}`;
  }

  // Y-axis grid lines
  const yTicks = 5;
  const yLines = [];
  for (let i = 0; i <= yTicks; i++) {
    const val = Math.round((yMax / yTicks) * i);
    const yPos = y(val);
    yLines.push(
      `<line x1="${padding.left}" y1="${yPos}" x2="${width - padding.right}" y2="${yPos}" stroke="#e0e0e0" stroke-width="1"/>`,
    );
    yLines.push(
      `<text x="${padding.left - 8}" y="${yPos + 4}" text-anchor="end" font-size="11" fill="#666">${val}</text>`,
    );
  }

  // X-axis labels (show subset if many points)
  const maxLabels = 15;
  const labelStep = Math.max(1, Math.ceil(history.length / maxLabels));
  const xLabels = history
    .map((e, i) => {
      if (i % labelStep !== 0 && i !== history.length - 1) return "";
      return `<text x="${x(i)}" y="${padding.top + chartH + 20}" text-anchor="middle" font-size="10" fill="#666" transform="rotate(-45, ${x(i)}, ${padding.top + chartH + 20})">${formatDate(e.date)}</text>`;
    })
    .filter(Boolean)
    .join("\n");

  const tooltipData = history.map((e) => ({
    date: formatDate(e.date),
    total: e.total,
    passed: e.passed,
    failed: e.failed,
    duration: formatDuration(e.duration),
  }));

  return `
    <svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:${width}px;height:auto;">
      <!-- Grid -->
      ${yLines.join("\n")}
      <!-- Axes -->
      <line x1="${padding.left}" y1="${padding.top}" x2="${padding.left}" y2="${padding.top + chartH}" stroke="#ccc" stroke-width="1"/>
      <line x1="${padding.left}" y1="${padding.top + chartH}" x2="${width - padding.right}" y2="${padding.top + chartH}" stroke="#ccc" stroke-width="1"/>
      <!-- Data -->
      ${polyline(history.map((e) => e.total), "#42a5f5", "total")}
      ${polyline(history.map((e) => e.passed), "#66bb6a", "passed")}
      ${polyline(history.map((e) => e.failed), "#ef5350", "failed")}
      <!-- X labels -->
      ${xLabels}
    </svg>
    <script>
      var tooltipData = ${JSON.stringify(tooltipData)};
    </script>
  `;
}

function generateHTML(history) {
  const latest = history.length > 0 ? history[history.length - 1] : null;
  const passRate =
    latest && latest.total > 0
      ? ((latest.passed / latest.total) * 100).toFixed(1)
      : "\u2014";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Test Trends \u2014 Sentry AI SDK Integrations</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; color: #333; }
    .container { max-width: 960px; margin: 0 auto; padding: 20px; }
    .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
    h1 { font-size: 22px; }
    .nav a { color: #1976d2; text-decoration: none; font-size: 14px; }
    .nav a:hover { text-decoration: underline; }
    .card { background: #fff; border-radius: 8px; padding: 24px; margin-bottom: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
    .stats { display: flex; gap: 16px; margin-bottom: 20px; flex-wrap: wrap; }
    .stat { background: #fff; border-radius: 8px; padding: 16px 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); min-width: 120px; text-align: center; }
    .stat h3 { font-size: 12px; color: #888; text-transform: uppercase; margin-bottom: 4px; }
    .stat .value { font-size: 28px; font-weight: 700; }
    .stat.total .value { color: #42a5f5; }
    .stat.passed .value { color: #66bb6a; }
    .stat.failed .value { color: #ef5350; }
    .stat.rate .value { color: #333; }
    .legend { display: flex; gap: 20px; margin-bottom: 16px; font-size: 13px; }
    .legend-item { display: flex; align-items: center; gap: 6px; }
    .legend-dot { width: 10px; height: 10px; border-radius: 50%; }
    .chart-container { position: relative; }
    .tooltip { position: absolute; background: #333; color: #fff; padding: 8px 12px; border-radius: 6px; font-size: 12px; pointer-events: none; opacity: 0; transition: opacity 0.15s; white-space: nowrap; z-index: 10; }
    .tooltip .tt-date { font-weight: 600; margin-bottom: 4px; }
    .tooltip .tt-row { display: flex; justify-content: space-between; gap: 16px; }
    svg .dot { cursor: pointer; }
    svg .dot:hover { r: 6; }
    .table-container { overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { padding: 8px 12px; text-align: right; border-bottom: 1px solid #eee; }
    th { font-weight: 600; color: #666; font-size: 11px; text-transform: uppercase; }
    td:first-child, th:first-child { text-align: left; }
    tr:hover td { background: #f9f9f9; }
    .pass-badge { color: #66bb6a; font-weight: 600; }
    .fail-badge { color: #ef5350; font-weight: 600; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Test Trends</h1>
      <div class="nav"><a href="index.html">&larr; Today's Report</a></div>
    </div>
    <div class="stats">
      <div class="stat total"><h3>Total</h3><div class="value">${latest ? latest.total : "\u2014"}</div></div>
      <div class="stat passed"><h3>Passed</h3><div class="value">${latest ? latest.passed : "\u2014"}</div></div>
      <div class="stat failed"><h3>Failed</h3><div class="value">${latest ? latest.failed : "\u2014"}</div></div>
      <div class="stat rate"><h3>Pass Rate</h3><div class="value">${passRate}%</div></div>
    </div>
    <div class="card">
      <div class="legend">
        <div class="legend-item"><span class="legend-dot" style="background:#42a5f5"></span> Total</div>
        <div class="legend-item"><span class="legend-dot" style="background:#66bb6a"></span> Passed</div>
        <div class="legend-item"><span class="legend-dot" style="background:#ef5350"></span> Failed</div>
      </div>
      <div class="chart-container" id="chart">
        ${generateSVGChart(history)}
        <div class="tooltip" id="tooltip"></div>
      </div>
    </div>
    <div class="card">
      <h2 style="font-size:16px;margin-bottom:12px;">History</h2>
      <div class="table-container">
        <table>
          <thead><tr><th>Date</th><th>Total</th><th>Passed</th><th>Failed</th><th>Pass Rate</th><th>Duration</th></tr></thead>
          <tbody>
            ${history
              .slice()
              .reverse()
              .map((e) => {
                const rate =
                  e.total > 0
                    ? ((e.passed / e.total) * 100).toFixed(1)
                    : "0.0";
                return "<tr><td>" + formatDate(e.date) + "</td><td>" + e.total + '</td><td class="pass-badge">' + e.passed + '</td><td class="fail-badge">' + e.failed + "</td><td>" + rate + "%</td><td>" + formatDuration(e.duration) + "</td></tr>";
              })
              .join("\n")}
          </tbody>
        </table>
      </div>
    </div>
  </div>
  <script>
    (function() {
      var tooltip = document.getElementById('tooltip');
      var chart = document.getElementById('chart');
      var dots = document.querySelectorAll('.dot');
      dots.forEach(function(dot) {
        dot.addEventListener('mouseenter', function(e) {
          var idx = parseInt(dot.getAttribute('data-idx'));
          var series = dot.getAttribute('data-series');
          var d = tooltipData[idx];
          if (!d) return;
          tooltip.innerHTML = '<div class="tt-date">' + d.date + '</div>'
            + '<div class="tt-row"><span>Total:</span><span>' + d.total + '</span></div>'
            + '<div class="tt-row"><span>Passed:</span><span>' + d.passed + '</span></div>'
            + '<div class="tt-row"><span>Failed:</span><span>' + d.failed + '</span></div>'
            + '<div class="tt-row"><span>Duration:</span><span>' + d.duration + '</span></div>';
          tooltip.style.opacity = '1';
          var rect = chart.getBoundingClientRect();
          var cx = parseFloat(dot.getAttribute('cx'));
          var cy = parseFloat(dot.getAttribute('cy'));
          var svg = dot.closest('svg');
          var svgRect = svg.getBoundingClientRect();
          var scaleX = svgRect.width / 900;
          var scaleY = svgRect.height / 400;
          tooltip.style.left = (cx * scaleX + 10) + 'px';
          tooltip.style.top = (cy * scaleY - 10) + 'px';
        });
        dot.addEventListener('mouseleave', function() {
          tooltip.style.opacity = '0';
        });
      });
    })();
  </script>
</body>
</html>`;
}

const args = process.argv.slice(2);

if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
  console.log(`
Usage: node .github/scripts/generate-trends-page.cjs <history-json> [output-path]

Generate an HTML trends page from test history data.

Arguments:
  history-json   Path to the history.json file
  output-path    Optional: Output HTML file path (default: test-results/trends.html)
`);
  process.exit(0);
}

const inputFile = args[0];
const outputPath = args[1] || "test-results/trends.html";

try {
  const content = fs.readFileSync(inputFile, "utf-8");
  const history = JSON.parse(content);

  console.log(`Read ${history.length} history entries from ${inputFile}`);

  const htmlContent = generateHTML(history);

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
