import assert from "node:assert/strict";
import test from "node:test";
import { renderTemplate } from "./template-renderer.js";

test("renders LiteLLM with its explicit Sentry integration", () => {
	const program = renderTemplate("llm/python/litellm/assessment.njk", {
		targetId: "python/llm/litellm",
		variantId: "variant",
		probes: [],
		provider: "openai",
		apiStyle: "completion",
		isAsync: false,
	});

	const integrationImport = program.indexOf(
		"from sentry_sdk.integrations.litellm import LiteLLMIntegration",
	);
	assert.ok(integrationImport >= 0);
	assert.ok(integrationImport < program.indexOf("sentry_sdk.init("));
	assert.match(
		program,
		/integrations=\[LiteLLMIntegration\(include_prompts=True\)\]/,
	);
	assert.match(program, /disabled_integrations=\[OpenAIIntegration\(\)\]/);
	assert.match(program, /finally:\n\s+await asyncio\.sleep\(0\.1\)/);
});
