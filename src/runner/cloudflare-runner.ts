/**
 * Cloudflare Workers-specific test runner
 * Handles environment setup, wrangler dev server management, and test execution
 */

import * as path from "path";
import * as fs from "fs/promises";
import { exec, spawn, ChildProcess } from "child_process";
import { promisify } from "util";
import { RunnerContext } from "../types.js";

const execAsync = promisify(exec);

export class CloudflareRunner {
  /**
   * Check if Cloudflare environment needs setup
   */
  async needsSetup(workDir: string): Promise<boolean> {
    const nodeModulesPath = path.join(workDir, "node_modules");
    try {
      await fs.access(nodeModulesPath);
      return false;
    } catch {
      return true;
    }
  }

  /**
   * Setup Cloudflare Workers environment: install dependencies and generate config files
   */
  async setupEnvironment(context: RunnerContext): Promise<void> {
    const { workDir, framework } = context;
    const verbose = context.verbose === true;

    if (verbose) {
      console.log(
        `  Setting up Cloudflare Workers environment in ${workDir}...`,
      );
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

    // Create wrangler.json (main will be updated per test at execution time)
    const wranglerConfig = {
      name: `test-${framework.name}`,
      main: "worker.js",
      compatibility_date: "2024-09-23",
      compatibility_flags: ["nodejs_compat"],
    };
    await fs.writeFile(
      path.join(workDir, "wrangler.json"),
      JSON.stringify(wranglerConfig, null, 2),
    );
    if (verbose) {
      console.log("  ✓ wrangler.json generated");
    }

    // Create .dev.vars with API keys and SENTRY_DSN
    const devVars = [
      `SENTRY_DSN=${context.sentryDsn || ""}`,
      `OPENAI_API_KEY=${process.env.OPENAI_API_KEY || ""}`,
      `ANTHROPIC_API_KEY=${process.env.ANTHROPIC_API_KEY || ""}`,
      `GOOGLE_GENAI_API_KEY=${process.env.GOOGLE_GENAI_API_KEY || ""}`,
    ].join("\n");
    await fs.writeFile(path.join(workDir, ".dev.vars"), devVars);
    if (verbose) {
      console.log("  ✓ .dev.vars generated");
    }

    // Install dependencies
    if (verbose) {
      console.log("  Installing dependencies...");
    }

    const localSentryPath = process.env.SENTRY_JAVASCRIPT_PATH;
    if (localSentryPath && framework.sentryVersion === "local") {
      if (verbose) {
        console.log(`  Linking local Sentry SDK from: ${localSentryPath}`);
      }
      await execAsync("npm install --no-save", {
        cwd: workDir,
        env: { ...process.env, npm_config_loglevel: "error" },
      });
      await execAsync(
        `npm link "${localSentryPath}/packages/cloudflare"`,
        {
          cwd: workDir,
          env: { ...process.env, npm_config_loglevel: "error" },
        },
      );
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

    // Add Sentry Cloudflare SDK
    if (framework.sentryVersion !== "local") {
      dependencies["@sentry/cloudflare"] = framework.sentryVersion;
    }

    // Add wrangler for local dev server
    dependencies["wrangler"] = "latest";

    // Add framework dependencies from config
    if (framework.dependencies) {
      for (const dep of framework.dependencies) {
        let version = dep.version;

        if (version === "framework") {
          version = framework.version;
        }

        if (version === "sentry") {
          version = framework.sentryVersion;
        }

        // Skip Sentry packages if already added
        if (dep.package === "@sentry/cloudflare") {
          continue;
        }

        dependencies[dep.package] = version;
      }
    } else {
      dependencies[framework.name] = framework.version;
    }

    return {
      name: `test-cloudflare-${framework.name}`,
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
   * Execute Cloudflare Workers test
   *
   * Flow:
   * 1. Update wrangler.json to point to the specific test file
   * 2. Update .dev.vars with the correct SENTRY_DSN
   * 3. Start wrangler dev server on a random port
   * 4. Wait for "Ready on http://..." in stdout
   * 5. Send HTTP request to trigger the worker
   * 6. Wait for response and span flushing
   * 7. Kill the wrangler process
   */
  async executeTest(context: RunnerContext): Promise<void> {
    const {
      workDir,
      sentryDsn,
      runId,
      testDefinition,
      framework,
      isStreaming,
    } = context;
    const verbose = context.verbose === true;

    if (verbose) {
      console.log("  Executing Cloudflare Workers test...");
    }

    // Generate test case ID and determine filename
    const testCaseId = this.generateTestCaseId(testDefinition.name);
    const modeParts: string[] = [];
    if (framework.streamingMode) {
      modeParts.push(isStreaming ? "streaming" : "blocking");
    }
    const modeSuffix = modeParts.length > 0 ? `-${modeParts.join("-")}` : "";
    const testFile = `test-${testCaseId}${modeSuffix}.js`;
    const logFile = path.join(workDir, `test-${testCaseId}${modeSuffix}.log`);

    // Write a test-specific wrangler config file to avoid race conditions
    // when multiple tests share the same workDir
    const wranglerConfigFile = `wrangler-${testCaseId}${modeSuffix}.json`;
    const wranglerConfig = {
      name: `test-${framework.name}`,
      main: testFile,
      compatibility_date: "2024-09-23",
      compatibility_flags: ["nodejs_compat"],
    };
    await fs.writeFile(
      path.join(workDir, wranglerConfigFile),
      JSON.stringify(wranglerConfig, null, 2),
    );

    // Update .dev.vars with the correct SENTRY_DSN for this test run
    const devVars = [
      `SENTRY_DSN=${sentryDsn}`,
      `RUN_ID=${runId}`,
      `OPENAI_API_KEY=${process.env.OPENAI_API_KEY || ""}`,
      `ANTHROPIC_API_KEY=${process.env.ANTHROPIC_API_KEY || ""}`,
      `GOOGLE_GENAI_API_KEY=${process.env.GOOGLE_GENAI_API_KEY || ""}`,
    ].join("\n");
    await fs.writeFile(path.join(workDir, ".dev.vars"), devVars);

    // Pick a random port to avoid conflicts
    const port = 10000 + Math.floor(Math.random() * 50000);

    let wranglerProcess: ChildProcess | null = null;
    let stdout = "";
    let stderr = "";

    try {
      // Start wrangler dev server
      const wranglerReady = await new Promise<string>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error("Wrangler dev server failed to start within 30s"));
        }, 30000);

        wranglerProcess = spawn(
          "npx",
          ["wrangler", "dev", "--config", wranglerConfigFile, "--port", String(port)],
          {
            cwd: workDir,
            env: {
              ...process.env,
              SENTRY_DSN: sentryDsn,
              RUN_ID: runId,
            },
            stdio: ["pipe", "pipe", "pipe"],
            detached: true,
          },
        );

        wranglerProcess.stdout?.on("data", (data: Buffer) => {
          const text = data.toString();
          stdout += text;
          if (verbose) {
            text
              .split("\n")
              .filter((l: string) => l.trim())
              .forEach((l: string) => console.log(`    [wrangler] ${l}`));
          }

          // Look for the ready signal
          const readyMatch = text.match(
            /Ready on (https?:\/\/[^\s]+)/,
          );
          if (readyMatch) {
            clearTimeout(timeout);
            resolve(readyMatch[1]);
          }
        });

        wranglerProcess.stderr?.on("data", (data: Buffer) => {
          const text = data.toString();
          stderr += text;
          if (verbose) {
            text
              .split("\n")
              .filter((l: string) => l.trim())
              .forEach((l: string) =>
                console.error(`    [wrangler:err] ${l}`),
              );
          }

          // Wrangler sometimes logs the ready URL to stderr
          const readyMatch = text.match(
            /Ready on (https?:\/\/[^\s]+)/,
          );
          if (readyMatch) {
            clearTimeout(timeout);
            resolve(readyMatch[1]);
          }
        });

        wranglerProcess.on("error", (err) => {
          clearTimeout(timeout);
          reject(new Error(`Failed to start wrangler: ${err.message}`));
        });

        wranglerProcess.on("exit", (code) => {
          clearTimeout(timeout);
          if (code !== null && code !== 0) {
            reject(
              new Error(
                `Wrangler exited with code ${code}\nstdout: ${stdout}\nstderr: ${stderr}`,
              ),
            );
          }
        });
      });

      if (verbose) {
        console.log(`  Wrangler ready at: ${wranglerReady}`);
      }

      // Send HTTP request to trigger the worker
      const workerUrl = `http://localhost:${port}/`;
      if (verbose) {
        console.log(`  Sending request to ${workerUrl}...`);
      }

      const response = await fetch(workerUrl, {
        signal: AbortSignal.timeout(context.timeoutMs),
      });
      const responseText = await response.text();

      if (verbose) {
        console.log(`  Worker response (${response.status}): ${responseText}`);
      }

      if (!response.ok) {
        throw new Error(
          `Worker returned HTTP ${response.status}: ${responseText}`,
        );
      }

      // Wait for Sentry spans to flush
      // The worker sends spans via the Sentry SDK which uses fetch internally
      await new Promise((resolve) => setTimeout(resolve, 3000));

      // Write log file
      const logContent = [
        "=== Test Execution Log ===",
        `Test: ${testDefinition.name}`,
        `Timestamp: ${new Date().toISOString()}`,
        `Port: ${port}`,
        "",
        "=== Worker Response ===",
        `Status: ${response.status}`,
        `Body: ${responseText}`,
        "",
        "=== Wrangler STDOUT ===",
        stdout || "(no output)",
        "",
        "=== Wrangler STDERR ===",
        stderr || "(no errors)",
        "",
        "=== End of Log ===",
      ].join("\n");

      await fs.writeFile(logFile, logContent, "utf-8");

      if (verbose) {
        console.log(`  Log written to: ${path.basename(logFile)}`);
      }
    } catch (error: any) {
      // Write error to log file
      const errorContent = [
        "=== Test Execution Log (FAILED) ===",
        `Test: ${testDefinition.name}`,
        `Timestamp: ${new Date().toISOString()}`,
        `Port: ${port}`,
        "",
        "=== ERROR ===",
        error.message || "Unknown error",
        "",
        "=== Wrangler STDOUT ===",
        stdout || "(no output)",
        "",
        "=== Wrangler STDERR ===",
        stderr || "(no errors)",
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

      if (error.name === "TimeoutError" || error.code === "ETIMEDOUT") {
        throw new Error(
          `Test execution timed out (${Math.round(context.timeoutMs / 1000)}s)`,
        );
      }
      throw new Error(
        `Test execution failed: ${error.message}`,
      );
    } finally {
      // Always kill the wrangler process
      if (wranglerProcess) {
        try {
          // Kill the process group to ensure child processes are also killed
          process.kill(-(wranglerProcess as ChildProcess).pid!, "SIGTERM");
        } catch {
          // Process may already be dead
          try {
            (wranglerProcess as ChildProcess).kill("SIGTERM");
          } catch {
            // Ignore
          }
        }
      }
    }
  }
}
