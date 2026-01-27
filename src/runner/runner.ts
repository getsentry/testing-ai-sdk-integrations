/**
 * Runner - orchestrates template rendering and test execution
 */

import { RunnerContext, FrameworkConfig } from '../types.js';
import { TemplateRenderer } from './template-renderer.js';
import { PythonRunner } from './python-runner.js';
import { JavaScriptRunner } from './javascript-runner.js';
import * as path from 'path';
import * as fs from 'fs/promises';

export class Runner {
  private runsDir: string;
  private renderer: TemplateRenderer;
  private pythonRunner: PythonRunner;
  private jsRunner: JavaScriptRunner;

  constructor() {
    this.runsDir = path.join(process.cwd(), 'runs');
    this.renderer = new TemplateRenderer();
    this.pythonRunner = new PythonRunner();
    this.jsRunner = new JavaScriptRunner();
  }

  /**
   * Get work directory for a framework
   */
  getWorkDir(framework: FrameworkConfig): string {
    const { platform, name, version, sentryVersion } = framework;
    return path.join(this.runsDir, platform, `${name}-${version}-sentry-${sentryVersion}`);
  }

  /**
   * Run a test
   */
  async runTest(context: RunnerContext): Promise<void> {
    const workDir = context.workDir;

    // Ensure work directory exists
    await fs.mkdir(workDir, { recursive: true });

    // Get platform-specific runner
    const platformRunner = context.framework.platform === 'py' 
      ? this.pythonRunner 
      : this.jsRunner;

    // Check if environment needs setup
    const needsSetup = await platformRunner.needsSetup(workDir);
    if (needsSetup) {
      await platformRunner.setupEnvironment(context);
    } else {
      console.log('  Using cached environment');
    }

    // Render template
    await this.renderTemplate(context);

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
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  /**
   * Render template
   */
  private async renderTemplate(context: RunnerContext): Promise<void> {
    console.log(`  Rendering template for ${context.framework.name}...`);
    
    const { workDir, framework, testDefinition, isAsync } = context;
    
    // Generate test case ID from test name
    const testCaseId = this.generateTestCaseId(testDefinition.name);
    
    // Determine test filename based on platform, test case, and execution mode
    let testFile: string;
    if (framework.platform === 'js') {
      testFile = `test-${testCaseId}.js`;
    } else {
      // Python: include sync/async in filename
      const mode = isAsync ? 'async' : 'sync';
      testFile = `test-${testCaseId}-${mode}.py`;
    }
    
    const testPath = path.join(workDir, testFile);
    
    // Build template context
    const templateContext = {
      testName: testDefinition.name,
      frameworkName: framework.name,
      sentryDsn: context.sentryDsn,
      runId: context.runId,
      isAsync: isAsync || false, // Boolean flag for templates
      ...(testDefinition.agent && { agent: testDefinition.agent }),
      inputs: testDefinition.inputs,
    };
    
    // Render framework template if available, otherwise base template
    let rendered: string;
    if (framework.category && framework.templatePath) {
      // Use discovered framework template
      rendered = this.renderer.renderFramework(
        framework.category as 'llm' | 'agents',
        framework.platform,
        framework.name,
        templateContext
      );
    } else {
      // Fallback to base template
      rendered = this.renderer.renderBase(framework.platform, templateContext);
    }
    
    await fs.writeFile(testPath, rendered);
  }


}
