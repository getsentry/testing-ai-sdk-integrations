/**
 * Browser-specific test runner
 * Handles local dependency installation, Vite bundling, and Playwright execution
 */

import * as path from "path";
import * as fs from "fs/promises";
import { exec } from "child_process";
import { promisify } from "util";
import { chromium, Browser, BrowserContext, Page } from "playwright";
import { RunnerContext } from "../types.js";

const execAsync = promisify(exec);

export class BrowserRunner {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;

  /**
   * Check if browser environment needs setup
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
   * Setup browser environment: install dependencies locally
   */
  async setupEnvironment(context: RunnerContext): Promise<void> {
    const { workDir, framework } = context;
    const verbose = context.verbose === true;

    if (verbose) {
      console.log(`  Setting up browser environment in ${workDir}...`);
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
      // Link local Sentry SDK
      await execAsync(`npm link "${localSentryPath}/packages/browser"`, {
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
   * Generate package.json content for browser tests
   */
  private generatePackageJson(context: RunnerContext): object {
    const { framework } = context;
    const dependencies: Record<string, string> = {};

    // Add Sentry SDK (skip if using local version, will be linked separately)
    if (framework.sentryVersion !== "local") {
      dependencies["@sentry/browser"] = framework.sentryVersion;
    }

    // Add framework dependencies from config
    if (framework.dependencies && framework.dependencies.length > 0) {
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

        // Skip @sentry/browser if already added
        if (dep.package === "@sentry/browser") {
          continue;
        }

        dependencies[dep.package] = version;
      }
    } else {
      // Fallback: Add framework package with framework version
      dependencies[framework.name] = framework.version;
    }

    return {
      name: `test-${framework.name}-browser`,
      version: "1.0.0",
      type: "module",
      dependencies,
      devDependencies: {
        "vite": "^6.0.11",
        "vite-plugin-singlefile": "^2.0.5",
      },
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
   * Create Vite config for bundling
   * Uses vite-plugin-singlefile to bundle everything into a single HTML file
   */
  private async createViteConfig(workDir: string, htmlFile: string): Promise<void> {
    const viteConfig = `
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  plugins: [viteSingleFile()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: '${htmlFile}',
    },
  },
});
`;
    await fs.writeFile(path.join(workDir, "vite.config.js"), viteConfig);
  }

  /**
   * Bundle test with Vite
   */
  private async bundleWithVite(workDir: string, verbose: boolean): Promise<void> {
    if (verbose) {
      console.log("  Bundling with Vite...");
    }

    try {
      // Use vite from the test's local node_modules
      const viteCmd = path.join(workDir, "node_modules", ".bin", "vite");
      await execAsync(`"${viteCmd}" build`, {
        cwd: workDir,
        env: { ...process.env, NODE_ENV: "production" },
      });

      if (verbose) {
        console.log("  ✓ Vite bundling completed");
      }
    } catch (error: any) {
      throw new Error(`Vite bundling failed: ${error.message}`);
    }
  }

  /**
   * Initialize Playwright browser
   */
  private async initBrowser(): Promise<void> {
    if (this.browser) {
      return; // Already initialized
    }

    this.browser = await chromium.launch({
      headless: true,
    });

    // Create context
    this.context = await this.browser.newContext({
      bypassCSP: true,
      ignoreHTTPSErrors: true,
      permissions: [],
    });
  }

  /**
   * Execute browser test using Playwright
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
      console.log("  Executing browser test with Playwright...");
    }

    // Generate test case ID and determine filename
    const testCaseId = this.generateTestCaseId(testDefinition.name);
    const modeParts: string[] = [];
    if (framework.streamingMode) {
      modeParts.push(isStreaming ? "streaming" : "blocking");
    }
    const modeSuffix = modeParts.length > 0 ? `-${modeParts.join("-")}` : "";
    const testFile = `test-${testCaseId}${modeSuffix}.html`;
    const testPath = path.join(workDir, testFile);
    const logFile = path.join(workDir, `test-${testCaseId}${modeSuffix}.log`);

    // Verify test file exists
    try {
      await fs.access(testPath);
    } catch {
      throw new Error(`Test file not found: ${testPath}`);
    }

    // Create Vite config
    await this.createViteConfig(workDir, testFile);

    // Bundle with Vite
    await this.bundleWithVite(workDir, verbose);

    // The bundled output will be in dist/
    const bundledHtmlPath = path.join(workDir, "dist", testFile);

    let page: Page | null = null;

    try {
      // Initialize browser
      await this.initBrowser();

      if (!this.context) {
        throw new Error("Browser context not initialized");
      }

      // Create new page
      page = await this.context.newPage();

      // Collect console logs
      const logs: string[] = [];
      page.on("console", (msg) => {
        const text = msg.text();
        logs.push(`[${msg.type()}] ${text}`);
        if (verbose) {
          console.log(`    [browser] ${text}`);
        }
      });

      // Collect errors
      page.on("pageerror", (error) => {
        logs.push(`[error] ${error.message}`);
        if (verbose) {
          console.error(`    [browser error] ${error.message}`);
        }
      });

      // Inject environment variables before loading the page
      await page.addInitScript(`
        window.SENTRY_DSN = ${JSON.stringify(sentryDsn)};
        window.RUN_ID = ${JSON.stringify(runId)};
        window.OPENAI_API_KEY = ${JSON.stringify(process.env.OPENAI_API_KEY || "")};
        window.ANTHROPIC_API_KEY = ${JSON.stringify(process.env.ANTHROPIC_API_KEY || "")};
        window.GOOGLE_API_KEY = ${JSON.stringify(process.env.GOOGLE_API_KEY || "")};
        window.testComplete = false;
      `);

      // Navigate to bundled test file
      const fileUrl = `file://${bundledHtmlPath}`;
      if (verbose) {
        console.log(`  Loading: ${fileUrl}`);
      }

      await page.goto(fileUrl, {
        waitUntil: "domcontentloaded",
      });

      // Wait for test to complete (window.testComplete = true)
      // Timeout after 60 seconds
      await page.waitForFunction(
        'window.testComplete === true',
        { timeout: 60000 }
      );

      if (verbose) {
        console.log("  ✓ Test completed successfully");
      }

      // Write logs to file
      const logContent = [
        "=== Browser Test Execution Log ===",
        `Test: ${testDefinition.name}`,
        `Timestamp: ${new Date().toISOString()}`,
        "",
        "=== Browser Console Output ===",
        ...logs,
        "",
        "=== End of Log ===",
      ].join("\n");

      await fs.writeFile(logFile, logContent, "utf-8");

      if (verbose) {
        console.log(`  Log written to: ${path.basename(logFile)}`);
      }
    } catch (error: any) {
      // Write error to log file
      const logs: string[] = [];
      if (page) {
        try {
          const title = await page.title();
          logs.push(`Page title: ${title}`);
        } catch {}
      }

      const errorContent = [
        "=== Browser Test Execution Log (FAILED) ===",
        `Test: ${testDefinition.name}`,
        `Timestamp: ${new Date().toISOString()}`,
        "",
        "=== ERROR ===",
        error.message || "Unknown error",
        "",
        "=== Browser Console Output ===",
        ...logs,
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

      if (error.message?.includes("Timeout")) {
        throw new Error("Browser test timed out (60s)");
      }
      throw new Error(`Browser test execution failed: ${error.message}`);
    } finally {
      // Close page
      if (page) {
        await page.close();
      }
    }
  }

  /**
   * Cleanup browser resources
   */
  async cleanup(): Promise<void> {
    if (this.context) {
      await this.context.close();
      this.context = null;
    }

    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  /**
   * Get Playwright version
   */
  async getPlaywrightVersion(): Promise<string> {
    try {
      const fs = await import("fs/promises");
      const path = await import("path");
      const pkgPath = path.join(process.cwd(), "node_modules", "playwright", "package.json");
      const pkgContent = await fs.readFile(pkgPath, "utf-8");
      const pkg = JSON.parse(pkgContent);
      return pkg.version || "Unknown";
    } catch {
      return "Unknown";
    }
  }
}

// Add type declarations for window properties
declare global {
  interface Window {
    SENTRY_DSN: string;
    RUN_ID: string;
    OPENAI_API_KEY: string;
    ANTHROPIC_API_KEY: string;
    GOOGLE_API_KEY: string;
    testComplete: boolean;
  }
}
