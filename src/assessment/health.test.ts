import assert from "node:assert/strict";
import test from "node:test";
import { deriveCompletion } from "./health.js";

test("only variant-stopping failures make execution incomplete", () => {
	assert.equal(deriveCompletion([]), "complete");
	assert.equal(
		deriveCompletion([
			{
				kind: "provider",
				message: "A later probe failed",
				stopsVariant: false,
			},
		]),
		"complete",
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
