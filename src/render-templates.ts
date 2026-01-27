#!/usr/bin/env node
/**
 * CLI tool to render templates for specific platforms, frameworks, or tests
 */

import { TemplateRenderer } from './runner/template-renderer.js';
import { getAllTests } from './test-cases/index.js';
import { discoverFrameworks } from './runner/framework-discovery.js';
import * as fs from 'fs/promises';
import * as path from 'path';

interface RenderOptions {
  platform?: 'js' | 'py';
  framework?: string;
  test?: string;
  outputDir?: string;
}

async function renderTemplates(options: RenderOptions = {}): Promise<void> {
  const renderer = new TemplateRenderer();
  const outputDir = options.outputDir || path.join(process.cwd(), '.preview');

  // Ensure output directory exists
  await fs.mkdir(outputDir, { recursive: true });

  console.log('Template Renderer');
  console.log('='.repeat(60));
  console.log(`Output directory: ${outputDir}`);
  console.log(`Note: This is a preview tool. Actual tests render to runs/\n`);

  // Determine which tests to render
  const testsToRender = options.test
    ? getAllTests().filter(t => t.name === options.test)
    : getAllTests();

  if (testsToRender.length === 0) {
    console.error(`Error: No test found with name "${options.test}"`);
    process.exit(1);
  }

  // Discover frameworks from templates directory
  let frameworks = discoverFrameworks();

  // Filter frameworks by platform if specified
  if (options.platform) {
    frameworks = frameworks.filter(f => f.platform === options.platform);
  }

  // Filter by framework name if specified
  if (options.framework) {
    frameworks = frameworks.filter(f => f.name === options.framework);
  }

  if (frameworks.length === 0) {
    console.error(`Error: No frameworks found matching criteria`);
    process.exit(1);
  }

  let renderedCount = 0;

  // Render templates for each framework and test combination
  for (const framework of frameworks) {
    for (const test of testsToRender) {
      // Skip incompatible combinations
      // LLM frameworks (llm-only) can't run agent tests
      if (framework.type === 'llm-only' && test.agent) {
        console.log(`⊘ Skipping ${test.name} on ${framework.name} (LLM framework, agent test)`);
        continue;
      }
      // Agent frameworks require agent tests
      if (framework.type === 'agentic' && !test.agent) {
        console.log(`⊘ Skipping ${test.name} on ${framework.name} (Agent framework, non-agent test)`);
        continue;
      }

      try {
        const context = {
          testName: test.name,
          frameworkName: framework.name,
          ...(test.agent && { agent: test.agent }),
          inputs: test.inputs,
        };

        const rendered = renderer.renderFramework(
          framework.category as 'llm' | 'agents',
          framework.platform,
          framework.name,
          context
        );

        // Create output filename
        const extension = framework.platform === 'js' ? 'js' : 'py';
        const sanitizedTestName = test.name.toLowerCase().replace(/\s+/g, '-');
        const filename = `${framework.name}-${sanitizedTestName}.${extension}`;
        const outputPath = path.join(outputDir, filename);

        // Write to file
        await fs.writeFile(outputPath, rendered);

        console.log(`✓ ${framework.displayName} - ${test.name}`);
        console.log(`  → ${outputPath}`);

        renderedCount++;
      } catch (error: any) {
        console.error(`✗ ${framework.displayName} - ${test.name}`);
        console.error(`  Error: ${error.message}`);
      }
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log(`✅ Rendered ${renderedCount} template(s)`);
  console.log('='.repeat(60));
}

// Parse CLI arguments
function parseArgs(): RenderOptions {
  const args = process.argv.slice(2);
  const options: RenderOptions = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const value = args[i + 1];

    switch (arg) {
      case '--platform':
      case '-p':
        if (value !== 'js' && value !== 'py') {
          console.error('Error: --platform must be "js" or "py"');
          process.exit(1);
        }
        options.platform = value;
        i++;
        break;
      case '--framework':
      case '-f':
        options.framework = value;
        i++;
        break;
      case '--test':
      case '-t':
        options.test = value;
        i++;
        break;
      case '--output':
      case '-o':
        options.outputDir = value;
        i++;
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
      default:
        console.error(`Unknown option: ${arg}`);
        printHelp();
        process.exit(1);
    }
  }

  return options;
}

function printHelp(): void {
  console.log(`
Template Renderer - Preview rendered test templates

Usage:
  npm run render-templates [options]

Options:
  -p, --platform <js|py>      Only render for specific platform
  -f, --framework <name>      Only render for specific framework
  -t, --test <name>          Only render specific test
  -o, --output <dir>         Output directory (default: .preview)
  -h, --help                 Show this help

Examples:
  npm run render-templates
  npm run render-templates -- --platform py
  npm run render-templates -- --framework openai
  npm run render-templates -- --test "Basic LLM Test"
  npm run render-templates -- --platform py --framework openai --test "Basic LLM Test"

Output:
  Templates are rendered to .preview/ directory for preview purposes.
  Actual test execution renders directly to runs/ directory.
  Each file is named: {framework}-{test-name}.{js|py}
  `);
}

// Main execution
const options = parseArgs();
renderTemplates(options).catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
