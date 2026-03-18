/**
 * Shared port allocator for test runners.
 * Assigns unique ports to avoid collisions when running tests in parallel.
 */

let nextPort = 10000 + Math.floor(Math.random() * 40000);

export function allocatePort(): number {
  return nextPort++;
}
