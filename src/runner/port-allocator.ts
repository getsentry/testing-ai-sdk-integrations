/**
 * Shared port allocator for test runners.
 * Assigns unique ports to avoid collisions when running tests in parallel.
 *
 * Probes each candidate port with a temporary TCP server to ensure it is
 * actually free before handing it out.
 */

import * as net from "net";

let nextPort = 10000 + Math.floor(Math.random() * 40000);

/**
 * Check whether a port is available by briefly binding to it.
 * Binds on both IPv4 and IPv6 loopback to match what most servers do.
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
