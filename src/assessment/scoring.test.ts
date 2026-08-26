import assert from "node:assert/strict";
import test from "node:test";
import { classifyScore, scoreVariant } from "./scoring.js";
import type { Finding, Observation, VariantAssessment } from "./types.js";

function observation(
	observationId: string,
	state: Observation["state"] = "healthy",
): Observation {
	return {
		observationId,
		capability: observationId,
		state,
		probeId: "llm.baseline",
		variantId: "variant",
		evidence: [],
	};
}

function finding(
	observationId: string,
	severity: Finding["severity"],
): Finding {
	return {
		findingId: `${observationId}.finding`,
		capability: observationId,
		severity,
		title: "Finding",
		description: "Finding description",
		occurrences: [
			{
				variantId: "variant",
				probeId: "llm.baseline",
				observationIds: [observationId],
				evidence: [],
			},
		],
	};
}

function assessment(
	observations: Observation[],
	findings: Finding[] = [],
	completion: VariantAssessment["completion"] = "complete",
): Pick<VariantAssessment, "id" | "completion" | "observations" | "findings"> {
	return { id: "variant", completion, observations, findings };
}

test("healthy observations score 100", () => {
	const score = scoreVariant(
		assessment([observation("model.request"), observation("model.response")]),
	);
	assert.equal(score, 100);
	assert.equal(classifyScore(score, "complete"), "all_good");
});

test("critical findings carry more weight than healthy observations", () => {
	const observations = Array.from({ length: 9 }, (_, index) =>
		observation(`healthy.${index}`),
	);
	observations.push(observation("model.response", "missing"));
	const score = scoreVariant(
		assessment(observations, [finding("model.response", "critical")]),
	);
	assert.equal(score, 47);
	assert.equal(
		classifyScore(score, "complete"),
		"significant_improvements_needed",
	);
});

test("scores of 85 and above use the green classification", () => {
	assert.equal(classifyScore(85, "complete"), "all_good");
	assert.equal(classifyScore(84, "complete"), "improvements_needed");
});

test("incomplete execution is out of spec regardless of collected evidence", () => {
	const score = scoreVariant(
		assessment([observation("model.request")], [], "incomplete"),
	);
	assert.equal(score, 0);
	assert.equal(classifyScore(score, "incomplete"), "out_of_spec");
});
