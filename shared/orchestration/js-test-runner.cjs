#!/usr/bin/env node
/**
 * JavaScript Test Runner Wrapper
 *
 * This script runs a single JavaScript SDK test in isolation.
 * It's invoked as a subprocess by the orchestration CLI to ensure
 * complete isolation between SDKs (Sentry SDK state doesn't leak).
 *
 * Usage: node js-test-runner.js <sdk-dir> <test-file-path>
 */

const { resolve, dirname } = require('path');

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.error('Usage: node js-test-runner.js <sdk-dir> <test-file-path>');
    process.exit(1);
  }

  const sdkDir = resolve(args[0]);
  const testFilePath = resolve(args[1]);

  try {
    // Import setup module
    const setupPath = resolve(sdkDir, 'setup.js');
    const setup = require(setupPath);

    // Run beforeAll hook
    if (setup.beforeAll) {
      await setup.beforeAll();
    }

    // Run beforeEach hook
    if (setup.beforeEach) {
      await setup.beforeEach();
    }

    // Import and run test
    const testModule = require(testFilePath);
    if (typeof testModule === 'function') {
      await testModule();
    } else {
      throw new Error('Test case does not export a function');
    }

    // Run afterEach hook
    if (setup.afterEach) {
      await setup.afterEach();
    }

    // Run afterAll hook
    if (setup.afterAll) {
      await setup.afterAll();
    }

    process.exit(0);
  } catch (error) {
    console.error(`✗ Test failed: ${error.message}`);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

main();
