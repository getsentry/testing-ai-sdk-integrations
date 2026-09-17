/**
 * Shared port allocator for assessment runners.
 * Assigns unique ports to avoid collisions when running variants in parallel.
 *
 * Probes each candidate port with a temporary TCP server to ensure it is
 * actually free before handing it out.
 */

import * as net from "node:net";

// Stay below the ephemeral outbound port ranges used by Linux and macOS.
let nextPort = 10000 + Math.floor(Math.random() * 10000);

/**
 * Check whether a port is available by briefly binding to it.
 * Checks IPv4 availability; Wrangler startup recovery handles binding races.
 */
function isPortFree(port: number): Promise<boolean> {
	return new Promise((resolve) => {
		const server = net.createServer();
		server.unref();
		server.on("error", () => resolve(false));
		server.listen(port, "0.0.0.0", () => {
			server.close(() => resolve(true));
		});
	});
}

/**
 * Allocate a port that is confirmed free at the moment of allocation.
 * Tries up to 200 sequential candidates before giving up.
 */
export async function allocatePort(): Promise<number> {
	for (let attempts = 0; attempts < 200; attempts++) {
		const candidate = nextPort++;
		if (await isPortFree(candidate)) {
			return candidate;
		}
	}
	throw new Error("Failed to find a free port after 200 attempts");
}
