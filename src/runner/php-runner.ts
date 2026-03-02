/**
 * PHP/Laravel-specific test runner
 *
 * Handles Laravel project setup, Composer dependency installation,
 * multi-file template rendering (agents, tools, artisan commands),
 * and test execution via `php artisan`.
 *
 * Unlike other runners that produce a single test file, the PHP runner
 * generates multiple files into the Laravel directory structure:
 *   - app/Ai/Agents/*.php   (agent classes)
 *   - app/Ai/Tools/*.php    (tool classes)
 *   - app/Console/Commands/*.php (artisan commands that wire up Sentry + run agent)
 *
 * The runner executes each test via `php artisan test:run-agent <args>`.
 */

import * as path from "path";
import * as fs from "fs/promises";
import { exec } from "child_process";
import { promisify } from "util";
import { RunnerContext } from "../types.js";
import { buildModeSuffix } from "../platform-utils.js";

const execAsync = promisify(exec);

export class PhpRunner {
  /**
   * Check if PHP/Laravel environment needs setup
   * We check for the vendor/ directory as the marker.
   */
  async needsSetup(workDir: string): Promise<boolean> {
    const vendorPath = path.join(workDir, "vendor");
    try {
      await fs.access(vendorPath);
      return false;
    } catch {
      return true;
    }
  }

  /**
   * Setup Laravel project and install dependencies
   *
   * Steps:
   * 1. Create Laravel project via composer create-project
   * 2. Configure and install sentry/sentry-laravel
   * 3. Install laravel/ai
   * 4. Publish AI service provider and run migrations
   * 5. Create required directories for agents/tools/commands
   */
  async setupEnvironment(context: RunnerContext): Promise<void> {
    const { workDir, framework } = context;
    const verbose = context.verbose === true;

    if (verbose) {
      console.log(`  Setting up Laravel environment in ${workDir}...`);
    }

    // Check if composer.json exists; if not, create the Laravel project
    const composerJsonPath = path.join(workDir, "composer.json");
    let hasComposerJson = false;
    try {
      await fs.access(composerJsonPath);
      hasComposerJson = true;
    } catch {
      // not yet created
    }

    if (!hasComposerJson) {
      if (verbose) {
        console.log("  Creating Laravel project...");
      }
      await execAsync(
        "composer create-project laravel/laravel . --prefer-dist --no-interaction",
        {
          cwd: workDir,
          timeout: 120000,
        },
      );
      if (verbose) {
        console.log("  ✓ Laravel project created");
      }
    }

    // Configure local Sentry Laravel path if provided
    const localSentryPath = process.env.SENTRY_LARAVEL_PATH;
    if (localSentryPath && framework.sentryVersion === "local") {
      if (verbose) {
        console.log(
          `  Configuring local Sentry Laravel from: ${localSentryPath}`,
        );
      }
      await execAsync(
        `composer config repositories.sentry-laravel '{"type":"path","url":"${localSentryPath}","options":{"symlink":true}}'`,
        { cwd: workDir },
      );
      await execAsync(
        'composer require sentry/sentry-laravel:"*@dev" --no-interaction',
        {
          cwd: workDir,
          timeout: 120000,
        },
      );
    } else if (framework.sentryVersion === "latest") {
      await execAsync(
        "composer require sentry/sentry-laravel --no-interaction",
        {
          cwd: workDir,
          timeout: 120000,
        },
      );
    } else {
      await execAsync(
        `composer require sentry/sentry-laravel:${framework.sentryVersion} --no-interaction`,
        {
          cwd: workDir,
          timeout: 120000,
        },
      );
    }

    if (verbose) {
      console.log("  ✓ Sentry Laravel installed");
    }

    // Install framework dependencies from config
    if (framework.dependencies) {
      for (const dep of framework.dependencies) {
        // Skip sentry packages (already handled above)
        if (dep.package.startsWith("sentry/")) continue;

        let version = dep.version;
        if (version === "framework") {
          version = framework.version;
        }

        const versionSpec = version === "latest" ? "" : `:${version}`;
        if (verbose) {
          console.log(`  Installing ${dep.package}${versionSpec}...`);
        }
        await execAsync(
          `composer require ${dep.package}${versionSpec} --no-interaction`,
          {
            cwd: workDir,
            timeout: 120000,
          },
        );
      }
    }

    // Write Sentry config with AI tracing enabled
    const sentryConfig = this.generateSentryConfig();
    await fs.writeFile(
      path.join(workDir, "config", "sentry.php"),
      sentryConfig,
    );

    // Publish AI service provider config and run migrations
    try {
      await execAsync(
        'php artisan vendor:publish --provider="Laravel\\Ai\\AiServiceProvider" --no-interaction 2>/dev/null || true',
        { cwd: workDir },
      );
      await execAsync(
        "php artisan migrate --no-interaction 2>/dev/null || true",
        {
          cwd: workDir,
        },
      );
    } catch {
      // Non-critical: vendor publish or migrate may not apply for all setups
    }

    // Create directories for generated PHP files
    await fs.mkdir(path.join(workDir, "app", "Ai", "Agents"), {
      recursive: true,
    });
    await fs.mkdir(path.join(workDir, "app", "Ai", "Tools"), {
      recursive: true,
    });
    await fs.mkdir(path.join(workDir, "app", "Console", "Commands"), {
      recursive: true,
    });

    if (verbose) {
      console.log("  ✓ Laravel environment setup complete");
    }
  }

  /**
   * Generate the Sentry config file content with AI tracing enabled.
   * We write this ourselves rather than relying on vendor:publish to ensure
   * the AI-related config keys are always present regardless of sentry-laravel version.
   */
  private generateSentryConfig(): string {
    return `<?php

return [
    'dsn' => env('SENTRY_LARAVEL_DSN', env('SENTRY_DSN')),
    'release' => env('SENTRY_RELEASE'),
    'environment' => env('SENTRY_ENVIRONMENT'),
    'sample_rate' => env('SENTRY_SAMPLE_RATE') === null ? 1.0 : (float) env('SENTRY_SAMPLE_RATE'),
    'traces_sample_rate' => env('SENTRY_TRACES_SAMPLE_RATE') === null ? null : (float) env('SENTRY_TRACES_SAMPLE_RATE'),
    'profiles_sample_rate' => env('SENTRY_PROFILES_SAMPLE_RATE') === null ? null : (float) env('SENTRY_PROFILES_SAMPLE_RATE'),
    'send_default_pii' => env('SENTRY_SEND_DEFAULT_PII', true),

    'tracing' => [
        'queue_job_transactions' => true,
        'queue_jobs' => true,
        'sql_queries' => true,
        'sql_bindings' => false,
        'sql_origin' => true,
        'sql_origin_threshold_ms' => 100,
        'views' => true,
        'livewire' => true,
        'http_client_requests' => true,
        'cache' => true,
        'redis_commands' => false,
        'redis_origin' => true,
        'notifications' => true,
        'missing_routes' => false,
        'continue_after_response' => true,
        'ai' => true,
        'default_integrations' => true,
    ],
];
`;
  }

  /**
   * Generate test case ID from test name
   */
  private generateTestCaseId(testName: string): string {
    return testName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  /**
   * Convert a kebab-case or space-separated name to PascalCase
   */
  private toPascalCase(name: string): string {
    return name
      .replace(/[^a-zA-Z0-9]+/g, " ")
      .split(" ")
      .filter(Boolean)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join("");
  }

  /**
   * Execute PHP/Laravel test via artisan command
   */
  async executeTest(context: RunnerContext): Promise<void> {
    const {
      workDir,
      sentryDsn,
      runId,
      testDefinition,
      framework,
      isAsync,
      isStreaming,
    } = context;
    const verbose = context.verbose === true;

    if (verbose) {
      console.log("  Executing PHP/Laravel test...");
    }

    const testCaseId = this.generateTestCaseId(testDefinition.name);

    // Build mode suffix to match the generated command signature
    const modeSuffix = buildModeSuffix(framework, isAsync, isStreaming);

    // Build the artisan command name from the test case ID + mode suffix
    const commandName = `test:${testCaseId}${modeSuffix}`;
    const logFile = path.join(workDir, `test-${testCaseId}${modeSuffix}.log`);

    const env = {
      ...process.env,
      SENTRY_LARAVEL_DSN: sentryDsn,
      SENTRY_DSN: sentryDsn,
      SENTRY_TRACES_SAMPLE_RATE: "1.0",
      RUN_ID: runId,
      OPENAI_API_KEY: process.env.OPENAI_API_KEY || "",
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || "",
      GOOGLE_GENAI_API_KEY: process.env.GOOGLE_GENAI_API_KEY || "",
    };

    try {
      const { stdout, stderr } = await execAsync(`php artisan ${commandName}`, {
        cwd: workDir,
        env,
        timeout: context.timeoutMs,
      });

      const logContent = [
        "=== Test Execution Log ===",
        `Timestamp: ${new Date().toISOString()}`,
        `Test: ${testDefinition.name}`,
        `Framework: ${framework.name}`,
        `Command: php artisan ${commandName}`,
        "",
        "=== STDOUT ===",
        stdout,
        "",
        "=== STDERR ===",
        stderr,
      ].join("\n");

      await fs.writeFile(logFile, logContent);

      if (verbose) {
        console.log(`  Log written to: ${path.basename(logFile)}`);

        if (stdout.trim()) {
          console.log("  Test output:");
          for (const line of stdout.split("\n")) {
            if (line.trim()) console.log(`    ${line}`);
          }
        }

        if (stderr) {
          console.error("  Test errors:");
          stderr.split("\n").forEach((line: string) => {
            if (line.trim()) console.error(`    ${line}`);
          });
        }
      }
    } catch (error: any) {
      const errorContent = [
        "=== Test Execution Failed ===",
        `Timestamp: ${new Date().toISOString()}`,
        `Test: ${testDefinition.name}`,
        `Framework: ${framework.name}`,
        `Command: php artisan ${commandName}`,
        "",
        "=== STDOUT ===",
        error.stdout || "",
        "",
        "=== STDERR ===",
        error.stderr || "",
        "",
        "=== ERROR ===",
        error.message,
      ].join("\n");

      try {
        await fs.writeFile(logFile, errorContent);
        if (verbose) {
          console.log(`  Log written to: ${path.basename(logFile)}`);
        }
      } catch (writeError) {
        if (verbose) {
          console.error("  Failed to write log file:", writeError);
        }
      }

      if (error.killed || error.code === "ETIMEDOUT") {
        throw new Error(`Test execution timed out (${Math.round(context.timeoutMs / 1000)}s)`);
      }
      throw new Error(
        `Test execution failed: ${error.message}\n${error.stderr || ""}`,
      );
    }
  }
}
