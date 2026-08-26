import type { CapturedSpan } from "../../assessment/types.js"
import type { Evidence } from "../../assessment/types.js";

export interface NormalizedAttribute<T> {
	state: "modern" | "legacy" | "missing" | "malformed";
	value?: T;
	attribute?: string;
	replacement?: string;
	evidence: Evidence[];
}

export type AttributeParser<T> = (value: unknown) => T | undefined;

function evidence(
	span: CapturedSpan,
	attribute: string,
	value: unknown,
): Evidence {
	return {
		spanId: span.span_id,
		traceId: span.trace_id,
		attribute,
		value,
	};
}

/**
 * Normalize a modern attribute and its legacy fallback in one place. A malformed
 * modern value is not silently replaced by a legacy value: it is evidence that
 * the integration emitted invalid current telemetry.
 */
export function normalizeAttribute<T>(
	span: CapturedSpan,
	modernAttribute: string,
	legacyAttribute: string,
	parseModern: AttributeParser<T>,
	parseLegacy: AttributeParser<T> = parseModern,
): NormalizedAttribute<T> {
	const modern = span.data?.[modernAttribute];
	if (modern !== undefined) {
		const value = parseModern(modern);
		return value === undefined
			? {
					state: "malformed",
					attribute: modernAttribute,
					evidence: [evidence(span, modernAttribute, modern)],
				}
			: {
					state: "modern",
					value,
					attribute: modernAttribute,
					evidence: [evidence(span, modernAttribute, modern)],
				};
	}

	const legacy = span.data?.[legacyAttribute];
	if (legacy !== undefined) {
		const value = parseLegacy(legacy);
		return value === undefined
			? {
					state: "malformed",
					attribute: legacyAttribute,
					replacement: modernAttribute,
					evidence: [evidence(span, legacyAttribute, legacy)],
				}
			: {
					state: "legacy",
					value,
					attribute: legacyAttribute,
					replacement: modernAttribute,
					evidence: [evidence(span, legacyAttribute, legacy)],
				};
	}

	return { state: "missing", evidence: [] };
}

export function parseJson<T>(
	value: unknown,
	guard: (value: unknown) => value is T,
): T | undefined {
	let parsed = value;
	if (typeof value === "string") {
		try {
			parsed = JSON.parse(value);
		} catch {
			return undefined;
		}
	}
	return guard(parsed) ? parsed : undefined;
}
