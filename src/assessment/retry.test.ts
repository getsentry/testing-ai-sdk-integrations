import assert from "node:assert/strict";
import test from "node:test";
import { retryDelay, retryReason } from "./retry.js";
import type { RuntimeFailure } from "./types.js";

const failure = (
	kind: RuntimeFailure["kind"],
	extra: Partial<RuntimeFailure> = {},
): RuntimeFailure => ({
	kind,
	message: "failure",
	stopsVariant: true,
	...extra,
});

test("retries only confirmed transient or explicitly diagnostic failures", () => {
	for (const statusCode of [429, 500, 503, 599])
		assert.equal(
			retryReason([failure("provider", { statusCode })]),
			"transient_provider",
		);
	assert.equal(
		retryReason([failure("provider", { code: "ECONNRESET" })]),
		"transient_provider",
	);
	assert.equal(
		retryReason([failure("timeout"), failure("protocol", { secondary: true })]),
		"diagnostic_timeout",
	);
	assert.equal(retryReason([failure("flush")]), "diagnostic_flush");
	assert.equal(
		retryReason([
			failure("process_exit", {
				message: "Address already in use (EADDRINUSE)",
			}),
		]),
		"port_collision",
	);
	for (const statusCode of [400, 401, 403, 404, 422])
		assert.equal(retryReason([failure("provider", { statusCode })]), undefined);
	for (const kind of [
		"setup",
		"render",
		"collector",
		"harness",
		"protocol",
	] as const)
		assert.equal(retryReason([failure(kind)]), undefined);
	assert.equal(
		retryReason([failure("provider", { message: "fetch failed" })]),
		undefined,
	);
	assert.equal(
		retryReason([failure("timeout"), failure("collector")]),
		undefined,
	);
	assert.equal(retryReason([]), undefined);
});

test("honors Retry-After without silently shortening long server delays", () => {
	assert.equal(
		retryDelay([], () => 0),
		1000,
	);
	assert.equal(
		retryDelay([], () => 0.5),
		1500,
	);
	assert.equal(
		retryDelay([failure("provider", { retryAfterMs: 90_000 })], () => 0),
		90_000,
	);
	assert.equal(
		retryDelay([failure("provider", { retryAfterMs: 120_001 })]),
		undefined,
	);
});
