import type { CapturedSpan } from "./assessment/types.js";
import { loadAllGenAIAttributes } from "./deprecation/loader.js";

interface AuditedAttribute {
	attribute: string;
	status: "known" | "deprecated" | "unknown";
	replacement?: string;
	spanIds: string[];
}

export interface AttributeAudit {
	knownAttributes: AuditedAttribute[];
	deprecatedAttributes: AuditedAttribute[];
	unknownAttributes: AuditedAttribute[];
}

export function auditAttributes(
	spans: readonly CapturedSpan[],
): AttributeAudit {
	const definitions = loadAllGenAIAttributes();
	const spanIdsByAttribute = new Map<string, Set<string>>();
	for (const span of spans) {
		for (const attribute of Object.keys(span.data ?? {})) {
			if (!attribute.startsWith("gen_ai.")) continue;
			const spanIds = spanIdsByAttribute.get(attribute) ?? new Set<string>();
			spanIds.add(span.span_id);
			spanIdsByAttribute.set(attribute, spanIds);
		}
	}

	const audit: AttributeAudit = {
		knownAttributes: [],
		deprecatedAttributes: [],
		unknownAttributes: [],
	};
	for (const [attribute, spanIds] of spanIdsByAttribute) {
		const definition = definitions.get(attribute);
		let status: AuditedAttribute["status"] = "known";
		if (!definition) status = "unknown";
		else if (definition.deprecation?.replacement) status = "deprecated";
		const entry: AuditedAttribute = {
			attribute,
			status,
			replacement: definition?.deprecation?.replacement,
			spanIds: [...spanIds],
		};
		if (entry.status === "known") audit.knownAttributes.push(entry);
		else if (entry.status === "deprecated")
			audit.deprecatedAttributes.push(entry);
		else audit.unknownAttributes.push(entry);
	}
	for (const entries of [
		audit.knownAttributes,
		audit.deprecatedAttributes,
		audit.unknownAttributes,
	]) {
		entries.sort((left, right) =>
			left.attribute.localeCompare(right.attribute),
		);
	}
	return audit;
}
