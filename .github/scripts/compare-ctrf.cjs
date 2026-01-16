#!/usr/bin/env node
/**
 * Compare two CTRF reports and generate a markdown comparison.
 *
 * Usage: node compare-ctrf.cjs <main-report.json> <pr-report.json> <output.md>
 *
 * Categories:
 * - Regressions: Test existed on main AND was passing, now failing
 * - Fixes: Test existed on main AND was failing, now passing
 * - New Tests (Passing): Only exists in PR, passes
 * - New Tests (Failing): Only exists in PR, fails (NOT a regression)
 * - Removed Tests: Existed on main, not in PR
 * - Unchanged: Same status on both branches
 */

const fs = require("fs");
const path = require("path");

// Parse command line arguments
const [, , mainPath, prPath, outputPath] = process.argv;

if (!mainPath || !prPath || !outputPath) {
  console.error(
    "Usage: node compare-ctrf.cjs <main-report.json> <pr-report.json> <output.md>"
  );
  process.exit(1);
}

// Load reports
let mainReport, prReport;
try {
  mainReport = JSON.parse(fs.readFileSync(mainPath, "utf8"));
  prReport = JSON.parse(fs.readFileSync(prPath, "utf8"));
} catch (e) {
  console.error(`Error loading reports: ${e.message}`);
  process.exit(1);
}

// Build test maps by name
const mainTests = new Map();
mainReport.results.tests.forEach((test) => {
  mainTests.set(test.name, test);
});

const prTests = new Map();
prReport.results.tests.forEach((test) => {
  prTests.set(test.name, test);
});

// Categorize tests
const regressions = []; // Was passing on main, now failing
const fixes = []; // Was failing on main, now passing
const newPassing = []; // Only in PR, passing
const newFailing = []; // Only in PR, failing
const removed = []; // Only in main
const unchanged = []; // Same status

// Check PR tests against main
for (const [name, prTest] of prTests) {
  const mainTest = mainTests.get(name);

  if (!mainTest) {
    // New test in PR
    if (prTest.status === "passed") {
      newPassing.push({ name, prTest });
    } else {
      newFailing.push({ name, prTest });
    }
  } else {
    // Test exists in both
    const mainPassed = mainTest.status === "passed";
    const prPassed = prTest.status === "passed";

    if (mainPassed && !prPassed) {
      regressions.push({ name, mainTest, prTest });
    } else if (!mainPassed && prPassed) {
      fixes.push({ name, mainTest, prTest });
    } else {
      unchanged.push({ name, mainTest, prTest });
    }
  }
}

// Check for removed tests
for (const [name, mainTest] of mainTests) {
  if (!prTests.has(name)) {
    removed.push({ name, mainTest });
  }
}

// Calculate summaries
const mainSummary = mainReport.results.summary;
const prSummary = prReport.results.summary;

// Helper functions
function formatDiff(main, pr) {
  const diff = pr - main;
  if (diff === 0) return "—";
  if (diff > 0) return `+${diff}`;
  return `${diff}`;
}

function getDiffIndicator(main, pr, higherIsBetter) {
  const diff = pr - main;
  if (diff === 0) return "";
  if (higherIsBetter) {
    return diff > 0 ? " ✅" : " ⚠️";
  } else {
    return diff < 0 ? " ✅" : " ⚠️";
  }
}

function getStatusEmoji(status) {
  return status === "passed" ? "✅" : "❌";
}

function parseTestName(name) {
  // Format: "js/vercel :: 1-simple"
  const parts = name.split(" :: ");
  return {
    sdk: parts[0] || name,
    caseId: parts[1] || "",
  };
}

// Determine overall status
let statusEmoji, statusText;
if (regressions.length > 0) {
  statusEmoji = "🔴";
  statusText = `${regressions.length} regression${regressions.length > 1 ? "s" : ""} detected`;
} else if (fixes.length > 0 && prSummary.failed > 0) {
  statusEmoji = "🟡";
  statusText = `${fixes.length} test${fixes.length > 1 ? "s" : ""} fixed, ${prSummary.failed} still failing`;
} else if (prSummary.failed === 0) {
  statusEmoji = "🟢";
  statusText = "All tests passing";
} else {
  statusEmoji = "🟡";
  statusText = `${prSummary.failed} test${prSummary.failed > 1 ? "s" : ""} failing (no regressions)`;
}

// Build markdown output
let md = `## ${statusEmoji} AI SDK Integration Test Results

**Status:** ${statusText}

### Summary

| Metric | main | PR | Change |
|--------|-----:|---:|--------|
| **Total Tests** | ${mainSummary.tests} | ${prSummary.tests} | ${formatDiff(mainSummary.tests, prSummary.tests)} |
| **Passed** | ${mainSummary.passed} | ${prSummary.passed} | ${formatDiff(mainSummary.passed, prSummary.passed)}${getDiffIndicator(mainSummary.passed, prSummary.passed, true)} |
| **Failed** | ${mainSummary.failed} | ${prSummary.failed} | ${formatDiff(mainSummary.failed, prSummary.failed)}${getDiffIndicator(mainSummary.failed, prSummary.failed, false)} |

`;

// Regressions section (most important - always show if any)
if (regressions.length > 0) {
  md += `### 🔴 Regressions

These tests were **passing on main** but are now **failing**:

`;
  for (const { name, prTest } of regressions) {
    const { sdk, caseId } = parseTestName(name);
    md += `<details>
<summary><strong>${sdk}</strong> :: ${caseId}</summary>

`;
    if (prTest.message) {
      md += `**Error:** ${prTest.message}\n\n`;
    }
    if (prTest.trace) {
      md += `\`\`\`
${prTest.trace}
\`\`\`
`;
    }
    md += `</details>

`;
  }
}

// Fixes section
if (fixes.length > 0) {
  md += `### ✅ Fixed

These tests were **failing on main** but are now **passing**:

`;
  for (const { name } of fixes) {
    const { sdk, caseId } = parseTestName(name);
    md += `- **${sdk}** :: ${caseId}\n`;
  }
  md += "\n";
}

// New tests section
if (newPassing.length > 0 || newFailing.length > 0) {
  md += `### 🆕 New Tests

`;
  if (newPassing.length > 0) {
    md += `**Passing (${newPassing.length}):**\n`;
    for (const { name } of newPassing) {
      const { sdk, caseId } = parseTestName(name);
      md += `- ✅ **${sdk}** :: ${caseId}\n`;
    }
    md += "\n";
  }
  if (newFailing.length > 0) {
    md += `**Failing (${newFailing.length}):**\n`;
    for (const { name, prTest } of newFailing) {
      const { sdk, caseId } = parseTestName(name);
      md += `<details>
<summary>❌ <strong>${sdk}</strong> :: ${caseId}</summary>

`;
      if (prTest.message) {
        md += `**Error:** ${prTest.message}\n\n`;
      }
      if (prTest.trace) {
        md += `\`\`\`
${prTest.trace}
\`\`\`
`;
      }
      md += `</details>

`;
    }
  }
}

// Removed tests section (informational)
if (removed.length > 0) {
  md += `### 🗑️ Removed Tests

These tests existed on main but are not in the PR:

`;
  for (const { name } of removed) {
    const { sdk, caseId } = parseTestName(name);
    md += `- **${sdk}** :: ${caseId}\n`;
  }
  md += "\n";
}

// Test matrix
md += `### Test Matrix

`;

// Collect all SDKs and test cases
const allSdks = new Set();
const allCases = new Set();

for (const test of [...mainReport.results.tests, ...prReport.results.tests]) {
  const { sdk, caseId } = parseTestName(test.name);
  allSdks.add(sdk);
  if (caseId) allCases.add(caseId);
}

const sortedSdks = [...allSdks].sort();
const sortedCases = [...allCases].sort();

// Build matrix header
md += `| SDK | ${sortedCases.join(" | ")} |
|-----|${sortedCases.map(() => ":---:").join("|")}|
`;

// Build matrix rows
for (const sdk of sortedSdks) {
  md += `| **${sdk}** |`;

  for (const caseId of sortedCases) {
    const testName = `${sdk} :: ${caseId}`;
    const mainTest = mainTests.get(testName);
    const prTest = prTests.get(testName);

    let cell = "";

    if (!prTest && !mainTest) {
      cell = "—";
    } else if (!prTest && mainTest) {
      // Removed
      cell = "🗑️";
    } else if (prTest && !mainTest) {
      // New test
      cell = prTest.status === "passed" ? "✅🆕" : "❌🆕";
    } else {
      // Exists in both
      const mainPassed = mainTest.status === "passed";
      const prPassed = prTest.status === "passed";

      if (mainPassed && prPassed) {
        cell = "✅";
      } else if (!mainPassed && !prPassed) {
        cell = "❌";
      } else if (mainPassed && !prPassed) {
        cell = "❌📉"; // Regression
      } else {
        cell = "✅🔧"; // Fixed
      }
    }

    md += ` ${cell} |`;
  }

  md += "\n";
}

md += `
**Legend:** ✅ Pass | ❌ Fail | ✅🔧 Fixed | ❌📉 Regressed | ✅🆕 New (pass) | ❌🆕 New (fail) | 🗑️ Removed

---
*Generated by [AI SDK Integration Tests](https://github.com/getsentry/testing-ai-sdk-integrations)*
`;

// Write output
fs.writeFileSync(outputPath, md, "utf8");
console.log(`Comparison written to ${outputPath}`);

// Write env file for regression detection
const envPath = outputPath.replace(/\.md$/, ".env");
fs.writeFileSync(
  envPath,
  `HAS_REGRESSIONS=${regressions.length > 0}\n`,
  "utf8"
);

// Print summary to console
console.log(`\nSummary:`);
console.log(`  Regressions: ${regressions.length}`);
console.log(`  Fixes: ${fixes.length}`);
console.log(`  New (passing): ${newPassing.length}`);
console.log(`  New (failing): ${newFailing.length}`);
console.log(`  Removed: ${removed.length}`);
console.log(`  Unchanged: ${unchanged.length}`);

// Exit with appropriate code
if (regressions.length > 0) {
  console.log(`\n⚠️  ${regressions.length} regression(s) detected!`);
}
