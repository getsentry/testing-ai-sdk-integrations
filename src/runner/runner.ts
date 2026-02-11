/**
 * Runner - orchestrates template rendering and test execution
 */

import { RunnerContext, FrameworkConfig } from "../types.js";
import { TemplateRenderer } from "./template-renderer.js";
import { PythonRunner } from "./python-runner.js";
import { JavaScriptRunner } from "./javascript-runner.js";
import * as path from "path";
import * as fs from "fs/promises";
import * as prettier from "prettier";

export class Runner {
  private runsDir: string;
  private renderer: TemplateRenderer;
  private pythonRunner: PythonRunner;
  private jsRunner: JavaScriptRunner;

  constructor() {
    this.runsDir = path.join(process.cwd(), "runs");
    this.renderer = new TemplateRenderer();
    this.pythonRunner = new PythonRunner();
    this.jsRunner = new JavaScriptRunner();
  }

  /**
   * Get work directory for a framework
   */
  getWorkDir(framework: FrameworkConfig): string {
    const { platform, name, version, sentryVersion } = framework;
    return path.join(
      this.runsDir,
      platform,
      `${name}-${version}-sentry-${sentryVersion}`,
    );
  }

  /**
   * Run a test
   */
  async runTest(context: RunnerContext): Promise<void> {
    const workDir = context.workDir;
    const verbose = context.verbose !== false; // Default to true

    // Ensure work directory exists
    await fs.mkdir(workDir, { recursive: true });

    // Get platform-specific runner
    const platformRunner =
      context.framework.platform === "python"
        ? this.pythonRunner
        : this.jsRunner;

    // Check if environment needs setup
    const needsSetup = await platformRunner.needsSetup(workDir);
    if (needsSetup) {
      await platformRunner.setupEnvironment(context);
    } else if (verbose) {
      console.log("  Using cached environment");
    }

    // Render template
    await this.renderTemplate(context);

    // Execute test
    await platformRunner.executeTest(context);
  }

  /**
   * Setup only (environment + template) without executing the test
   */
  async setupOnly(context: RunnerContext): Promise<void> {
    const workDir = context.workDir;
    const verbose = context.verbose !== false;

    // Ensure work directory exists
    await fs.mkdir(workDir, { recursive: true });

    // Get platform-specific runner
    const platformRunner =
      context.framework.platform === "python"
        ? this.pythonRunner
        : this.jsRunner;

    // Check if environment needs setup
    const needsSetup = await platformRunner.needsSetup(workDir);
    if (needsSetup) {
      await platformRunner.setupEnvironment(context);
    } else if (verbose) {
      console.log("  Using cached environment");
    }

    // Render template
    await this.renderTemplate(context);
  }

  /**
   * Setup environment only (no template rendering)
   * Used when we want to setup environments for all tests first, then render templates
   */
  async setupEnvironmentOnly(context: RunnerContext): Promise<void> {
    const workDir = context.workDir;
    const verbose = context.verbose !== false;

    // Ensure work directory exists
    await fs.mkdir(workDir, { recursive: true });

    // Get platform-specific runner
    const platformRunner =
      context.framework.platform === "python"
        ? this.pythonRunner
        : this.jsRunner;

    // Check if environment needs setup
    const needsSetup = await platformRunner.needsSetup(workDir);
    if (needsSetup) {
      await platformRunner.setupEnvironment(context);
    } else if (verbose) {
      console.log("  Using cached environment");
    }
  }

  /**
   * Render template only (assumes environment is already set up)
   */
  async renderTemplateOnly(context: RunnerContext): Promise<string> {
    const workDir = context.workDir;

    // Ensure work directory exists
    await fs.mkdir(workDir, { recursive: true });

    // Render template and return the path
    return await this.renderTemplate(context);
  }

  /**
   * Execute test only (assumes template is already rendered)
   */
  async executeOnly(context: RunnerContext): Promise<void> {
    // Get platform-specific runner
    const platformRunner =
      context.framework.platform === "python"
        ? this.pythonRunner
        : this.jsRunner;

    // Execute test
    await platformRunner.executeTest(context);
  }

  /**
   * Generate test case ID from test name
   * Converts "Basic LLM Test" to "basic-llm-test"
   */
  private generateTestCaseId(testName: string): string {
    return testName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  /**
   * Render template and return the test file path
   */
  private async renderTemplate(context: RunnerContext): Promise<string> {
    const verbose = context.verbose !== false; // Default to true
    if (verbose) {
      console.log(`  Rendering template for ${context.framework.name}...`);
    }

    const { workDir, framework, testDefinition, isAsync, isStreaming } =
      context;

    // Generate test case ID from test name
    const testCaseId = this.generateTestCaseId(testDefinition.name);

    // Build mode suffix for filename
    const modeParts: string[] = [];
    if (framework.platform === "python") {
      modeParts.push(isAsync ? "async" : "sync");
    }
    if (framework.streamingMode) {
      modeParts.push(isStreaming ? "streaming" : "blocking");
    }

    // Determine test filename based on platform and modes
    const extension = framework.platform === "python" ? "py" : "js";
    const modeSuffix = modeParts.length > 0 ? `-${modeParts.join("-")}` : "";
    const testFile = `test-${testCaseId}${modeSuffix}.${extension}`;

    const testPath = path.join(workDir, testFile);

    // Apply model overrides to inputs if specified in framework config
    let processedInputs = testDefinition.inputs;
    if (framework.modelOverrides) {
      processedInputs = testDefinition.inputs.map((input) => ({
        ...input,
        model: framework.modelOverrides?.request || input.model,
      }));
    }

    // Build template context
    const templateContext = {
      testName: testDefinition.name,
      frameworkName: framework.name,
      sentryDsn: context.sentryDsn,
      runId: context.runId,
      isAsync: isAsync || false, // Boolean flag for templates
      isStreaming: isStreaming || false, // Boolean flag for streaming mode
      causeAPIError: testDefinition.causeAPIError || false, // Flag to intentionally cause API errors
      ...(testDefinition.agent && { agent: testDefinition.agent }),
      inputs: processedInputs,
    };

    // Render framework template if available, otherwise base template
    let rendered: string;
    if (framework.category && framework.templatePath) {
      // Use discovered framework template
      rendered = this.renderer.renderFramework(
        framework.category as "llm" | "agents",
        framework.platform,
        framework.name,
        templateContext,
      );
    } else {
      // Fallback to base template
      rendered = this.renderer.renderBase(framework.platform, templateContext);
    }

    await fs.writeFile(testPath, rendered);

    // Format the rendered file
    await this.formatFile(testPath, framework.platform);

    return testPath;
  }

  /**
   * Format a generated test file
   * Uses Prettier JS API for JavaScript (node), black CLI for Python
   */
  private async formatFile(
    filePath: string,
    platform: "node" | "python",
  ): Promise<void> {
    try {
      if (platform === "python") {
        // Python formatting requires black CLI (optional)
        const { exec } = await import("child_process");
        const { promisify } = await import("util");
        const execAsync = promisify(exec);
        await execAsync(`black --quiet "${filePath}"`, { timeout: 10000 });
      } else {
        // Use Prettier JS API for JavaScript
        const source = await fs.readFile(filePath, "utf-8");
        const formatted = await prettier.format(source, {
          filepath: filePath,
          parser: "babel",
        });
        await fs.writeFile(filePath, formatted);
      }
    } catch {
      // Formatting failed silently - not critical
    }
  }
}
