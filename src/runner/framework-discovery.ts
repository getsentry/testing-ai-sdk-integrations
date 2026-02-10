/**
 * Framework Discovery System
 *
 * Scans the templates directory and loads framework configurations.
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { FrameworkConfig } from "./framework-config.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TEMPLATES_DIR = path.join(__dirname, "templates");

/**
 * Framework metadata including template path
 */
export interface DiscoveredFramework extends FrameworkConfig {
  /** Path to template file */
  templatePath: string;

  /** Category (llm, agents, etc.) */
  category: string;
}

/**
 * Discover all frameworks by scanning templates directory
 *
 * Directory structure:
 *   templates/
 *     {category}/      # llm, agents, etc.
 *       {platform}/    # js, py
 *         {framework}/ # openai, anthropic, etc.
 *           config.json
 *           template.njk
 */
export function discoverFrameworks(): DiscoveredFramework[] {
  const frameworks: DiscoveredFramework[] = [];

  if (!fs.existsSync(TEMPLATES_DIR)) {
    throw new Error(`Templates directory not found: ${TEMPLATES_DIR}`);
  }

  // Scan categories (llm, agents, etc.)
  const categories = fs
    .readdirSync(TEMPLATES_DIR, { withFileTypes: true })
    .filter((dirent) => dirent.isDirectory() && !dirent.name.startsWith("."))
    .map((dirent) => dirent.name);

  for (const category of categories) {
    const categoryPath = path.join(TEMPLATES_DIR, category);

    // Scan platforms (node, py)
    const platforms = fs
      .readdirSync(categoryPath, { withFileTypes: true })
      .filter(
        (dirent) =>
          dirent.isDirectory() &&
          (dirent.name === "node" || dirent.name === "py"),
      )
      .map((dirent) => dirent.name);

    for (const platform of platforms) {
      const platformPath = path.join(categoryPath, platform);

      // Scan framework directories
      const frameworkDirs = fs
        .readdirSync(platformPath, { withFileTypes: true })
        .filter(
          (dirent) => dirent.isDirectory() && !dirent.name.startsWith("."),
        )
        .map((dirent) => dirent.name);

      for (const frameworkDir of frameworkDirs) {
        const frameworkPath = path.join(platformPath, frameworkDir);
        const configPath = path.join(frameworkPath, "config.json");
        const templatePath = path.join(frameworkPath, "template.njk");

        // Validate required files exist
        if (!fs.existsSync(configPath)) {
          console.warn(`Warning: Missing config.json in ${frameworkPath}`);
          continue;
        }

        if (!fs.existsSync(templatePath)) {
          console.warn(`Warning: Missing template.njk in ${frameworkPath}`);
          continue;
        }

        // Load and validate config
        try {
          const configContent = fs.readFileSync(configPath, "utf-8");
          const config = JSON.parse(configContent) as FrameworkConfig;

          // Validate required fields
          if (
            !config.name ||
            !config.displayName ||
            !config.type ||
            !config.platform
          ) {
            console.warn(
              `Warning: Invalid config in ${configPath} - missing required fields`,
            );
            continue;
          }

          // Validate required arrays
          if (!config.versions || config.versions.length === 0) {
            console.warn(
              `Warning: Invalid config in ${configPath} - missing or empty 'versions' array`,
            );
            continue;
          }
          if (!config.sentryVersions || config.sentryVersions.length === 0) {
            console.warn(
              `Warning: Invalid config in ${configPath} - missing or empty 'sentryVersions' array`,
            );
            continue;
          }

          // Validate platform matches directory structure
          if (config.platform !== platform) {
            console.warn(
              `Warning: Platform mismatch in ${configPath} - expected ${platform}, got ${config.platform}`,
            );
            continue;
          }

          // Add discovered framework
          frameworks.push({
            ...config,
            templatePath,
            category,
          });
        } catch (error) {
          console.warn(
            `Warning: Failed to load config from ${configPath}:`,
            error,
          );
          continue;
        }
      }
    }
  }

  return frameworks;
}

/**
 * Get frameworks by category (llm, agents, etc.)
 */
export function getFrameworksByCategory(
  category: string,
): DiscoveredFramework[] {
  return discoverFrameworks().filter((f) => f.category === category);
}

/**
 * Get frameworks by platform (node, py)
 */
export function getFrameworksByPlatform(
  platform: "node" | "py",
): DiscoveredFramework[] {
  return discoverFrameworks().filter((f) => f.platform === platform);
}

/**
 * Get frameworks by type (llm-only, agentic)
 */
export function getFrameworksByType(
  type: "llm-only" | "agentic",
): DiscoveredFramework[] {
  return discoverFrameworks().filter((f) => f.type === type);
}

/**
 * Get a specific framework by name
 */
export function getFrameworkByName(
  name: string,
): DiscoveredFramework | undefined {
  return discoverFrameworks().find((f) => f.name === name);
}

/**
 * List all available frameworks (for CLI display)
 */
export function listFrameworks(): void {
  const frameworks = discoverFrameworks();

  if (frameworks.length === 0) {
    console.log("No frameworks discovered.");
    return;
  }

  console.log(`\nDiscovered ${frameworks.length} framework(s):\n`);

  // Group by category
  const byCategory = frameworks.reduce(
    (acc, f) => {
      if (!acc[f.category]) acc[f.category] = [];
      acc[f.category].push(f);
      return acc;
    },
    {} as Record<string, DiscoveredFramework[]>,
  );

  for (const [category, categoryFrameworks] of Object.entries(byCategory)) {
    console.log(`${category.toUpperCase()}:`);

    for (const framework of categoryFrameworks) {
      const platformIcon = framework.platform === "py" ? "🐍" : "🟢";
      const typeIcon = framework.type === "agentic" ? "🤖" : "💬";

      console.log(`  ${platformIcon} ${typeIcon} ${framework.name}`);
      console.log(`     ${framework.displayName}`);
      console.log(`     Versions: ${framework.versions.join(", ")}`);
      console.log(`     Sentry: ${framework.sentryVersions.join(", ")}`);
      console.log();
    }
  }
}
