/**
 * Type definitions for the Sentry AI SDK test orchestration system
 */

export interface TestCase {
  id: string;           // e.g., "G1", "S1", "A1"
  filePath: string;     // Absolute path to the test file
  sdkPath: string;      // e.g., "js/openai"
}

export interface SDKConfig {
  sdk_name: string;
  framework_type: 'agentic' | 'low-level';
  overrides?: Record<string, Record<string, any>>;  // Per-test-case overrides
  metadata?: {
    sdk_version?: string;
    description?: string;
    notes?: string;
  };
}

export interface SDK {
  language: 'js' | 'py';
  name: string;         // e.g., "openai", "langchain"
  path: string;         // e.g., "js/openai"
  absolutePath: string; // Full file system path
  cases: TestCase[];
  hasSetup: boolean;    // Whether setup.ts/setup.py exists
  config?: SDKConfig;   // SDK configuration (if config.json exists)
}

export interface LifecycleHooks {
  beforeAll?: () => Promise<void> | void;
  beforeEach?: () => Promise<void> | void;
  afterEach?: () => Promise<void> | void;
  afterAll?: () => Promise<void> | void;
}

export interface TestCaseModule {
  default: () => Promise<void> | void;
}

export interface RunOptions {
  sdk?: string;         // Filter by SDK (e.g., "js/openai")
  case?: string;        // Filter by case (e.g., "G1")
  all?: boolean;        // Run all tests
}

export interface TestResult {
  sdkPath: string;
  caseId: string;
  status: 'passed' | 'failed' | 'skipped';
  error?: Error;
  duration: number;     // in milliseconds
}
