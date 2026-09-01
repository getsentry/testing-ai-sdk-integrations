import assert from "node:assert/strict";
import test from "node:test";
import { resolveFrameworkDependencies } from "../runner/framework-config.js";
import { renderAssessmentProgram } from "./program-renderer.js";
import { resolveVariants, type AssessmentTargetConfig } from "./matrix.js";

const target: AssessmentTargetConfig = {
	platform: "node",
	category: "llm",
	framework: "openai",
	frameworkVersions: ["1.0.0"],
	sentryVersions: ["latest"],
	streamingMode: "both",
	options: { apiStyle: ["chat", "responses"] },
};

test("streaming and blocking do not create separate variants", () => {
	const variants = resolveVariants(target);
	assert.equal(variants.length, 2);
	assert.ok(variants.every((variant) => !variant.id.includes("streaming=")));
});

test("one assessment program runs equivalent calls in streaming and blocking modes", () => {
	const [variant] = resolveVariants(target);
	const rendered = renderAssessmentProgram(target, variant);
	assert.match(rendered.contents, /"streaming":\s*true/);
	assert.match(rendered.contents, /"streaming":\s*false/);
	assert.match(
		rendered.contents,
		/"assessmentCallId":\s*"llm\.baseline:blocking:0"/,
	);
	assert.match(rendered.contents, /"assessmentCallMode":\s*"streaming"/);
	assert.match(
		rendered.contents,
		/await runAssessmentCall\(probe, request, async \(\) =>/,
	);
	assert.deepEqual(rendered.probeCallModes["llm.baseline"], [
		"blocking",
		"streaming",
	]);
	const baseline = rendered.contents.match(
		/"id": "llm\.baseline"[\s\S]*?(?="id": "llm\.multi_turn")/,
	)?.[0];
	assert.ok(baseline);
	assert.equal((baseline.match(/"streaming": false/g) ?? []).length, 1);
	assert.equal((baseline.match(/"streaming": true/g) ?? []).length, 1);
});

test("framework versions can override companion dependency versions", () => {
	const dependencies = resolveFrameworkDependencies(
		{
			dependencies: [
				{ package: "ai", version: "framework" },
				{ package: "@ai-sdk/openai", version: "3.0.90" },
			],
			versionOverrides: {
				"7.0.79": { dependencies: { "@ai-sdk/openai": "4.0.47" } },
			},
		},
		"7.0.79",
	);

	assert.deepEqual(dependencies, [
		{ package: "ai", version: "framework" },
		{ package: "@ai-sdk/openai", version: "4.0.47" },
	]);
});

test("version template options select the matching Vercel API", () => {
	const vercelTarget: AssessmentTargetConfig = {
		platform: "node",
		category: "agents",
		framework: "vercel",
		frameworkVersions: ["6.0.116", "7.0.79"],
		sentryVersions: ["latest"],
		streamingMode: "both",
		options: { agentStyle: ["class"], provider: ["openai"] },
		versionTemplateOptions: {
			"6.0.116": { apiStyle: "v6" },
			"7.0.79": { apiStyle: "v7" },
		},
	};
	const variants = resolveVariants(vercelTarget);
	const v6 = renderAssessmentProgram(vercelTarget, variants[0]).contents;
	const v7 = renderAssessmentProgram(vercelTarget, variants[1]).contents;

	assert.match(v6, /stepCountIs/);
	assert.match(v6, /experimental_telemetry/);
	assert.doesNotMatch(v6, /isStepCount/);
	assert.match(v7, /isStepCount/);
	assert.match(v7, /\n\s*telemetry:/);
	assert.doesNotMatch(v7, /experimental_telemetry/);
});

test("Next.js always enables Vercel experimental telemetry", () => {
	const vercelTarget: AssessmentTargetConfig = {
		platform: "nextjs",
		category: "agents",
		framework: "vercel",
		frameworkVersions: ["7.0.79"],
		sentryVersions: ["10"],
		streamingMode: "both",
		options: { agentStyle: ["class"], provider: ["openai"] },
		versionTemplateOptions: { "7.0.79": { apiStyle: "v7" } },
	};
	const [variant] = resolveVariants(vercelTarget);
	const program = renderAssessmentProgram(vercelTarget, variant).contents;

	assert.match(program, /experimental_telemetry/);
	assert.doesNotMatch(program, /\n\s*telemetry:/);
});
