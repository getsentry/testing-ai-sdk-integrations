/**
 * Framework configuration schema
 */

export interface FrameworkConfig {
  /** Framework identifier (e.g., "openai", "openai-agents") */
  name: string;
  
  /** Human-readable display name */
  displayName: string;
  
  /** Framework type: llm-only or agentic */
  type: 'llm-only' | 'agentic';
  
  /** Platform: JavaScript or Python */
  platform: 'js' | 'py';
  
  /** Package dependencies to install */
  dependencies: FrameworkDependency[];
  
  /** Common versions to test */
  versions: string[];
  
  /** Sentry SDK versions to test against */
  sentryVersions: string[];
  
  /** Python only: execution mode for the framework */
  executionMode?: 'sync' | 'async' | 'both';
  
  /** Model overrides: Some frameworks use different models than requested */
  modelOverrides?: {
    request?: string;
    response?: string;
  };
  
  /** Skip configuration: Tests or checks that should be skipped */
  skip?: {
    tests?: string[];  // Array of test names to skip entirely
    checks?: {         // Per-test check skipping
      [testName: string]: string[];  // Array of check method names to skip
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
  const fs = require('fs');
  
  if (!fs.existsSync(configPath)) {
    throw new Error(`Framework config not found: ${configPath}`);
  }
  
  try {
    const content = fs.readFileSync(configPath, 'utf-8');
    const config = JSON.parse(content) as FrameworkConfig;
    
    // Validate required fields
    const requiredFields = ['name', 'displayName', 'type', 'platform', 'dependencies', 'versions', 'sentryVersions'];
    for (const field of requiredFields) {
      if (!(field in config)) {
        throw new Error(`Missing required field: ${field}`);
      }
    }
    
    // Validate type field
    if (config.type !== 'llm-only' && config.type !== 'agentic') {
      throw new Error(`Invalid type: ${config.type}. Must be 'llm-only' or 'agentic'`);
    }
    
    // Validate platform field
    if (config.platform !== 'js' && config.platform !== 'py') {
      throw new Error(`Invalid platform: ${config.platform}. Must be 'js' or 'py'`);
    }
    
    return config;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Invalid JSON in ${configPath}: ${error.message}`);
    }
    throw error;
  }
}
