/**
 * Platform-specific utilities
 * Centralizes all platform checks to avoid growing ternaries
 */

import { FrameworkConfig } from "./types.js";

export type Platform = "node" | "python" | "browser" | "nextjs" | "php" | "cloudflare";

/** Platforms considered JavaScript-based (matched by the "js" meta-platform filter) */
export const JS_PLATFORMS: readonly Platform[] = ["node", "browser", "cloudflare"] as const;

/**
 * Resolve a CLI platform value to the concrete platform(s) it represents.
 * "js" is a meta-platform that expands to all JS-based platforms (node, browser, …).
 */
export function resolvePlatformFilter(value: string): Platform[] {
  if (value === "js") {
    return [...JS_PLATFORMS];
  }
  return [value as Platform];
}

/**
 * Get the file extension for generated test files.
 * Next.js tests run in Node.js, so they use .js like node.
 */
export function getFileExtension(platform: Platform): string {
  switch (platform) {
    case "python":
      return "py";
    case "php":
      return "php";
    case "browser":
      return "html";
    case "node":
    case "nextjs":
    case "cloudflare":
      return "js";
    default:
      return "js";
  }
}

/**
 * Get the platform icon/emoji for display
 */
export function getPlatformIcon(platform: Platform): string {
  switch (platform) {
    case "python":
      return "🐍";
    case "php":
      return "🐘";
    case "browser":
      return "🌐";
    case "node":
      return "🟢";
    case "nextjs":
      return "➡️";
    case "cloudflare":
      return "☁️";
  }
}

/**
 * Get the platform display name
 */
export function getPlatformDisplayName(platform: Platform): string {
  switch (platform) {
    case "python":
      return "PYTHON";
    case "php":
      return "PHP";
    case "browser":
      return "BROWSER";
    case "node":
      return "NODE";
    case "nextjs":
      return "NEXT.JS";
    case "cloudflare":
      return "CLOUDFLARE";
  }
}

/**
 * Check if platform supports execution modes (sync/async)
 */
export function supportsExecutionModes(platform: Platform): boolean {
  return platform === "python";
}

/**
 * Check if platform supports a given execution mode
 */
export function supportsExecutionMode(
  platform: Platform,
  mode: "sync" | "async" | undefined,
): boolean {
  if (!supportsExecutionModes(platform)) {
    return mode === undefined;
  }
  return mode !== undefined;
}

/**
 * Get the local Sentry SDK path environment variable for a platform
 */
export function getLocalSentryEnvVar(platform: Platform): string | null {
  switch (platform) {
    case "python":
      return "SENTRY_PYTHON_PATH";
    case "php":
      return "SENTRY_LARAVEL_PATH";
    case "node":
    case "browser":
    case "nextjs":
    case "cloudflare":
      return "SENTRY_JAVASCRIPT_PATH";
  }
}

/**
 * Get the Sentry package name for a platform
 */
export function getSentryPackageName(platform: Platform): string {
  switch (platform) {
    case "python":
      return "sentry-sdk";
    case "php":
      return "sentry/sentry-laravel";
    case "browser":
      return "@sentry/browser";
    case "node":
      return "@sentry/node";
    case "nextjs":
      return "@sentry/nextjs";
    case "cloudflare":
      return "@sentry/cloudflare";
  }
}

/**
 * Get the base template name for a platform
 */
export function getBaseTemplateName(platform: Platform): string {
  switch (platform) {
    case "php":
      return "base.php.njk";
    case "python":
      return "base.python.njk";
    case "browser":
      return "base.browser.njk";
    case "node":
      return "base.node.njk";
    case "nextjs":
      return "base.nextjs.njk";
    case "cloudflare":
      return "base.cloudflare.njk";
  }
}

/**
 * Get the formatter parser name for a platform.
 * Returns a Prettier parser name, "black" for Python CLI formatting, or null to skip formatting.
 */
export function getFormatterParser(platform: Platform): string | null {
  switch (platform) {
    case "python":
      return "black"; // Uses black CLI
    case "php":
      return null; // No formatter for PHP templates
    case "browser":
      return "html";
    case "node":
      return "babel";
    case "nextjs":
      return "babel";
    case "cloudflare":
      return "babel";
  }
}

/**
 * Check if framework needs async flag
 */
export function needsAsyncFlag(framework: FrameworkConfig): boolean {
  return framework.platform === "python" && framework.executionMode === "async";
}

/**
 * Determine sentry version based on platform and local SDK paths
 */
export function determineSentryVersion(
  framework: FrameworkConfig,
  sentryPythonPath?: string,
  sentryJavaScriptPath?: string,
): string {
  const defaultVersion = framework.sentryVersion || "latest";

  if (framework.platform === "python" && sentryPythonPath) {
    return "local";
  }

  if (framework.platform === "php") {
    // PHP local SDK is handled via composer path repository in the runner
    return defaultVersion;
  }

  if (
    (framework.platform === "node" ||
      framework.platform === "browser" ||
      framework.platform === "nextjs" ||
      framework.platform === "cloudflare") &&
    sentryJavaScriptPath
  ) {
    return "local";
  }

  return defaultVersion;
}

/**
 * Build mode parts array for filename/display
 */
export function buildModeParts(
  framework: FrameworkConfig,
  isAsync?: boolean,
  isStreaming?: boolean,
  resolvedOptions?: Record<string, string>,
): string[] {
  const parts: string[] = [];

  // Add execution mode for Python
  if (framework.platform === "python") {
    parts.push(isAsync ? "async" : "sync");
  }

  // Add streaming mode if applicable
  if (framework.streamingMode && isStreaming !== undefined) {
    parts.push(isStreaming ? "streaming" : "blocking");
  }

  // Add resolved options (sorted by key for consistent ordering)
  if (resolvedOptions) {
    for (const key of Object.keys(resolvedOptions).sort()) {
      parts.push(resolvedOptions[key]);
    }
  }

  return parts;
}

/**
 * Build mode suffix for filenames
 */
export function buildModeSuffix(
  framework: FrameworkConfig,
  isAsync?: boolean,
  isStreaming?: boolean,
  resolvedOptions?: Record<string, string>,
): string {
  const parts = buildModeParts(framework, isAsync, isStreaming, resolvedOptions);
  return parts.length > 0 ? `-${parts.join("-")}` : "";
}
