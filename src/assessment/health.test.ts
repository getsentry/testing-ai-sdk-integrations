import assert from "node:assert/strict";
import test from "node:test";
import { deriveCompletion } from "./health.js";

test("unrecovered failures make execution incomplete even when later probes continue", () => {
	assert.equal(deriveCompletion([]), "complete");
	assert.equal(
		deriveCompletion([
			{
				kind: "provider",
				message: "A later probe failed",
				stopsVariant: false,
			},
		]),
		"incomplete",
	);
	assert.equal(
		deriveCompletion([
			{
				kind: "protocol",
				message: "A probe did not finish",
				stopsVariant: true,
			},
		]),
		"incomplete",
	);
});
