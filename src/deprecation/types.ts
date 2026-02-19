/**
 * Structure of a sentry-conventions attribute definition
 *
 * These definitions are loaded from the sentry-conventions submodule
 * at runtime to determine which attributes are deprecated.
 */
export interface AttributeDefinition {
  /** Attribute key (e.g., "gen_ai.request.messages") */
  key: string;

  /** Brief description of the attribute */
  brief: string;

  /** Data type */
  type: string;

  /** PII classification */
  pii?: { key: string };

  /** Whether this attribute is part of the OpenTelemetry standard */
  is_in_otel: boolean;

  /** Example value */
  example?: string;

  /** Alias names */
  alias?: string[];

  /** Deprecation information (if deprecated) */
  deprecation?: {
    _status: string | null;
    replacement: string;
  };
}

/**
 * A mapping from deprecated attribute to its replacement
 */
export interface DeprecationMapping {
  /** The deprecated attribute name */
  deprecated: string;

  /** The replacement attribute name (OTEL standard) */
  replacement: string;

  /** Brief description of the attribute */
  brief: string;
}
