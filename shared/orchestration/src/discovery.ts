/**
 * Test discovery logic - finds SDKs and test cases
 */

import { glob } from 'glob';
import { basename, dirname, join, relative } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, readFileSync } from 'fs';
import type { SDK, TestCase, SDKConfig } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Root directory of the repository
export const REPO_ROOT = join(__dirname, '../../..');

/**
 * Load SDK config.json if it exists
 */
function loadSDKConfig(absolutePath: string): SDKConfig | undefined {
  const configPath = join(absolutePath, 'config.json');

  if (!existsSync(configPath)) {
    return undefined;
  }

  try {
    const content = readFileSync(configPath, 'utf-8');
    return JSON.parse(content) as SDKConfig;
  } catch (error) {
    console.warn(`Warning: Failed to load SDK config at ${configPath}:`, error);
    return undefined;
  }
}

/**
 * Discovers all SDKs and their test cases
 */
export async function discoverSDKs(): Promise<SDK[]> {
  const sdks: SDK[] = [];

  // Find all case files in sdks/
  const casePattern = join(REPO_ROOT, 'sdks/*/*/cases/*.{ts,js,py}');
  const caseFiles = await glob(casePattern);

  // Group by SDK
  const sdkMap = new Map<string, { files: string[], language: 'js' | 'py', name: string, absolutePath: string }>();

  for (const caseFile of caseFiles) {
    const rel = relative(join(REPO_ROOT, 'sdks'), caseFile);
    const parts = rel.split('/');

    if (parts.length < 4) continue; // Should be: language/sdk-name/cases/case-file

    const language = parts[0] as 'js' | 'py';
    const sdkName = parts[1];
    const sdkPath = `${language}/${sdkName}`;
    const absolutePath = join(REPO_ROOT, 'sdks', language, sdkName);

    if (!sdkMap.has(sdkPath)) {
      sdkMap.set(sdkPath, {
        files: [],
        language,
        name: sdkName,
        absolutePath
      });
    }

    sdkMap.get(sdkPath)!.files.push(caseFile);
  }

  // Convert to SDK objects
  for (const [sdkPath, data] of sdkMap) {
    const cases: TestCase[] = data.files.map(filePath => {
      const fileName = basename(filePath);
      const caseId = fileName.replace(/\.(ts|js|py)$/, '');

      return {
        id: caseId,
        filePath,
        sdkPath
      };
    });

    // Check if setup file exists
    const setupExtensions = data.language === 'js' ? ['.ts', '.js'] : ['.py'];
    const hasSetup = setupExtensions.some(ext =>
      existsSync(join(data.absolutePath, `setup${ext}`))
    );

    // Load SDK config if it exists
    const config = loadSDKConfig(data.absolutePath);

    sdks.push({
      language: data.language,
      name: data.name,
      path: sdkPath,
      absolutePath: data.absolutePath,
      cases: cases.sort((a, b) => a.id.localeCompare(b.id)),
      hasSetup,
      config
    });
  }

  return sdks.sort((a, b) => a.path.localeCompare(b.path));
}

/**
 * Filter SDKs based on options
 */
export function filterSDKs(sdks: SDK[], options: { filter?: string, case?: string }): SDK[] {
  let filtered = sdks;

  // Filter by SDK filter (positional argument)
  if (options.filter) {
    const filterValue = options.filter;

    // Check if it's a language-only filter (e.g., "js" or "py")
    if (filterValue === 'js' || filterValue === 'py') {
      filtered = filtered.filter(sdk => sdk.language === filterValue);
    }
    // Check if it's an exact path match (e.g., "js/openai")
    else if (filterValue.includes('/')) {
      filtered = filtered.filter(sdk => sdk.path === filterValue);
    }
    // Otherwise, filter by SDK name (partial match across both languages)
    // e.g., "lang" matches "langchain" and "langgraph" in both js and py
    // e.g., "langchain" matches "js/langchain" and "py/langchain"
    // e.g., "pydantic-ai" matches only "py/pydantic-ai"
    else {
      filtered = filtered.filter(sdk => sdk.name.includes(filterValue));
    }
  }

  // Filter by case
  if (options.case) {
    filtered = filtered.map(sdk => ({
      ...sdk,
      cases: sdk.cases.filter(c => c.id === options.case)
    })).filter(sdk => sdk.cases.length > 0);
  }

  return filtered;
}

/**
 * Load lifecycle hooks from setup file
 */
export async function loadSetupHooks(sdkPath: string): Promise<any> {
  const setupExtensions = sdkPath.startsWith('js/') ? ['.ts', '.js'] : ['.py'];

  for (const ext of setupExtensions) {
    const setupFile = join(REPO_ROOT, 'sdks', sdkPath, `setup${ext}`);

    if (existsSync(setupFile)) {
      // For JS/TS, we can import directly
      if (ext === '.ts' || ext === '.js') {
        const fileUrl = `file://${setupFile}`;
        return await import(fileUrl);
      }
      // For Python, we'd need to use a different approach (spawn python process)
      // This will be handled by the runner
      return { __pythonSetup: setupFile };
    }
  }

  return {};
}
