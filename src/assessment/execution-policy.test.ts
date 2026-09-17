import assert from "node:assert/strict";
import test from "node:test";
import {
	createEndpointScheduler,
	endpointLimits,
	positiveInteger,
} from "./execution-policy.js";
import { assessmentEndpoint } from "./executor.js";

test("honors small explicit concurrency limits and rejects partial integers", () => {
	for (const value of [1, 2, 6, 12])
		assert.equal(positiveInteger(String(value), "--parallel"), value);
	for (const value of [
		"0",
		"-1",
		"1.5",
		"12junk",
		"Infinity",
		"",
		"9007199254740992",
	])
		assert.throws(() => positiveInteger(value, "--parallel"));
	assert.deepEqual(endpointLimits(["openrouter=1"]), {
		openrouter: 1,
		google: 2,
	});
	assert.throws(() => endpointLimits(["anthropic=2"]));
	assert.throws(() => endpointLimits(["constructor=2"]));
	assert.throws(() => endpointLimits(["__proto__=2"]));
	assert.throws(() => endpointLimits(["google=0"]));
	assert.throws(() => endpointLimits(["google=1=2"]));
	for (const name of ["openai", "anthropic", "langchain", "vercel"])
		assert.equal(assessmentEndpoint({ name }), "openrouter");
	assert.equal(assessmentEndpoint({ name: "google-genai" }), "google");
	assert.equal(assessmentEndpoint({ name: "manual" }), "none");
});

test("endpoint limits apply independently and release slots after rejection", async () => {
	const schedule = createEndpointScheduler({ openrouter: 2, google: 1 });
	const active: Record<string, number> = { openrouter: 0, google: 0 };
	const peaks = { ...active };
	const results = await Promise.allSettled(
		Array.from({ length: 12 }, (_, index) => {
			const endpoint = index % 2 ? "google" : "openrouter";
			return schedule(endpoint, async () => {
				active[endpoint]++;
				peaks[endpoint] = Math.max(peaks[endpoint], active[endpoint]);
				try {
					await new Promise((resolve) => setTimeout(resolve, 5));
					if (index === 0) throw new Error("expected test failure");
				} finally {
					active[endpoint]--;
				}
			});
		}),
	);
	assert.deepEqual(peaks, { openrouter: 2, google: 1 });
	assert.equal(
		results.filter((result) => result.status === "rejected").length,
		1,
	);
	assert.equal(await schedule("none", async () => 42), 42);
});
