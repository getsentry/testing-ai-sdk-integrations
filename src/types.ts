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

export interface TestDefinition {
  name: string;
  description: string;
  /** Test type: determines which frameworks this test can run on */
  type: "llm" | "agent";
  agent?: AgentDefinition;
  inputs: TestInput[];
  /** If true, the test should intentionally cause an API error (e.g., invalid model name) */
  causeAPIError?: boolean;
  /** Array of check functions to run */
  checks: Check[];
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
  model: string;
  messages: Message[];
  [key: string]: any;
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

export interface FrameworkConfig {
  name: string;
  platform: "js" | "py";
  type: "llm-only" | "agentic";
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
  // Model overrides: Some frameworks use different models than requested
  modelOverrides?: {
    request?: string;
    response?: string;
  };
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
  error?: string;
  skipReason?: string;
  /** Locations within span data that caused the failure */
  errorLocations?: ErrorLocation[];
}

export interface TestRun {
  id: string;
  /** Original index in the test matrix, used for consistent ordering in reports */
  index?: number;
  framework: FrameworkConfig;
  testDefinition: TestDefinition;
  status: "pending" | "running" | "passed" | "failed" | "error" | "skipped";
  startTime?: number;
  endTime?: number;
  error?: string;
  spans?: CapturedSpan[];
  checkResults?: CheckResult[];
  skipReason?: string;
}

export interface TestReport {
  totalTests: number;
  passed: number;
  failed: number;
  errors: number;
  skipped: number;
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
  // Controls whether to print verbose console output (default: true)
  verbose?: boolean;
}
