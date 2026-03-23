#!/usr/bin/env node
/**
 * Backfills per-platform breakdowns into history.json from CTRF reports.
 *
 * For each history entry missing `platforms`, scans the CTRF reports directory
 * for a report matching that date and extracts per-platform stats.
 *
 * Usage:
 *   node .github/scripts/backfill-platforms.cjs <history-json> <ctrf-dir>
 *
 * Example:
 *   node .github/scripts/backfill-platforms.cjs history.json test-results
 */

const fs = require("fs");
const path = require("path");

const historyPath = process.argv[2];
const ctrfDir = process.argv[3];

if (!historyPath || !ctrfDir) {
  console.error(
    "Usage: node backfill-platforms.cjs <history-json> <ctrf-dir>",
  );
  process.exit(1);
}

// Read history
let history = [];
try {
  history = JSON.parse(fs.readFileSync(historyPath, "utf-8"));
} catch {
  console.error(`Cannot read history from ${historyPath}`);
  process.exit(1);
}

// Index CTRF reports by date (YYYY-MM-DD)
// Filename format: ctrf-report-YYYY-MM-DD-HHmmss.json
// Multiple reports may exist per date (dev runs vs CI). Pick the one with the
// most tests, which is typically the full CI run.
const reportsByDate = new Map();
const testCountByDate = new Map();
const files = fs
  .readdirSync(ctrfDir)
  .filter((f) => f.startsWith("ctrf-report-") && f.endsWith(".json"));

for (const file of files) {
  const match = file.match(/^ctrf-report-(\d{4}-\d{2}-\d{2})-/);
  if (!match) continue;
  const date = match[1];
  const filePath = path.join(ctrfDir, file);
  try {
    const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    const testCount = data.results.summary.tests || 0;
    if (!reportsByDate.has(date) || testCount > testCountByDate.get(date)) {
      reportsByDate.set(date, filePath);
      testCountByDate.set(date, testCount);
    }
  } catch {
    // Skip unreadable files
  }
}

console.log(
  `Found ${reportsByDate.size} dated CTRF reports in ${ctrfDir}`,
);

let backfilled = 0;
let skipped = 0;

for (const entry of history) {
  // Skip entries that already have platform data
  if (entry.platforms && Object.keys(entry.platforms).length > 0) {
    skipped++;
    continue;
  }

  const reportPath = reportsByDate.get(entry.date);
  if (!reportPath) {
    continue;
  }

  try {
    const ctrf = JSON.parse(fs.readFileSync(reportPath, "utf-8"));
    const platforms = {};

    for (const test of ctrf.results.tests) {
      const platform = (test.extra && test.extra.platform) || "unknown";
      if (!platforms[platform]) {
        platforms[platform] = { total: 0, passed: 0, failed: 0 };
      }
      platforms[platform].total++;
      if (test.status === "passed") platforms[platform].passed++;
      else if (test.status === "failed") platforms[platform].failed++;
    }

    if (Object.keys(platforms).length > 0) {
      entry.platforms = platforms;
      backfilled++;
    }
  } catch (err) {
    console.warn(`  Warning: Could not parse ${reportPath}: ${err.message}`);
  }
}

fs.writeFileSync(historyPath, JSON.stringify(history, null, 2) + "\n");
console.log(
  `Backfilled ${backfilled} entries, ${skipped} already had platform data`,
);
