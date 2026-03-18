/**
 * Runner - orchestrates template rendering and test execution
 */

import { RunnerContext, FrameworkConfig } from "../types.js";
import { TemplateRenderer, TemplateContext } from "./template-renderer.js";
import { PythonRunner } from "./python-runner.js";
import { JavaScriptRunner } from "./javascript-runner.js";
import { BrowserRunner } from "./browser-runner.js";
import { PhpRunner } from "./php-runner.js";
import { CloudflareRunner } from "./cloudflare-runner.js";
import {
  getFileExtension,
  buildModeSuffix,
  getFormatterParser,
} from "../platform-utils.js";
import * as path from "path";
import * as fs from "fs/promises";
import * as prettier from "prettier";

export class Runner {
  private runsDir: string;
  private renderer: TemplateRenderer;
  private pythonRunner: PythonRunner;
  private jsRunner: JavaScriptRunner;
  private browserRunner: BrowserRunner;
  private phpRunner: PhpRunner;
  private cloudflareRunner: CloudflareRunner;

  constructor() {
    this.runsDir = path.join(process.cwd(), "runs");
    this.renderer = new TemplateRenderer();
    this.pythonRunner = new PythonRunner();
    this.jsRunner = new JavaScriptRunner();
    this.browserRunner = new BrowserRunner();
    this.phpRunner = new PhpRunner();
    this.cloudflareRunner = new CloudflareRunner();
  }

  /**
   * Get platform-specific runner based on platform
   */
  private getPlatformRunner(
    platform: "node" | "python" | "browser" | "nextjs" | "php" | "cloudflare",
  ): PythonRunner | JavaScriptRunner | BrowserRunner | PhpRunner | CloudflareRunner {
    if (platform === "python") {
      return this.pythonRunner;
    } else if (platform === "php") {
      return this.phpRunner;
    } else if (platform === "browser") {
      return this.browserRunner;
    } else if (platform === "cloudflare") {
      return this.cloudflareRunner;
    } else {
      return this.jsRunner;
    }
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
    const platformRunner = this.getPlatformRunner(context.framework.platform);

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
    const platformRunner = this.getPlatformRunner(context.framework.platform);

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
    const platformRunner = this.getPlatformRunner(context.framework.platform);

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
    const platformRunner = this.getPlatformRunner(context.framework.platform);

    // Execute test
    await platformRunner.executeTest(context);
  }

  /**
   * Bundle all rendered browser test files in a work directory with a single Vite build.
   * Must be called after all templates for a browser framework are rendered and before execution.
   */
  async bundleBrowserTests(
    workDir: string,
    htmlFiles: string[],
    verbose: boolean,
  ): Promise<void> {
    await this.browserRunner.bundleAllTests(workDir, htmlFiles, verbose);
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
   * Convert a kebab-case or space-separated name to PascalCase
   * e.g., "basic-agent-test" -> "BasicAgentTest"
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
   * Render template and return the test file path
   */
  private async renderTemplate(context: RunnerContext): Promise<string> {
    const verbose = context.verbose !== false; // Default to true
    if (verbose) {
      console.log(`  Rendering template for ${context.framework.name}...`);
    }

    const { workDir, framework, testDefinition, isAsync, isStreaming, transportMode, resolvedOptions } =
      context;

    // Generate test case ID from test name
    const testCaseId = this.generateTestCaseId(testDefinition.name);

    // Build mode suffix for filename
    const modeSuffix = buildModeSuffix(framework, isAsync, isStreaming, transportMode, resolvedOptions);

    // Determine test filename based on platform and modes
    const extension = getFileExtension(framework.platform);
    let testFile: string;
    let testPath: string;

    if (framework.platform === "php") {
      // PHP/Laravel: command files go in app/Console/Commands/ with the class name
      // Include mode suffix to distinguish streaming/blocking variants
      const commandClassName =
        "RunTest" + this.toPascalCase(testCaseId + modeSuffix);
      testFile = `${commandClassName}.php`;
      const commandsDir = path.join(workDir, "app", "Console", "Commands");
      await fs.mkdir(commandsDir, { recursive: true });
      testPath = path.join(commandsDir, testFile);
    } else {
      testFile = `test-${testCaseId}${modeSuffix}.${extension}`;
      testPath = path.join(workDir, testFile);
    }

    // Apply model overrides to inputs if specified in framework config
    let processedInputs = testDefinition.inputs;
    if (framework.modelOverrides) {
      processedInputs = testDefinition.inputs.map((input) => ({
        ...input,
        model: framework.modelOverrides?.request || input.model,
      }));
    }

    // Build template context
    const templateContext: TemplateContext & Record<string, any> = {
      testName: testDefinition.name,
      frameworkName: framework.name,
      sentryDsn: context.sentryDsn,
      runId: context.runId,
      isAsync: isAsync || false, // Boolean flag for templates
      isStreaming: isStreaming || false, // Boolean flag for streaming mode
      isStdio: transportMode === "stdio", // Boolean flag for stdio transport
      isSse: transportMode === "sse", // Boolean flag for SSE transport
      transportMode: transportMode || undefined, // Transport mode string
      // Spread resolved options as top-level template variables
      ...(resolvedOptions || {}),
      causeAPIError: testDefinition.causeAPIError || false, // Flag to intentionally cause API errors
      ...(testDefinition.agent && { agent: testDefinition.agent }),
      ...(testDefinition.mcpServer && { mcpServer: testDefinition.mcpServer }),
      inputs: processedInputs,
    };

    // PHP/Laravel: add computed class names and command signature for templates
    if (framework.platform === "php") {
      const commandClassName =
        "RunTest" + this.toPascalCase(testCaseId + modeSuffix);
      const agentName = testDefinition.agent?.name || "assistant";
      const agentClassName = this.toPascalCase(agentName);
      templateContext.commandClassName = commandClassName;
      templateContext.commandSignature = `test:${testCaseId}${modeSuffix}`;
      templateContext.agentClassName = agentClassName;
    }

    // Render framework template if available, otherwise base template
    let rendered: string;
    if (framework.category && framework.templatePath) {
      // Use discovered framework template
      rendered = this.renderer.renderFramework(
        framework.category as string,
        framework.platform,
        framework.name,
        templateContext,
      );
    } else {
      // Fallback to base template
      rendered = this.renderer.renderBase(framework.platform, templateContext);
    }

    await fs.writeFile(testPath, rendered);

    // PHP/Laravel: render additional template files (agents, tools) into Laravel directories
    if (
      framework.platform === "php" &&
      framework.category &&
      framework.templatePath
    ) {
      await this.renderPhpTemplates(framework, templateContext, workDir);
    }

    // Format the rendered file
    // Use the same extension logic for determining the formatter
    await this.formatFile(testPath, framework.platform);

    return testPath;
  }

  /**
   * Render additional PHP/Laravel template files (agents, tools) into Laravel directories.
   * Looks for agent.php.njk and tool.php.njk in the framework template directory.
   */
  private async renderPhpTemplates(
    framework: FrameworkConfig,
    templateContext: TemplateContext,
    workDir: string,
  ): Promise<void> {
    const category = framework.category as string;
    const platform = framework.platform;
    const name = framework.name;
    const templateDir = `${category}/${platform}/${name}`;

    // Ensure Ai directories exist (even if setup was cached from a previous run)
    await fs.mkdir(path.join(workDir, "app", "Ai", "Agents"), {
      recursive: true,
    });
    await fs.mkdir(path.join(workDir, "app", "Ai", "Tools"), {
      recursive: true,
    });

    // Render agent template if present
    try {
      const agentRendered = this.renderer.render(
        `${templateDir}/agent.php.njk`,
        templateContext,
      );
      if (agentRendered.trim()) {
        // Derive agent class name from test definition or agent config
        const agentName = templateContext.agent?.name || "TestAgent";
        const pascalName = this.toPascalCase(agentName);
        const agentPath = path.join(
          workDir,
          "app",
          "Ai",
          "Agents",
          `${pascalName}.php`,
        );
        await fs.writeFile(agentPath, agentRendered);
      }
    } catch {
      // agent.php.njk does not exist for this framework; skip
    }

    // Render tool templates if present and agent has tools
    if (templateContext.agent?.tools?.length > 0) {
      for (const tool of templateContext.agent.tools) {
        try {
          const toolContext: TemplateContext = {
            ...templateContext,
            currentTool: tool,
          };
          const rendered = this.renderer.render(
            `${templateDir}/tool.php.njk`,
            toolContext,
          );
          if (rendered.trim()) {
            const toolPascal = this.toPascalCase(tool.name);
            const toolPath = path.join(
              workDir,
              "app",
              "Ai",
              "Tools",
              `${toolPascal}.php`,
            );
            await fs.writeFile(toolPath, rendered);
          }
        } catch {
          // tool.php.njk does not exist for this framework; skip
        }
      }
    }
  }

  /**
   * Format a generated test file
   * Uses Prettier JS API for JavaScript (node/nextjs), black CLI for Python
   */
  private async formatFile(
    filePath: string,
    platform: "node" | "python" | "browser" | "nextjs" | "php" | "cloudflare",
  ): Promise<void> {
    try {
      const parser = getFormatterParser(platform);

      if (parser === null) {
        // No formatter for this platform (e.g., PHP) - skip
        return;
      } else if (parser === "black") {
        // Python formatting requires black CLI (optional)
        const { exec } = await import("child_process");
        const { promisify } = await import("util");
        const execAsync = promisify(exec);
        await execAsync(`black --quiet "${filePath}"`, { timeout: 10000 });
      } else {
        // Use Prettier JS API for HTML or JavaScript
        const source = await fs.readFile(filePath, "utf-8");
        const formatted = await prettier.format(source, {
          filepath: filePath,
          parser,
        });
        await fs.writeFile(filePath, formatted);
      }
    } catch {
      // Formatting failed silently - not critical
    }
  }
}
