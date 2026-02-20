import { CapturedSpan, ErrorLocation } from "../types.js";
import { getDeprecationMessage } from "./loader.js";

/**
 * Result of attempting to get an attribute with fallback
 */
export interface FallbackResult {
  /** The attribute value (from new or deprecated attribute) */
  value: unknown;

  /** The attribute name that was actually used */
  usedAttribute: string | undefined;

  /** Deprecation warning if a deprecated attribute was used */
  deprecationWarning?: ErrorLocation;
}

/**
 * Get an attribute value, trying new format first, falling back to deprecated.
 * Returns both the value and a deprecation warning if fallback was used.
 *
 * This is the primary helper function for implementing OTEL migration with
 * backward compatibility. It:
 * 1. Checks for the new (OTEL) attribute first
 * 2. Falls back to the deprecated attribute if new one doesn't exist
 * 3. Returns a deprecation warning if the fallback was used
 *
 * @param span - The captured span to read attributes from
 * @param newAttr - The new (OTEL) attribute name to try first
 * @param deprecatedAttr - The deprecated attribute name to fall back to
 * @returns FallbackResult with value, used attribute name, and optional warning
 *
 * @example
 * const result = getAttributeWithFallback(
 *   span,
 *   "gen_ai.input.messages",
 *   "gen_ai.request.messages"
 * );
 * if (result.value !== undefined) {
 *   // Use result.value for validation
 *   // result.usedAttribute tells you which attribute was found
 * }
 * // Collect the deprecation warning
 * deprecationCollector.add(result.deprecationWarning);
 */
export function getAttributeWithFallback(
  span: CapturedSpan,
  newAttr: string,
  deprecatedAttr: string
): FallbackResult {
  const newValue = span.data?.[newAttr];
  const deprecatedValue = span.data?.[deprecatedAttr];

  // New attribute exists - preferred path (no warning)
  if (newValue !== undefined) {
    return {
      value: newValue,
      usedAttribute: newAttr,
    };
  }

  // Fall back to deprecated attribute
  if (deprecatedValue !== undefined) {
    const message =
      getDeprecationMessage(deprecatedAttr) ||
      `Attribute "${deprecatedAttr}" is deprecated, use "${newAttr}" instead`;

    return {
      value: deprecatedValue,
      usedAttribute: deprecatedAttr,
      deprecationWarning: {
        spanId: span.span_id,
        attribute: deprecatedAttr,
        message,
      },
    };
  }

  // Neither exists
  return { value: undefined, usedAttribute: undefined };
}

