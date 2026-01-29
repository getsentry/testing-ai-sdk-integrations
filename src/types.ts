/**
 * Core type definitions for the test orchestrator
 */

export interface TestDefinition {
  name: string;
  description: string;
  /** Test type: determines which frameworks this test can run on */
  type: 'llm' | 'agent';
  agent?: AgentDefinition;
  inputs: TestInput[];
  /** If true, the test should intentionally cause an API error (e.g., invalid model name) */
  causeAPIError?: boolean;
  // Legacy: single checks function (still supported)
  checks?: (spans: CapturedSpan[]) => void | Promise<void>;
  // New: any method starting with "check" will be run as a check
  [key: string]: any;
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

export interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
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
  platform: 'js' | 'py';
  type: 'llm-only' | 'agentic';
  version: string;
  sentryVersion: string;
  // Optional: Path to template file (set when using discovered frameworks)
  templatePath?: string;
  category?: string;
  dependencies?: Array<{ package: string; version: string }>;
  // Python only: execution mode for the framework
  executionMode?: 'sync' | 'async' | 'both';
  // Model overrides: Some frameworks use different models than requested
  modelOverrides?: {
    request?: string;
    response?: string;
  };
  // Skip configuration: Tests or checks that should be skipped
  skip?: {
    tests?: string[];  // Array of test names to skip entirely
    checks?: {         // Per-test check skipping
      [testName: string]: string[];  // Array of check method names to skip
    };
  };
}

export interface CheckResult {
  name: string;
  status: 'passed' | 'failed' | 'skipped';
  error?: string;
  skipReason?: string;
}

export interface TestRun {
  id: string;
  framework: FrameworkConfig;
  testDefinition: TestDefinition;
  status: 'pending' | 'running' | 'passed' | 'failed' | 'error' | 'skipped';
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
  // Controls whether to print verbose console output (default: true)
  verbose?: boolean;
}
