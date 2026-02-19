import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { AttributeDefinition, DeprecationMapping } from "./types.js";

/**
 * Cache for loaded deprecation mappings
 */
let cachedMappings: Map<string, DeprecationMapping> | null = null;

/**
 * Load deprecation mappings from sentry-conventions submodule.
 * Caches results for performance.
 *
 * This function:
 * 1. Scans the sentry-conventions/model/attributes/gen_ai/ directory
 * 2. Parses each JSON file to extract attribute definitions
 * 3. Builds a map of deprecated attributes to their replacements
 * 4. Caches the result for subsequent calls
 *
 * If the submodule is not available or cannot be read, this function
 * gracefully degrades and returns an empty map with a warning.
 *
 * @returns Map from deprecated attribute name to DeprecationMapping
 */
export function loadDeprecationMappings(): Map<string, DeprecationMapping> {
  if (cachedMappings) {
    return cachedMappings;
  }

  const mappings = new Map<string, DeprecationMapping>();

  // Path to gen_ai attributes in submodule
  const genAiDir = join(
    process.cwd(),
    "sentry-conventions",
    "model",
    "attributes",
    "gen_ai"
  );

  try {
    const files = readdirSync(genAiDir).filter((f) => f.endsWith(".json"));

    for (const file of files) {
      try {
        const filePath = join(genAiDir, file);
        const content = readFileSync(filePath, "utf-8");
        const attr: AttributeDefinition = JSON.parse(content);

        // Only process attributes with deprecation info
        if (attr.deprecation?.replacement) {
          mappings.set(attr.key, {
            deprecated: attr.key,
            replacement: attr.deprecation.replacement,
            brief: attr.brief,
          });
        }
      } catch (fileError) {
        // Skip individual file parse errors
        console.warn(`Warning: Could not parse ${file}:`, fileError);
      }
    }

    if (mappings.size > 0) {
      console.log(
        `✓ Loaded ${mappings.size} deprecation mapping(s) from sentry-conventions`
      );
    }
  } catch (error) {
    console.warn(
      "⚠ Warning: Could not load sentry-conventions. Deprecation detection disabled."
    );
    // Don't throw - gracefully degrade if submodule not available
  }

  cachedMappings = mappings;
  return mappings;
}

/**
 * Check if an attribute is deprecated
 *
 * @param attrName - The attribute name to check
 * @returns true if the attribute has a registered deprecation mapping
 */
export function isDeprecated(attrName: string): boolean {
  const mappings = loadDeprecationMappings();
  return mappings.has(attrName);
}

/**
 * Get replacement attribute for a deprecated attribute
 *
 * @param deprecated - The deprecated attribute name
 * @returns The replacement attribute name, or undefined if not deprecated
 */
export function getReplacementAttribute(
  deprecated: string
): string | undefined {
  const mappings = loadDeprecationMappings();
  return mappings.get(deprecated)?.replacement;
}

/**
 * Get deprecation message for an attribute
 *
 * @param deprecated - The deprecated attribute name
 * @returns A human-readable deprecation message, or undefined if not deprecated
 */
export function getDeprecationMessage(
  deprecated: string
): string | undefined {
  const mappings = loadDeprecationMappings();
  const mapping = mappings.get(deprecated);

  if (!mapping) return undefined;

  return `Attribute "${deprecated}" is deprecated. Use "${mapping.replacement}" instead (OTEL standard).`;
}
