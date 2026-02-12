/**
 * Template renderer using Nunjucks
 */

import nunjucks from 'nunjucks';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { getBaseTemplateName } from '../platform-utils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface TemplateContext {
  testName: string;
  frameworkName: string;
  [key: string]: any;
}

export class TemplateRenderer {
  private env: nunjucks.Environment;
  private templatesDir: string;

  constructor() {
    this.templatesDir = path.join(__dirname, 'templates');
    
    // Configure Nunjucks
    this.env = nunjucks.configure(this.templatesDir, {
      autoescape: false, // Don't escape code
      trimBlocks: true,
      lstripBlocks: true,
    });
    
    // Add custom filters
    this.env.addFilter('tojson', (obj) => {
      return JSON.stringify(obj, null, 2);
    });
  }

  /**
   * Render a template
   * 
   * @param templatePath - Path relative to templates dir (e.g., 'llm/py/openai/template.njk')
   */
  render(templatePath: string, context: TemplateContext): string {
    return this.env.render(templatePath, context);
  }

  /**
   * Render a framework template
   *
   * @param type - 'llm' or 'agents'
   * @param platform - 'node', 'py', 'browser', or 'nextjs'
   * @param frameworkName - Framework name (e.g., 'openai')
   * @param context - Template context
   */
  renderFramework(
    type: 'llm' | 'agents',
    platform: 'node' | 'py' | 'browser' | 'nextjs',
    frameworkName: string,
    context: TemplateContext
  ): string {
    const templatePath = `${type}/${platform}/${frameworkName}/template.njk`;
    return this.render(templatePath, context);
  }

  /**
   * Render base template for a platform
   */
  renderBase(platform: 'node' | 'py' | 'browser' | 'nextjs', context: TemplateContext): string {
    const templateFile = getBaseTemplateName(platform);
    return this.render(templateFile, context);
  }

  /**
   * Render template string (for inline templates)
   */
  renderString(template: string, context: TemplateContext): string {
    return nunjucks.renderString(template, context);
  }

  /**
   * Extend a base template with custom blocks
   */
  renderWithBlocks(
    platform: 'node' | 'py' | 'browser' | 'nextjs',
    context: TemplateContext,
    blocks: {
      imports?: string;
      sdk_setup?: string;
      setup?: string;
      test?: string;
      teardown?: string;
    }
  ): string {
    // Build template that extends base
    const baseTemplate = getBaseTemplateName(platform);

    let template = `{% extends "${baseTemplate}" %}\n\n`;

    if (blocks.imports) {
      template += `{% block imports %}\n{{ super() }}\n${blocks.imports}\n{% endblock %}\n\n`;
    }

    if (blocks.sdk_setup) {
      template += `{% block sdk_setup %}\n${blocks.sdk_setup}\n{% endblock %}\n\n`;
    }

    if (blocks.setup) {
      template += `{% block setup %}\n${blocks.setup}\n{% endblock %}\n\n`;
    }

    if (blocks.test) {
      template += `{% block test %}\n${blocks.test}\n{% endblock %}\n\n`;
    }

    if (blocks.teardown) {
      template += `{% block teardown %}\n${blocks.teardown}\n{% endblock %}\n\n`;
    }

    return this.renderString(template, context);
  }
}
