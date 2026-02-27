#!/usr/bin/env node
/**
 * Appends today's CTRF summary to the history JSON file.
 * Used in the daily CI workflow after tests complete.
 *
 * Usage:
 *   node .github/scripts/update-history.cjs <ctrf-json> <history-json>
 */

const fs = require("fs");

const ctrfPath = process.argv[2];
const historyPath = process.argv[3];

if (!ctrfPath || !historyPath) {
  console.error(
    "Usage: node update-history.cjs <ctrf-json-path> <history-json-path>",
  );
  process.exit(1);
}

// Read CTRF report
const ctrf = JSON.parse(fs.readFileSync(ctrfPath, "utf-8"));
const summary = ctrf.results.summary;

// Read existing history or start fresh
let history = [];
if (fs.existsSync(historyPath)) {
  try {
    history = JSON.parse(fs.readFileSync(historyPath, "utf-8"));
  } catch {
    history = [];
  }
}

// Build today's entry
const today = new Date().toISOString().split("T")[0];
const entry = {
  date: today,
  total: summary.tests,
  passed: summary.passed,
  failed: summary.failed,
  duration: summary.stop - summary.start,
};

// Replace existing entry for today, or append
const existingIdx = history.findIndex((e) => e.date === today);
if (existingIdx >= 0) {
  history[existingIdx] = entry;
} else {
  history.push(entry);
}

// Sort by date
history.sort((a, b) => a.date.localeCompare(b.date));

fs.writeFileSync(historyPath, JSON.stringify(history, null, 2) + "\n");
console.log(
  `Updated history: ${today} — ${entry.total} total, ${entry.passed} passed, ${entry.failed} failed`,
);
