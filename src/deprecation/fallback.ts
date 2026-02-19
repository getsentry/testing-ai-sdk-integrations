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

/**
 * Accumulator for deprecation warnings during a check.
 *
 * Usage pattern:
 * 1. Create collector at start of check
 * 2. Add warnings as you encounter them
 * 3. Log all warnings before throwing errors (if any)
 *
 * @example
 * const deprecationCollector = new DeprecationWarningCollector();
 *
 * for (const span of spans) {
 *   const result = getAttributeWithFallback(span, newAttr, oldAttr);
 *   deprecationCollector.add(result.deprecationWarning);
 * }
 *
 * // Log warnings (non-blocking)
 * deprecationCollector.logWarnings("checkMyFeature");
 *
 * // Throw errors for validation failures
 * if (errors.length > 0) {
 *   throw new CheckError(errors.join("\n"), locations);
 * }
 */
export class DeprecationWarningCollector {
  private warnings: ErrorLocation[] = [];

  /**
   * Add a deprecation warning to the collection
   * @param warning - The warning to add (undefined is safely ignored)
   */
  add(warning: ErrorLocation | undefined): void {
    if (warning) {
      this.warnings.push(warning);
    }
  }

  /**
   * Get all collected warnings
   * @returns Array of ErrorLocation objects
   */
  getWarnings(): ErrorLocation[] {
    return this.warnings;
  }

  /**
   * Check if any warnings were collected
   * @returns true if warnings exist
   */
  hasWarnings(): boolean {
    return this.warnings.length > 0;
  }

  /**
   * Log all collected warnings to console in a grouped format.
   * This does NOT throw errors - it only logs warnings.
   *
   * Output format:
   * ⚠ DEPRECATION WARNING in checkName: N usage(s) of deprecated attributes
   *   - gen_ai.request.messages (2 spans): Attribute "gen_ai.request.messages" is deprecated...
   *
   * @param checkName - The name of the check for logging context
   */
  logWarnings(checkName: string): void {
    if (!this.hasWarnings()) return;

    console.warn(
      `\n⚠  DEPRECATION WARNING in ${checkName}: ` +
        `${this.warnings.length} usage(s) of deprecated attributes`
    );

    // Group by attribute name for cleaner output
    const groupedByAttr = new Map<string, ErrorLocation[]>();
    for (const warning of this.warnings) {
      if (!warning.attribute) continue;
      const existing = groupedByAttr.get(warning.attribute) || [];
      existing.push(warning);
      groupedByAttr.set(warning.attribute, existing);
    }

    for (const [attr, locations] of groupedByAttr) {
      const message = locations[0].message;
      const spanCount = locations.length;
      console.warn(
        `   - ${attr} (${spanCount} span${spanCount > 1 ? "s" : ""}): ${message}`
      );
    }
  }
}
