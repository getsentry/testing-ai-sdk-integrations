import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import type { AssessmentPlatform } from "./types.js";

const execFileAsync = promisify(execFile);

const sentryPackages: Partial<Record<AssessmentPlatform, string>> = {
  node: "@sentry/node",
  nextjs: "@sentry/nextjs",
  cloudflare: "@sentry/cloudflare",
};

export async function resolveInstalledPackageVersion(
  workDir: string,
  platform: AssessmentPlatform,
  packageName: string,
): Promise<string | undefined> {
  if (platform === "python") {
    try {
      const pythonPath = path.join(workDir, ".venv", "bin", "python");
      const { stdout } = await execFileAsync(pythonPath, [
        "-c",
        `import importlib.metadata; print(importlib.metadata.version(${JSON.stringify(packageName)}))`,
      ]);
      return stdout.trim() || undefined;
    } catch {
      return undefined;
    }
  }

  try {
    const packageJsonPath = path.join(
      workDir,
      "node_modules",
      ...packageName.split("/"),
      "package.json",
    );
    const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8")) as {
      version?: unknown;
    };
    return typeof packageJson.version === "string"
      ? packageJson.version
      : undefined;
  } catch {
    return undefined;
  }
}

export async function resolveInstalledSentryVersion(
  workDir: string,
  platform: AssessmentPlatform,
): Promise<string | undefined> {
  const packageName =
    platform === "python" ? "sentry-sdk" : sentryPackages[platform];
  return packageName
    ? resolveInstalledPackageVersion(workDir, platform, packageName)
    : undefined;
}
