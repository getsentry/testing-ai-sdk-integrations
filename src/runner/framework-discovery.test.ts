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

for (const platform of ["node", "nextjs", "cloudflare"] as const) {
	test(`LangChain ${platform} keeps companion packages on moving major selectors`, () => {
		const framework = discoverFrameworks().find(
			(config) => config.name === "langchain" && config.platform === platform,
		);
		assert.ok(framework);
		assert.deepEqual(framework.versions, ["1"]);
		assert.ok(
			framework.dependencies.some(
				(dependency) => dependency.version === "framework",
			),
		);
		assert.deepEqual(
			Object.fromEntries(
				framework.dependencies
					.filter((dependency) => dependency.package.startsWith("@langchain/"))
					.map((dependency) => [dependency.package, dependency.version]),
			),
			{
				"@langchain/core": platform === "nextjs" ? "framework" : "1",
				"@langchain/openai": "1",
				"@langchain/anthropic": "1",
			},
		);
	});
}

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
	assert.throws(
		() =>
			parseFrameworkConfig(
				{
					name: "openai",
					platform: "node",
					dependencies: [],
					versions: ["latest"],
					sentryVersions: ["latest"],
					executionTimeoutMs: 0,
				},
				"node",
			),
		/executionTimeoutMs/,
	);
});
