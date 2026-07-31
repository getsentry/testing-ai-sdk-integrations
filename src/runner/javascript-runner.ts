/**
 * JavaScript-specific test runner
 * Handles Node.js environment setup, dependency installation, and test execution
 */

import * as path from "path";
import * as fs from "fs/promises";
import { exec } from "child_process";
import { promisify } from "util";
import { RunnerContext } from "../types.js";

const execAsync = promisify(exec);

export class JavaScriptRunner {
  /**
   * Check if JavaScript environment needs setup
   */
  async needsSetup(workDir: string, context?: RunnerContext): Promise<boolean> {
    const nodeModulesPath = path.join(workDir, "node_modules");
    try {
      await fs.access(nodeModulesPath);
    } catch {
      return true;
    }

    // Verify all required packages are actually installed
    if (context?.framework?.dependencies) {
      for (const dep of context.framework.dependencies) {
        try {
          await fs.access(path.join(nodeModulesPath, dep.package));
        } catch {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Setup Node.js environment and install dependencies
   */
  async setupEnvironment(context: RunnerContext): Promise<void> {
    const { workDir, framework } = context;
    const verbose = context.verbose === true;

    if (verbose) {
      console.log(`  Setting up Node.js environment in ${workDir}...`);
    }

    // Create package.json
    const packageJson = this.generatePackageJson(context);
    await fs.writeFile(
      path.join(workDir, "package.json"),
      JSON.stringify(packageJson, null, 2),
    );
    if (verbose) {
      console.log("  ✓ package.json generated");
    }

    // Install dependencies
    if (verbose) {
      console.log("  Installing dependencies...");
    }

    // Check for local Sentry SDK path
    const localSentryPath = process.env.SENTRY_JAVASCRIPT_PATH;
    if (localSentryPath && framework.sentryVersion === "local") {
      if (verbose) {
        console.log(`  Linking local Sentry SDK from: ${localSentryPath}`);
      }
      // Install other dependencies first
      await execAsync("npm install --no-save", {
        cwd: workDir,
        env: { ...process.env, npm_config_loglevel: "error" },
      });
      // Link local Sentry SDK (use platform-specific package)
      const sentryPackageDir = framework.platform === "nextjs" ? "nextjs" : "node";
      await execAsync(`npm link "${localSentryPath}/packages/${sentryPackageDir}"`, {
        cwd: workDir,
        env: { ...process.env, npm_config_loglevel: "error" },
      });
    } else {
      await execAsync("npm install --no-save", {
        cwd: workDir,
        env: { ...process.env, npm_config_loglevel: "error" },
      });
    }

    if (verbose) {
      console.log("  ✓ Dependencies installed");
    }
  }

  /**
   * Generate package.json content
   */
  private generatePackageJson(context: RunnerContext): object {
    const { framework } = context;
    const dependencies: Record<string, string> = {};

    // Add Sentry SDK (skip if using local version, will be linked separately)
    // Use platform-specific Sentry package
    if (framework.sentryVersion !== "local") {
      const sentryPackage = framework.platform === "nextjs" ? "@sentry/nextjs" : "@sentry/node";
      dependencies[sentryPackage] = framework.sentryVersion;
    }

    // Add framework dependencies from config
    if (framework.dependencies) {
      for (const dep of framework.dependencies) {
        let version = dep.version;

        // Replace "framework" with actual framework version
        if (version === "framework") {
          version = framework.version;
        }

        // Replace "sentry" with actual sentry version
        if (version === "sentry") {
          version = framework.sentryVersion;
        }

        // Skip Sentry packages if already added (avoid duplication)
        if (dep.package === "@sentry/node" || dep.package === "@sentry/nextjs") {
          continue;
        }

        dependencies[dep.package] = version;
      }
    } else {
      // Fallback: Add framework package with framework version
      dependencies[framework.name] = framework.version;
    }

    return {
      name: `test-${framework.name}`,
      version: "1.0.0",
      type: "module",
      dependencies,
    };
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
   * Execute JavaScript test
   */
  async executeTest(context: RunnerContext): Promise<void> {
    const {
      workDir,
      sentryDsn,
      runId,
      testDefinition,
      framework,
      isStreaming,
      resolvedOptions,
    } = context;
    const verbose = context.verbose === true;

    if (verbose) {
      console.log("  Executing JavaScript test...");
    }

    // Generate test case ID and determine filename (must match runner.ts logic)
    const testCaseId = this.generateTestCaseId(testDefinition.name);
    const modeParts: string[] = [];
    if (framework.streamingMode) {
      modeParts.push(isStreaming ? "streaming" : "blocking");
    }
    if (context.transportMode) {
      modeParts.push(context.transportMode);
    }
    // Add resolved options (sorted by key for consistent ordering)
    if (resolvedOptions) {
      for (const key of Object.keys(resolvedOptions).sort()) {
        modeParts.push(resolvedOptions[key]);
      }
    }
    const modeSuffix = modeParts.length > 0 ? `-${modeParts.join("-")}` : "";
    const testFile = path.join(workDir, `test-${testCaseId}${modeSuffix}.js`);
    const logFile = path.join(workDir, `test-${testCaseId}${modeSuffix}.log`);

    const env = {
      ...process.env,
      SENTRY_DSN: sentryDsn,
      RUN_ID: runId,
      OPENAI_API_KEY: process.env.OPENAI_API_KEY || "",
      OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY || "",
      GOOGLE_GENAI_API_KEY: process.env.GOOGLE_GENAI_API_KEY || "",
    };

    try {
      const { stdout, stderr } = await execAsync(`node ${testFile}`, {
        cwd: workDir,
        env,
        timeout: context.timeoutMs,
      });

      // Write stdout and stderr to log file
      const logContent = [
        "=== Test Execution Log ===",
        `Test: ${testDefinition.name}`,
        `Timestamp: ${new Date().toISOString()}`,
        "",
        "=== STDOUT ===",
        stdout || "(no output)",
        "",
        "=== STDERR ===",
        stderr || "(no errors)",
        "",
        "=== End of Log ===",
      ].join("\n");

      await fs.writeFile(logFile, logContent, "utf-8");

      if (verbose) {
        console.log(`  Log written to: ${path.basename(logFile)}`);

        if (stdout) {
          console.log("  Test output:");
          stdout.split("\n").forEach((line) => {
            if (line.trim()) console.log(`    ${line}`);
          });
        }

        if (stderr) {
          console.error("  Test errors:");
          stderr.split("\n").forEach((line) => {
            if (line.trim()) console.error(`    ${line}`);
          });
        }
      }
    } catch (error: any) {
      // Write error to log file even on failure
      const errorContent = [
        "=== Test Execution Log (FAILED) ===",
        `Test: ${testDefinition.name}`,
        `Timestamp: ${new Date().toISOString()}`,
        "",
        "=== ERROR ===",
        error.message || "Unknown error",
        "",
        "=== STDOUT ===",
        error.stdout || "(no output)",
        "",
        "=== STDERR ===",
        error.stderr || "(no errors)",
        "",
        "=== End of Log ===",
      ].join("\n");

      try {
        await fs.writeFile(logFile, errorContent, "utf-8");
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

  /**
   * Get Node.js version
   */
  async getNodeVersion(): Promise<string> {
    try {
      const { stdout } = await execAsync("node --version");
      return stdout.trim();
    } catch {
      return "Unknown";
    }
  }
}
