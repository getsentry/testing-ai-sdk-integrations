import type {
	CapturedSpan,
	Observation,
	ProbeResult,
} from "../../assessment/types.js";
import { isClientSpan, isGenAiSpan } from "./telemetry-shared.js";

export interface ExpectedAssessmentCall {
	assessmentCallId: string;
	assessmentCallMode: "blocking" | "streaming";
	allowsMultipleClientSpans?: boolean;
}

export interface ClientSpanEvaluation {
	clientSpan?: CapturedSpan;
	observations: Observation[];
}

function spanKey(span: CapturedSpan): string {
	return `${span.trace_id}:${span.span_id}`;
}

function parentKey(span: CapturedSpan): string | undefined {
	return typeof span.parent_span_id === "string"
		? `${span.trace_id}:${span.parent_span_id}`
		: undefined;
}

function assessmentCallId(span: CapturedSpan): string | undefined {
	const value = span.data?.["test.call.id"];
	return span.op === "test.assessment.call" && typeof value === "string"
		? value
		: undefined;
}

function callAncestor(
	span: CapturedSpan,
	spansById: ReadonlyMap<string, CapturedSpan>,
): CapturedSpan | undefined {
	let current: CapturedSpan | undefined = span;
	const visited = new Set<string>();
	while (current) {
		const key = spanKey(current);
		if (visited.has(key)) return undefined;
		visited.add(key);
		if (assessmentCallId(current)) return current;
		const parent = parentKey(current);
		current = parent ? spansById.get(parent) : undefined;
	}
	return undefined;
}

function cardinalityObservation(
	probe: ProbeResult,
	variantId: string,
	call: ExpectedAssessmentCall,
	state: Observation["state"],
	count: number,
	spans: readonly CapturedSpan[],
): Observation {
	return {
		observationId: `spans.client:${call.assessmentCallId}`,
		capability: "spans.client",
		state,
		probeId: probe.probeId,
		variantId,
		actual: {
			callId: call.assessmentCallId,
			mode: call.assessmentCallMode,
			clientSpans: count,
		},
		expected: {
			callId: call.assessmentCallId,
			mode: call.assessmentCallMode,
			clientSpans: call.allowsMultipleClientSpans ? ">= 1" : 1,
		},
		evidence: spans.map((span) => ({
			spanId: span.span_id,
			traceId: span.trace_id,
			attribute: "test.call.id",
			value: call.assessmentCallId,
			description: span.description,
		})),
	};
}

/**
 * Require a client span beneath every generated assessment call. Plain model
 * calls must produce exactly one; agent tool loops may produce multiple model
 * turns. The call boundary makes blocking and streaming coverage independently
 * observable instead of relying on timestamp ordering within a probe.
 */
export function evaluateClientSpans(
	probe: ProbeResult,
	variantId: string,
	spans: readonly CapturedSpan[],
	expectedCalls: readonly ExpectedAssessmentCall[],
): ClientSpanEvaluation {
	const genAiSpans = spans.filter(isGenAiSpan);
	if (genAiSpans.length === 0) {
		return {
			observations: [
				{
					observationId: "spans.gen_ai",
					capability: "spans.gen_ai",
					state: "missing",
					probeId: probe.probeId,
					variantId,
					evidence: [],
				},
			],
		};
	}

	const spansById = new Map(spans.map((span) => [spanKey(span), span]));
	const clients = genAiSpans.filter(isClientSpan);
	const clientsByCall = new Map<string, CapturedSpan[]>();
	const unassignedClients: CapturedSpan[] = [];
	for (const client of clients) {
		const call = callAncestor(client, spansById);
		const callId = call && assessmentCallId(call);
		if (!callId) {
			unassignedClients.push(client);
			continue;
		}
		const bucket = clientsByCall.get(callId) ?? [];
		bucket.push(client);
		clientsByCall.set(callId, bucket);
	}

	const expectedIds = new Set(
		expectedCalls.map((call) => call.assessmentCallId),
	);
	const observations = expectedCalls.map((call) => {
		const callClients = clientsByCall.get(call.assessmentCallId) ?? [];
		const callSpans =
			callClients.length > 0
				? callClients
				: spans.filter(
						(span) => assessmentCallId(span) === call.assessmentCallId,
					);
		let state: Observation["state"] = "malformed";
		if (
			callClients.length === 1 ||
			(call.allowsMultipleClientSpans && callClients.length > 1)
		) {
			state = "healthy";
		} else if (callClients.length === 0) {
			state = "missing";
		}
		return cardinalityObservation(
			probe,
			variantId,
			call,
			state,
			callClients.length,
			callSpans,
		);
	});

	const unexpectedClients = [
		...unassignedClients,
		...[...clientsByCall.entries()].flatMap(([callId, callClients]) =>
			expectedIds.has(callId) ? [] : callClients,
		),
	];
	if (unexpectedClients.length > 0) {
		observations.push({
			observationId: "spans.client:unexpected",
			capability: "spans.client",
			state: "malformed",
			probeId: probe.probeId,
			variantId,
			actual: unexpectedClients.length,
			expected: 0,
			evidence: unexpectedClients.map((span) => ({
				spanId: span.span_id,
				traceId: span.trace_id,
				description: span.description,
			})),
		});
	}

	return { clientSpan: clients[0], observations };
}
