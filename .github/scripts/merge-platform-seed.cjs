#!/usr/bin/env node
/**
 * Merges platform data from a seed file into history.json.
 * Only fills in entries that are missing the `platforms` field.
 * The seed is a one-time backfill — once all entries have platform data
 * (written by update-history.cjs going forward), this script is a no-op.
 *
 * Usage:
 *   node .github/scripts/merge-platform-seed.cjs <history-json> <seed-json>
 */

const fs = require("fs");

const historyPath = process.argv[2];
const seedPath = process.argv[3];

if (!historyPath || !seedPath) {
  console.error(
    "Usage: node merge-platform-seed.cjs <history-json> <seed-json>",
  );
  process.exit(1);
}

if (!fs.existsSync(seedPath)) {
  console.log("No seed file found, skipping.");
  process.exit(0);
}

const history = JSON.parse(fs.readFileSync(historyPath, "utf-8"));
const seed = JSON.parse(fs.readFileSync(seedPath, "utf-8"));

let merged = 0;
for (const entry of history) {
  if (!entry.platforms && seed[entry.date]) {
    entry.platforms = seed[entry.date];
    merged++;
  }
}

if (merged > 0) {
  fs.writeFileSync(historyPath, JSON.stringify(history, null, 2) + "\n");
}
console.log(`Merged platform data into ${merged} entries from seed.`);
