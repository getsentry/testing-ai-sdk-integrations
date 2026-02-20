/**
 * Attribute Auditor - Post-check phase that scans captured spans
 * for gen_ai.* attributes and classifies each as known, deprecated,
 * or unknown relative to sentry-conventions.
 */

import { CapturedSpan, AttributeAudit, AuditedAttribute } from "./types.js";
import { loadAllGenAIAttributes } from "./deprecation/loader.js";

/**
 * Scan all spans for gen_ai.* attributes and classify each as
 * known, deprecated, or unknown relative to sentry-conventions.
 *
 * This runs as a separate post-check phase — it is informational
 * and never throws errors.
 */
export function auditAttributes(spans: CapturedSpan[]): AttributeAudit {
  const allDefinitions = loadAllGenAIAttributes();

  // Collect all gen_ai.* attributes across all spans
  // Map: attributeKey -> Set<spanId>
  const attributeSpanMap = new Map<string, Set<string>>();

  for (const span of spans) {
    if (!span.data) continue;
    for (const key of Object.keys(span.data)) {
      if (!key.startsWith("gen_ai.")) continue;
      if (!attributeSpanMap.has(key)) {
        attributeSpanMap.set(key, new Set());
      }
      attributeSpanMap.get(key)!.add(span.span_id);
    }
  }

  const knownAttributes: AuditedAttribute[] = [];
  const deprecatedAttributes: AuditedAttribute[] = [];
  const unknownAttributes: AuditedAttribute[] = [];

  for (const [attrKey, spanIds] of attributeSpanMap) {
    const definition = allDefinitions.get(attrKey);
    const spanIdArray = Array.from(spanIds);

    if (!definition) {
      unknownAttributes.push({
        attribute: attrKey,
        status: "unknown",
        message: `Attribute "${attrKey}" is not defined in sentry-conventions`,
        spanIds: spanIdArray,
      });
    } else if (definition.deprecation?.replacement) {
      deprecatedAttributes.push({
        attribute: attrKey,
        status: "deprecated",
        replacement: definition.deprecation.replacement,
        message: `Attribute "${attrKey}" is deprecated. Use "${definition.deprecation.replacement}" instead.`,
        spanIds: spanIdArray,
      });
    } else {
      knownAttributes.push({
        attribute: attrKey,
        status: "known",
        message: definition.brief,
        spanIds: spanIdArray,
      });
    }
  }

  // Sort each group alphabetically by attribute name
  knownAttributes.sort((a, b) => a.attribute.localeCompare(b.attribute));
  deprecatedAttributes.sort((a, b) => a.attribute.localeCompare(b.attribute));
  unknownAttributes.sort((a, b) => a.attribute.localeCompare(b.attribute));

  return {
    totalAttributes: attributeSpanMap.size,
    knownAttributes,
    deprecatedAttributes,
    unknownAttributes,
  };
}
