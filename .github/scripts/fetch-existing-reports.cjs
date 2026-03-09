#!/usr/bin/env node
/**
 * Fetches existing dated reports from the live GitHub Pages site
 * so they survive redeployment (since deploy-pages replaces the entire site).
 *
 * Usage:
 *   node .github/scripts/fetch-existing-reports.cjs <history-json> <site-dir> <pages-url>
 */

const fs = require("fs");
const path = require("path");

const historyPath = process.argv[2];
const siteDir = process.argv[3];
const pagesUrl = process.argv[4];

if (!historyPath || !siteDir || !pagesUrl) {
  console.error(
    "Usage: node fetch-existing-reports.cjs <history-json> <site-dir> <pages-url>",
  );
  process.exit(1);
}

async function main() {
  const history = JSON.parse(fs.readFileSync(historyPath, "utf-8"));
  const today = new Date().toISOString().split("T")[0];

  let fetched = 0;
  let skipped = 0;
  let failed = 0;

  for (const entry of history) {
    // Skip today's date — we'll use the freshly generated report
    if (entry.date === today) {
      skipped++;
      continue;
    }

    const reportDir = path.join(siteDir, "reports", entry.date);
    const reportFile = path.join(reportDir, "index.html");

    // Skip if we already have it (e.g. from a previous fetch)
    if (fs.existsSync(reportFile)) {
      skipped++;
      continue;
    }

    const url = `${pagesUrl}/reports/${entry.date}/index.html`;
    try {
      const response = await fetch(url);
      if (response.ok) {
        const html = await response.text();
        fs.mkdirSync(reportDir, { recursive: true });
        fs.writeFileSync(reportFile, html, "utf-8");
        fetched++;
      } else {
        // Report doesn't exist on the live site (old entry from before dated reports)
        failed++;
      }
    } catch {
      failed++;
    }
  }

  console.log(
    `Fetched ${fetched} existing reports, skipped ${skipped}, unavailable ${failed}`,
  );
}

main().catch((err) => {
  console.error("Error fetching existing reports:", err);
  process.exit(1);
});
