/**
 * Core type definitions for the test orchestrator
 */

/**
 * Check function signature
 * @param spans - Captured spans from the test run
 * @param config - Framework configuration
 * @param testDef - The test definition being run
 */
export type CheckFunction = (
  spans: CapturedSpan[],
  config: FrameworkConfig,
  testDef: TestDefinition,
) => void | Promise<void>;

/**
 * Check definition with name and function
 */
export interface Check {
  name: string;
  fn: CheckFunction;
}

/**
 * Check severity levels, ordered from most to least severe.
 * - critical: Core instrumentation (spans exist, correct attributes, hierarchy)
 * - normal: Data correctness (token usage, messages schema, tool calls)
 * - warning: Forward-looking / best-effort (OTel migration, optional token fields)
 */
export type CheckSeverity = "critical" | "normal" | "warning";

export interface TestDefinition {
  name: string;
  description: string;
  /** Test type: determines which frameworks this test can run on */
  type: "llm" | "agent" | "embeddings" | "mcp";
  agent?: AgentDefinition;
  mcpServer?: MCPServerDefinition;
  inputs: TestInput[];
  /** If true, the test should intentionally cause an API error (e.g., invalid model name) */
  causeAPIError?: boolean;
  /** Execution timeout in milliseconds (default: 60000) */
  timeoutMs?: number;
  /** Critical checks - core instrumentation must work (spans exist, attributes, hierarchy) */
  criticalChecks?: Check[];
  /** Normal checks - data correctness (token usage, messages, tool calls) */
  checks: Check[];
  /** Warning checks - best-effort / forward-looking (OTel migration, optional fields) */
  warningChecks?: Check[];
}

export interface AgentDefinition {
  name: string;
  description: string;
  tools: ToolDefinition[];
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, any>;
  /** The arguments that will be passed to the tool (simulated LLM output) */
  arguments?: Record<string, any>;
  result?: any;
  error?: string;
}

/** Text content part for multimodal messages */
export interface TextContentPart {
  type: "text";
  text: string;
}

/** Image content part for multimodal messages */
export interface ImageContentPart {
  type: "image";
  /** Base64 encoded image data (without data URI prefix) */
  base64: string;
  /** MIME type of the image (e.g., "image/png", "image/jpeg") */
  mediaType: string;
}

/** Content can be a simple string or an array of content parts for multimodal */
export type MessageContent = string | (TextContentPart | ImageContentPart)[];

export interface Message {
  role: "system" | "user" | "assistant" | "tool";
  content: MessageContent;
  name?: string;
  tool_call_id?: string;
}

export interface TestInput {
  model?: string;
  messages?: Message[];
  /** Embedding input text (for embeddings tests) */
  input?: string;
  [key: string]: any;
}

// =============================================================================
// MCP Server Definitions
// =============================================================================

export interface MCPServerDefinition {
  name: string;
  tools?: MCPToolDefinition[];
  resources?: MCPResourceDefinition[];
  prompts?: MCPPromptDefinition[];
}

export interface MCPToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, { type: string; description?: string }>;
  result?: any;
  /** If set, the tool raises this error instead of returning a result */
  error?: string;
}

export interface MCPResourceDefinition {
  uri: string;
  name: string;
  description?: string;
  content: string;
}

export interface MCPPromptDefinition {
  name: string;
  description: string;
  parameters?: Record<string, { type: string; description?: string }>;
  template: string;
}

export interface CapturedSpan {
  span_id: string;
  trace_id: string;
  op: string;
  description?: string;
  start_timestamp: number;
  timestamp: number;
  data?: Record<string, any>;
  tags?: Record<string, any>;
  [key: string]: any;
}

export type OptionValue =
  | string
  | {
      value: string;
      overrides: Partial<
        Pick<FrameworkConfig, "modelOverrides" | "skip" | "toolNameMapping">
      >;
    };

export interface FrameworkConfig {
  name: string;
  platform: "node" | "python" | "browser" | "nextjs" | "php" | "cloudflare";
  type: "llm-only" | "agentic" | "embeddings" | "mcp-server";
  version: string;
  sentryVersion: string;
  // Optional: Path to template file (set when using discovered frameworks)
  templatePath?: string;
  category?: string;
  dependencies?: Array<{ package: string; version: string }>;
  // Python only: execution mode for the framework
  executionMode?: "sync" | "async" | "both";
  // Streaming mode: whether the framework supports streaming responses
  streamingMode?: "streaming" | "blocking" | "both";
  // MCP only: transport mode for server communication
  transportMode?: "stdio" | "sse" | "both";
  // Generic options that expand the test matrix (config-level: arrays of values)
  // Values can be plain strings or objects: { value: string, overrides: {...} }
  options?: Record<string, OptionValue[]>;
  // Resolved option values after matrix expansion (runtime: single values per key)
  resolvedOptions?: Record<string, string>;
  // Model overrides: Some frameworks use different models than requested
  modelOverrides?: {
    request?: string;
    response?: string;
  };
  // Tool name mapping: Map expected tool names to framework-reported names
  // Example: { "add": "Add", "multiply": "Multiply" } for PascalCase frameworks
  toolNameMapping?: {
    [expectedName: string]: string;
  };
  // Minimum platform version required (e.g., "3.10" for Python)
  minimumPlatformVersion?: string;
  // Skip configuration: Tests or checks that should be skipped
  skip?: {
    tests?: string[]; // Array of test names to skip entirely
    checks?: {
      // Per-test check skipping
      [testName: string]: string[]; // Array of check method names to skip
    };
  };
}

/**
 * Describes the location of a check failure within captured span data.
 * Used to highlight the exact span and attribute that caused the failure
 * in HTML reports and terminal output.
 */
export interface ErrorLocation {
  /** The span_id of the offending span */
  spanId: string;
  /** The attribute key that failed validation (e.g., "gen_ai.request.model") */
  attribute?: string;
  /** Human-readable description of what went wrong */
  message: string;
}

export interface CheckResult {
  name: string;
  status: "passed" | "failed" | "skipped";
  /** Severity level of this check */
  severity: CheckSeverity;
  error?: string;
  skipReason?: string;
  /** Locations within span data that caused the failure */
  errorLocations?: ErrorLocation[];
}

// =============================================================================
// Attribute Audit Types (post-check phase)
// =============================================================================

/**
 * Classification of a gen_ai.* attribute found in captured spans
 */
export type AuditAttributeStatus = "known" | "deprecated" | "unknown";

/**
 * A single audited attribute entry
 */
export interface AuditedAttribute {
  /** The attribute key (e.g., "gen_ai.request.messages") */
  attribute: string;
  /** Whether the attribute is known, deprecated, or unknown */
  status: AuditAttributeStatus;
  /** For deprecated attributes: the replacement attribute key */
  replacement?: string;
  /** Human-readable message */
  message: string;
  /** Span IDs where this attribute was found */
  spanIds: string[];
}

/**
 * Result of the post-check attribute audit for a test run.
 * Scans all gen_ai.* attributes on captured spans and classifies each
 * as known, deprecated, or unknown relative to sentry-conventions.
 */
export interface AttributeAudit {
  /** Total number of unique gen_ai.* attributes found across all spans */
  totalAttributes: number;
  /** Attributes that are defined in sentry-conventions and not deprecated */
  knownAttributes: AuditedAttribute[];
  /** Attributes that are deprecated in sentry-conventions */
  deprecatedAttributes: AuditedAttribute[];
  /** Attributes with gen_ai.* prefix not found in sentry-conventions */
  unknownAttributes: AuditedAttribute[];
}

export interface TestRun {
  id: string;
  /** Original index in the test matrix, used for consistent ordering in reports */
  index?: number;
  framework: FrameworkConfig;
  testDefinition: TestDefinition;
  status: "pending" | "running" | "passed" | "failed" | "error" | "skipped" | "timeout";
  startTime?: number;
  endTime?: number;
  error?: string;
  spans?: CapturedSpan[];
  checkResults?: CheckResult[];
  /** Post-check attribute audit results */
  attributeAudit?: AttributeAudit;
  /** Path to the generated test script file (relative to project root) */
  scriptPath?: string;
  skipReason?: string;
}

export interface TestReport {
  totalTests: number;
  passed: number;
  failed: number;
  errors: number;
  skipped: number;
  timeouts: number;
  duration: number;
  runs: TestRun[];
}

export interface RunnerContext {
  runId: string;
  framework: FrameworkConfig;
  testDefinition: TestDefinition;
  sentryDsn: string;
  workDir: string;
  // Python only: if true, render async version; if false, render sync version
  isAsync?: boolean;
  // If true, render streaming version; if false, render non-streaming version
  isStreaming?: boolean;
  // MCP only: transport mode for the test
  transportMode?: "stdio" | "sse";
  // Resolved generic options for the test (single values per key)
  resolvedOptions?: Record<string, string>;
  // Execution timeout in milliseconds
  timeoutMs: number;
  // Controls whether to print verbose console output (default: true)
  verbose?: boolean;
  // Value to pass for `streamGenAiSpans` (JS) / `stream_gen_ai_spans` (Python) in Sentry.init() (default: true)
  streamGenAiSpans?: boolean;
}
