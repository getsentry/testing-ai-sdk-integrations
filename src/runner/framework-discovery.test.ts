import assert from "node:assert/strict";
import test from "node:test";
import {
	discoverFrameworks,
	parseFrameworkConfig,
} from "./framework-discovery.js";

test("discovers only validated assessment framework configs", () => {
	const frameworks = discoverFrameworks();
	assert.ok(frameworks.length > 0);
	assert.ok(
		frameworks.every(
			(framework) =>
				framework.templatePath.endsWith("assessment.njk") &&
				(framework.category === "llm" || framework.category === "agents"),
		),
	);
});

test("rejects malformed config values before matrix resolution", () => {
	assert.throws(
		() =>
			parseFrameworkConfig(
				{
					name: "openai",
					platform: "node",
					dependencies: [{ package: "openai", version: 4 }],
					versions: ["latest"],
					sentryVersions: ["latest"],
				},
				"node",
			),
		/dependencies/,
	);
	assert.throws(
		() =>
			parseFrameworkConfig(
				{
					name: "openai",
					platform: "python",
					dependencies: [],
					versions: ["latest"],
					sentryVersions: ["latest"],
				},
				"node",
			),
		/platform must match directory/,
	);
});
