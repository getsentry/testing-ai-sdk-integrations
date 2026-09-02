import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { resolveInstalledPackageVersion } from "./installed-version.js";

test("resolves an installed framework package version", async () => {
	const workDir = await mkdtemp(path.join(os.tmpdir(), "installed-version-"));
	try {
		const packageDir = path.join(workDir, "node_modules", "@example", "sdk");
		await mkdir(packageDir, { recursive: true });
		await writeFile(
			path.join(packageDir, "package.json"),
			JSON.stringify({ version: "7.8.1" }),
			"utf8",
		);

		assert.equal(
			await resolveInstalledPackageVersion(workDir, "node", "@example/sdk"),
			"7.8.1",
		);
	} finally {
		await rm(workDir, { recursive: true, force: true });
	}
});
