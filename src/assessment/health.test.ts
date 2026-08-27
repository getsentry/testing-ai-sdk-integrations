import assert from "node:assert/strict";
import test from "node:test";
import { deriveCompletion } from "./health.js";

test("any runtime failure makes execution incomplete", () => {
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
});
