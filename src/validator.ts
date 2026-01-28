/**
 * Validator - runs test assertions on captured spans
 */

import { CapturedSpan, TestDefinition, FrameworkConfig, CheckResult } from './types.js';

/**
 * Custom error that carries check results
 */
export class ValidationError extends Error {
  constructor(message: string, public checkResults: CheckResult[]) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * Custom error for skipping checks dynamically
 * Thrown by skip() and skipIf() helpers in test utilities
 */
export class SkipCheckError extends Error {
  constructor(public reason: string) {
    super(reason);
    this.name = 'SkipCheckError';
  }
}

export class Validator {
  /**
   * Run validation checks on captured spans
   * Supports both legacy single checks function and new multiple check methods
   * Returns check results for detailed reporting
   */
  async validate(
    spans: CapturedSpan[],
    testDefinition: TestDefinition | ((spans: CapturedSpan[]) => void | Promise<void>),
    frameworkConfig: FrameworkConfig,
    onCheckStart?: (checkName: string) => void,
    onCheckResult?: (result: CheckResult) => void
  ): Promise<CheckResult[]> {
    const checkResults: CheckResult[] = [];
    const errors: Error[] = [];

    // Legacy mode: single checks function
    if (typeof testDefinition === 'function') {
      try {
        await testDefinition(spans);
        checkResults.push({ name: 'checks', status: 'passed' });
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        checkResults.push({ name: 'checks', status: 'failed', error: errorMsg });
        throw new ValidationError(`Validation failed: ${errorMsg}`, checkResults);
      }
      return checkResults;
    }

    // New mode: run all methods starting with "check"
    const checkMethods = Object.keys(testDefinition)
      .filter(key => key.startsWith('check') && typeof testDefinition[key] === 'function')
      .sort(); // Sort for consistent execution order

    if (checkMethods.length === 0 && testDefinition.checks) {
      // Fallback to legacy checks if no check methods found
      try {
        await testDefinition.checks(spans);
        checkResults.push({ name: 'checks', status: 'passed' });
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        checkResults.push({ name: 'checks', status: 'failed', error: errorMsg });
        throw new ValidationError(`Validation failed: ${errorMsg}`, checkResults);
      }
      return checkResults;
    }

    // Get test name for skip lookup
    const testName = testDefinition.name;
    const skippedChecks = frameworkConfig.skip?.checks?.[testName] || [];

    // Run all check methods
    for (const methodName of checkMethods) {
      // Notify that check is starting
      onCheckStart?.(methodName);
      
      // Check if this check is skipped for this framework
      if (skippedChecks.includes(methodName)) {
        const result: CheckResult = { 
          name: methodName, 
          status: 'skipped', 
          skipReason: 'Not supported by this framework'
        };
        checkResults.push(result);
        onCheckResult?.(result);
        console.log(`  ⊘ ${methodName} skipped (not supported)`);
        continue;
      }

      try {
        await testDefinition[methodName](spans, frameworkConfig);
        const result: CheckResult = { name: methodName, status: 'passed' };
        checkResults.push(result);
        onCheckResult?.(result);
        console.log(`  ✓ ${methodName} passed`);
      } catch (error) {
        // Handle dynamic skip from within the check
        if (error instanceof SkipCheckError) {
          const result: CheckResult = { 
            name: methodName, 
            status: 'skipped', 
            skipReason: error.reason
          };
          checkResults.push(result);
          onCheckResult?.(result);
          console.log(`  ⊘ ${methodName} skipped: ${error.reason}`);
          continue;
        }
        
        // Handle regular failures
        const errorMsg = error instanceof Error ? error.message : String(error);
        const result: CheckResult = { name: methodName, status: 'failed', error: errorMsg };
        checkResults.push(result);
        onCheckResult?.(result);
        console.error(`  ✗ ${methodName} failed: ${errorMsg}`);
        errors.push(error instanceof Error ? error : new Error(errorMsg));
      }
    }

    // If any check failed, throw combined error with check results
    if (errors.length > 0) {
      const errorMessages = errors.map(e => e.message).join('\n');
      throw new ValidationError(`${errors.length} check(s) failed:\n${errorMessages}`, checkResults);
    }
    
    return checkResults;
  }
}
