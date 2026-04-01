#!/usr/bin/env node
/**
 * CLI script to generate an HTML report from a CTRF JSON file
 *
 * Usage:
 *   npm run report <ctrf-json-file>
 *   npm run report test-results/ctrf-report-2024-01-15-120000.json
 */

import { readFile } from "fs/promises";
import { basename, dirname, join } from "path";
import type { Report } from "ctrf";
import {
  generateHTML,
  writeHTMLReport,
  getTimestamp,
  copyScriptsForReport,
} from "./reporters/html-generator.js";

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    console.log(`
Usage: npm run report <ctrf-json-file> [output-dir]

Generate an HTML report from a CTRF JSON file.

Arguments:
  ctrf-json-file   Path to the CTRF JSON report file
  output-dir       Optional: Directory to write the HTML report (default: same as input)

Examples:
  npm run report test-results/ctrf-report-2024-01-15-120000.json
  npm run report test-results/ctrf-report.json ./reports
`);
    process.exit(0);
  }

  const inputFile = args[0];
  const outputDir = args[1] || dirname(inputFile);

  try {
    // Read and parse CTRF JSON
    console.log(`Reading CTRF report: ${inputFile}`);
    const content = await readFile(inputFile, "utf-8");
    const report: Report = JSON.parse(content);

    // Validate it's a CTRF report
    if (report.reportFormat !== "CTRF") {
      console.error(
        "Error: Input file does not appear to be a valid CTRF report",
      );
      process.exit(1);
    }

    // Copy script files alongside report and generate HTML
    console.log("Generating HTML report...");
    await copyScriptsForReport(report, outputDir);
    const htmlContent = generateHTML(report);

    // Extract timestamp from input filename or generate new one
    const inputBasename = basename(inputFile, ".json");
    const timestampMatch = inputBasename.match(/(\d{4}-\d{2}-\d{2}-\d{6})$/);
    const timestamp = timestampMatch ? timestampMatch[1] : getTimestamp();

    // Write HTML report
    const outputPath = await writeHTMLReport(htmlContent, outputDir, timestamp);
    console.log(`✓ HTML report written to: ${outputPath}`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      console.error(`Error: File not found: ${inputFile}`);
    } else if (error instanceof SyntaxError) {
      console.error(`Error: Invalid JSON in file: ${inputFile}`);
    } else {
      console.error("Error:", error);
    }
    process.exit(1);
  }
}

main();
