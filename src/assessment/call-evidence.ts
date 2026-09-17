import { getProbeInputs } from "../probes/inputs.js";
import type {
	AssessmentCategory,
	CallResult,
	ExecutionCoverage,
	ProbeResult,
} from "./types.js";

export function plannedCalls(
	category: AssessmentCategory,
	probe: Pick<ProbeResult, "probeId" | "callModes">,
): CallResult[] {
	const input = getProbeInputs(category)[probe.probeId];
	return probe.callModes.flatMap((mode) =>
		input.calls.map((_, index) => ({
			callId: `${probe.probeId}:${mode}:${index}`,
			mode,
			status: "not_executed" as const,
			tools: [],
		})),
	);
}

export function coverage(probes: readonly ProbeResult[]): ExecutionCoverage {
	const result = {
		planned: 0,
		succeeded: 0,
		expectedErrors: 0,
		failed: 0,
		cancelled: 0,
		notExecuted: 0,
	};
	for (const call of probes.flatMap((probe) => probe.calls ?? [])) {
		result.planned++;
		if (call.status === "succeeded") result.succeeded++;
		else if (call.status === "failed" && call.expectedError)
			result.expectedErrors++;
		else if (call.status === "failed") result.failed++;
		else if (call.status === "cancelled" || call.status === "running")
			result.cancelled++;
		else result.notExecuted++;
	}
	return result;
}
