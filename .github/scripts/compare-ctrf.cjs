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
  // Format: "js/vercel :: Basic LLM Test (async, streaming)"
  const parts = name.split(" :: ");
  const fullCaseId = parts[1] || "";
  // Strip mode suffix: "Basic LLM Test (async, streaming)" -> "Basic LLM Test"
  const baseCaseId = fullCaseId.replace(/\s*\([^)]*\)\s*$/, "").trim();
  // Extract mode: "(async, streaming)" -> "async, streaming"
  const modeMatch = fullCaseId.match(/\(([^)]+)\)$/);
  const mode = modeMatch ? modeMatch[1] : null;
  return {
    sdk: parts[0] || name,
    caseId: fullCaseId,
    baseCaseId,
    mode,
  };
}

function getTestType(test) {
  // Try extra.testType first, then infer from tags
  if (test.extra && test.extra.testType) return test.extra.testType;
  if (test.tags) {
    if (test.tags.includes("llm")) return "llm";
    if (test.tags.includes("agent")) return "agent";
    if (test.tags.includes("embeddings")) return "embeddings";
    if (test.tags.includes("mcp")) return "mcp";
  }
  return "unknown";
}

/**
 * Natural sort comparison for test case names (e.g., "1-foo" before "2-bar")
 */
function naturalSortCompare(a, b) {
  const aMatch = a.match(/^(\d+)/);
  const bMatch = b.match(/^(\d+)/);
  if (aMatch && bMatch) {
    const diff = parseInt(aMatch[1], 10) - parseInt(bMatch[1], 10);
    if (diff !== 0) return diff;
    return a.localeCompare(b);
  }
  if (aMatch) return -1;
  if (bMatch) return 1;
  return a.localeCompare(b);
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

// Test matrix — split by type with combined variations
md += `### Test Matrix

`;

/**
 * Build a combined cell for grouped variations of the same base test.
 * mainVariations/prVariations: arrays of { mode, status } or empty arrays.
 */
function buildCombinedCell(mainVariations, prVariations) {
  // No data at all
  if (mainVariations.length === 0 && prVariations.length === 0) {
    return "—";
  }

  // Removed (existed on main, not in PR)
  if (prVariations.length === 0 && mainVariations.length > 0) {
    return "🗑️";
  }

  // Collect all modes from both sides for consistent ordering
  const allModes = [
    ...new Set([
      ...mainVariations.map((v) => v.mode),
      ...prVariations.map((v) => v.mode),
    ]),
  ].sort();

  // Single variation — simple cell
  if (allModes.length === 1) {
    const prV = prVariations.find((v) => v.mode === allModes[0]);
    const mainV = mainVariations.find((v) => v.mode === allModes[0]);

    if (prV && !mainV) {
      return prV.status === "passed" ? "✅🆕" : "❌🆕";
    }
    if (!prV && mainV) {
      return "🗑️";
    }
    const mainPassed = mainV.status === "passed";
    const prPassed = prV.status === "passed";
    if (mainPassed && prPassed) return "✅";
    if (!mainPassed && !prPassed) return "❌";
    if (mainPassed && !prPassed) return "❌📉";
    return "✅🔧";
  }

  // Multiple variations — show one icon per variation with mode label
  const parts = allModes.map((mode) => {
    const prV = prVariations.find((v) => v.mode === mode);
    const mainV = mainVariations.find((v) => v.mode === mode);
    // Abbreviate mode labels
    const label = abbreviateMode(mode);

    let icon;
    if (prV && !mainV) {
      icon = prV.status === "passed" ? "✅🆕" : "❌🆕";
    } else if (!prV && mainV) {
      icon = "🗑️";
    } else {
      const mainPassed = mainV.status === "passed";
      const prPassed = prV.status === "passed";
      if (mainPassed && prPassed) icon = "✅";
      else if (!mainPassed && !prPassed) icon = "❌";
      else if (mainPassed && !prPassed) icon = "❌📉";
      else icon = "✅🔧";
    }
    return `${icon}<sub>${label}</sub>`;
  });

  return parts.join(" ");
}

function abbreviateMode(mode) {
  if (!mode) return "";
  return mode
    .replace("streaming", "str")
    .replace("blocking", "blk")
    .replace("async", "a")
    .replace("sync", "s")
    .replace("stdio", "io")
    .replace("sse", "sse");
}

// Group all tests by type, separately for main and PR
const typeGroups = new Map(); // type -> { sdks: Set, baseCases: Set, mainMap: Map, prMap: Map }

function ensureTypeGroup(testType) {
  if (!typeGroups.has(testType)) {
    typeGroups.set(testType, {
      sdks: new Set(),
      baseCases: new Set(),
      mainMap: new Map(), // "sdk::baseCaseId" -> [{ mode, status }]
      prMap: new Map(),
    });
  }
  return typeGroups.get(testType);
}

function addTestToGroup(test, targetMapName) {
  const testType = getTestType(test);
  const { sdk, baseCaseId, mode } = parseTestName(test.name);
  const group = ensureTypeGroup(testType);

  group.sdks.add(sdk);
  if (baseCaseId) group.baseCases.add(baseCaseId);

  const key = `${sdk}::${baseCaseId}`;
  const variation = { mode: mode || "default", status: test.status };
  const targetMap = group[targetMapName];
  if (!targetMap.has(key)) {
    targetMap.set(key, []);
  }
  targetMap.get(key).push(variation);
}

for (const test of mainReport.results.tests) {
  addTestToGroup(test, "mainMap");
}
for (const test of prReport.results.tests) {
  addTestToGroup(test, "prMap");
}

const typeLabels = {
  llm: "LLM Tests",
  agent: "Agent Tests",
  embeddings: "Embedding Tests",
  mcp: "MCP Tests",
};

// Render a matrix for each type
for (const [testType, group] of typeGroups) {
  const title = typeLabels[testType] || `${testType} Tests`;
  const sortedSdks = [...group.sdks].sort();
  const sortedCases = [...group.baseCases].sort(naturalSortCompare);

  if (sortedCases.length === 0) continue;

  md += `#### ${title}

`;

  md += `| SDK | ${sortedCases.join(" | ")} |
|-----|${sortedCases.map(() => ":---:").join("|")}|
`;

  for (const sdk of sortedSdks) {
    md += `| **${sdk}** |`;

    for (const baseCaseId of sortedCases) {
      const key = `${sdk}::${baseCaseId}`;
      const mainVariations = group.mainMap.get(key) || [];
      const prVariations = group.prMap.get(key) || [];
      const cell = buildCombinedCell(mainVariations, prVariations);
      md += ` ${cell} |`;
    }

    md += "\n";
  }

  md += "\n";
}

md += `**Legend:** ✅ Pass | ❌ Fail | ✅🔧 Fixed | ❌📉 Regressed | ✅🆕 New (pass) | ❌🆕 New (fail) | 🗑️ Removed | <sub>str</sub>=streaming <sub>blk</sub>=blocking <sub>a</sub>=async <sub>s</sub>=sync <sub>io</sub>=stdio <sub>sse</sub>=sse

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
