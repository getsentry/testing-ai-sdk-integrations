/**
 * Validator - runs test assertions on captured spans
 */

import { CapturedSpan, TestDefinition } from './types.js';

export class Validator {
  /**
   * Run validation checks on captured spans
   * Supports both legacy single checks function and new multiple check methods
   */
  async validate(
    spans: CapturedSpan[],
    testDefinition: TestDefinition | ((spans: CapturedSpan[]) => void | Promise<void>)
  ): Promise<void> {
    const errors: Error[] = [];

    // Legacy mode: single checks function
    if (typeof testDefinition === 'function') {
      try {
        await testDefinition(spans);
      } catch (error) {
        if (error instanceof Error) {
          throw new Error(`Validation failed: ${error.message}`);
        }
        throw error;
      }
      return;
    }

    // New mode: run all methods starting with "check"
    const checkMethods = Object.keys(testDefinition)
      .filter(key => key.startsWith('check') && typeof testDefinition[key] === 'function')
      .sort(); // Sort for consistent execution order

    if (checkMethods.length === 0 && testDefinition.checks) {
      // Fallback to legacy checks if no check methods found
      try {
        await testDefinition.checks(spans);
      } catch (error) {
        if (error instanceof Error) {
          throw new Error(`Validation failed: ${error.message}`);
        }
        throw error;
      }
      return;
    }

    // Run all check methods
    for (const methodName of checkMethods) {
      try {
        await testDefinition[methodName](spans);
        console.log(`  ✓ ${methodName} passed`);
      } catch (error) {
        if (error instanceof Error) {
          console.error(`  ✗ ${methodName} failed: ${error.message}`);
          errors.push(error);
        } else {
          console.error(`  ✗ ${methodName} failed: ${String(error)}`);
          errors.push(new Error(String(error)));
        }
      }
    }

    // If any check failed, throw combined error
    if (errors.length > 0) {
      const errorMessages = errors.map(e => e.message).join('\n');
      throw new Error(`${errors.length} check(s) failed:\n${errorMessages}`);
    }
  }
}
