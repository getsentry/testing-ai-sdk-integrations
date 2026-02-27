#!/usr/bin/env node
/**
 * One-time script to extract historical test data from GitHub Actions logs.
 *
 * Usage:
 *   node .github/scripts/extract-history.cjs [output-path]
 *
 * Requires: `gh` CLI authenticated with access to the repo.
 * Reads the "Daily Test Report" workflow runs and parses the summary lines.
 */

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const outputPath = process.argv[2] || "history.json";

// Get all daily-tests workflow runs
console.log("Fetching workflow runs...");
const runsJson = execSync(
  'gh run list --workflow=daily-tests.yml --limit=200 --json databaseId,startedAt,conclusion',
  { encoding: "utf-8" },
);
const runs = JSON.parse(runsJson);

console.log(`Found ${runs.length} runs. Extracting summaries...`);

const history = [];
const seenDates = new Set();

for (const run of runs) {
  const date = run.startedAt.split("T")[0];

  // Skip if we already have data for this date (keep the latest run)
  if (seenDates.has(date)) continue;

  try {
    const log = execSync(`gh run view ${run.databaseId} --log 2>/dev/null`, {
      encoding: "utf-8",
      maxBuffer: 50 * 1024 * 1024,
    });

    // Parse summary lines — they contain ANSI codes
    const totalMatch = log.match(/Total Tests:\S*\s+(\d+)/);
    const passedMatch = log.match(/Passed:\S*\s+(\d+)/);
    const failedMatch = log.match(/Failed:\S*\s+(\d+)/);
    const durationMatch = log.match(/Duration:\S*\s+([\d.]+)s/);

    if (totalMatch && passedMatch && failedMatch) {
      const entry = {
        date,
        total: parseInt(totalMatch[1], 10),
        passed: parseInt(passedMatch[1], 10),
        failed: parseInt(failedMatch[1], 10),
        duration: durationMatch
          ? Math.round(parseFloat(durationMatch[1]) * 1000)
          : 0,
      };
      history.push(entry);
      seenDates.add(date);
      console.log(
        `  ${date}: ${entry.total} total, ${entry.passed} passed, ${entry.failed} failed`,
      );
    } else {
      console.log(`  ${date}: could not parse summary, skipping`);
    }
  } catch (err) {
    console.log(`  ${date}: failed to fetch log for run ${run.databaseId}`);
  }
}

// Sort by date ascending
history.sort((a, b) => a.date.localeCompare(b.date));

fs.writeFileSync(outputPath, JSON.stringify(history, null, 2) + "\n");
console.log(`\nWrote ${history.length} entries to ${outputPath}`);
