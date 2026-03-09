/**
 * Framework configuration schema
 */

export interface FrameworkConfig {
  /** Framework identifier (e.g., "openai", "openai-agents") */
  name: string;

  /** Human-readable display name */
  displayName: string;

  /** Framework type: llm-only, agentic, embeddings, or mcp-server */
  type: "llm-only" | "agentic" | "embeddings" | "mcp-server";

  /** Platform: Node.js, Browser, Next.js, Python, PHP, or Cloudflare */
  platform: "node" | "python" | "browser" | "nextjs" | "php" | "cloudflare";

  /** Package dependencies to install */
  dependencies: FrameworkDependency[];

  /** Common versions to test */
  versions: string[];

  /** Sentry SDK versions to test against */
  sentryVersions: string[];

  /** Python only: execution mode for the framework */
  executionMode?: "sync" | "async" | "both";

  /** Streaming mode: whether the framework supports streaming responses */
  streamingMode?: "streaming" | "blocking" | "both";

  /** MCP only: transport mode for server communication */
  transportMode?: "stdio" | "sse" | "both";

  /**
   * Generic options that expand the test matrix.
   * Each key maps to an array of possible values.
   * Example: { "apiStyle": ["highlevel", "lowlevel"] }
   * This would double the tests, running each once per value.
   * Values are exposed to templates as variables (e.g., {{ apiStyle }}).
   */
  options?: Record<string, string[]>;

  /** Model overrides: Some frameworks use different models than requested */
  modelOverrides?: {
    request?: string;
    response?: string;
  };

  /** Tool name mapping: Map expected tool names to framework-reported names */
  toolNameMapping?: {
    [expectedName: string]: string;
  };

  /** Minimum platform version required (e.g., "3.10" for Python). Defaults to platform default if omitted. */
  minimumPlatformVersion?: string;

  /** Skip configuration: Tests or checks that should be skipped */
  skip?: {
    tests?: string[]; // Array of test names to skip entirely
    checks?: {
      // Per-test check skipping
      [testName: string]: string[]; // Array of check method names to skip
    };
  };

  /** Optional: Additional test matrix axes */
  matrix?: {
    /** Model providers to test (e.g., ["openai", "anthropic"]) */
    modelProviders?: string[];

    /** Additional custom axes */
    [key: string]: string[] | undefined;
  };
}

export interface FrameworkDependency {
  /** Package name */
  package: string;

  /** Version (or "latest", "framework" to match framework version) */
  version: string;
}

/**
 * Load framework configuration from JSON file
 */
export function loadFrameworkConfig(configPath: string): FrameworkConfig {
  const fs = require("fs");

  if (!fs.existsSync(configPath)) {
    throw new Error(`Framework config not found: ${configPath}`);
  }

  try {
    const content = fs.readFileSync(configPath, "utf-8");
    const config = JSON.parse(content) as FrameworkConfig;

    // Validate required fields
    const requiredFields = [
      "name",
      "displayName",
      "type",
      "platform",
      "dependencies",
      "versions",
      "sentryVersions",
    ];
    for (const field of requiredFields) {
      if (!(field in config)) {
        throw new Error(`Missing required field: ${field}`);
      }
    }

    // Validate type field
    if (config.type !== "llm-only" && config.type !== "agentic" && config.type !== "embeddings" && config.type !== "mcp-server") {
      throw new Error(
        `Invalid type: ${config.type}. Must be 'llm-only', 'agentic', 'embeddings', or 'mcp-server'`,
      );
    }

    // Validate platform field
    if (
      config.platform !== "node" &&
      config.platform !== "python" &&
      config.platform !== "browser" &&
      config.platform !== "nextjs" &&
      config.platform !== "php" &&
      config.platform !== "cloudflare"
    ) {
      throw new Error(
        `Invalid platform: ${config.platform}. Must be 'node', 'python', 'browser', 'nextjs', 'php', or 'cloudflare'`,
      );
    }

    return config;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Invalid JSON in ${configPath}: ${error.message}`);
    }
    throw error;
  }
}
