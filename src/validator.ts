/**
 * Validator - runs test assertions on captured spans
 */

import {
  CapturedSpan,
  TestDefinition,
  FrameworkConfig,
  CheckResult,
  Check,
  ErrorLocation,
} from "./types.js";

/**
 * Custom error that carries check results
 */
export class ValidationError extends Error {
  constructor(
    message: string,
    public checkResults: CheckResult[],
  ) {
    super(message);
    this.name = "ValidationError";
  }
}

/**
 * Custom error for skipping checks dynamically
 * Thrown by skip() and skipIf() helpers in test utilities
 */
export class SkipCheckError extends Error {
  constructor(public reason: string) {
    super(reason);
    this.name = "SkipCheckError";
  }
}

/**
 * Custom error thrown by check functions to report failures with location info.
 * Carries ErrorLocation[] so the validator and reporters can pinpoint the exact
 * span and attribute that caused the failure.
 */
export class CheckError extends Error {
  public locations: ErrorLocation[];

  constructor(message: string, locations: ErrorLocation[] = []) {
    super(message);
    this.name = "CheckError";
    this.locations = locations;
  }
}

export class Validator {
  private verbose: boolean = false;

  setVerbose(verbose: boolean): void {
    this.verbose = verbose;
  }

  /**
   * Run validation checks on captured spans
   * Uses the checks array from the test definition
   * Returns check results for detailed reporting
   */
  async validate(
    spans: CapturedSpan[],
    testDefinition: TestDefinition,
    frameworkConfig: FrameworkConfig,
    onCheckStart?: (checkName: string) => void,
    onCheckResult?: (result: CheckResult) => void,
  ): Promise<CheckResult[]> {
    const checkResults: CheckResult[] = [];
    const errors: Error[] = [];

    // Get checks array from test definition
    const checks: Check[] = testDefinition.checks || [];

    if (checks.length === 0) {
      if (this.verbose) {
        console.log("  No checks defined for this test");
      }
      return checkResults;
    }

    // Get test name for skip lookup
    const testName = testDefinition.name;
    const skippedChecks = frameworkConfig.skip?.checks?.[testName] || [];

    // Run all checks
    for (const check of checks) {
      const checkName = check.name;

      // Notify that check is starting
      onCheckStart?.(checkName);

      // Check if this check is skipped for this framework
      if (skippedChecks.includes(checkName)) {
        const result: CheckResult = {
          name: checkName,
          status: "skipped",
          skipReason: "Not supported by this framework",
        };
        checkResults.push(result);
        onCheckResult?.(result);
        if (this.verbose) {
          console.log(`  ⊘ ${checkName} skipped (not supported)`);
        }
        continue;
      }

      try {
        await check.fn(spans, frameworkConfig, testDefinition);
        const result: CheckResult = { name: checkName, status: "passed" };
        checkResults.push(result);
        onCheckResult?.(result);
        if (this.verbose) {
          console.log(`  ✓ ${checkName} passed`);
        }
      } catch (error) {
        // Handle dynamic skip from within the check
        if (error instanceof SkipCheckError) {
          const result: CheckResult = {
            name: checkName,
            status: "skipped",
            skipReason: error.reason,
          };
          checkResults.push(result);
          onCheckResult?.(result);
          if (this.verbose) {
            console.log(`  ⊘ ${checkName} skipped: ${error.reason}`);
          }
          continue;
        }

        // Handle regular failures
        const errorMsg = error instanceof Error ? error.message : String(error);
        const errorLocations: ErrorLocation[] =
          error instanceof CheckError ? error.locations : [];
        const result: CheckResult = {
          name: checkName,
          status: "failed",
          error: errorMsg,
          ...(errorLocations.length > 0 && { errorLocations }),
        };
        checkResults.push(result);
        onCheckResult?.(result);
        if (this.verbose) {
          console.error(`  ✗ ${checkName} failed: ${errorMsg}`);
          if (errorLocations.length > 0) {
            for (const loc of errorLocations) {
              const spanRef = `span ${loc.spanId.substring(0, 8)}`;
              const attrRef = loc.attribute ? ` attr="${loc.attribute}"` : "";
              console.error(`    → ${spanRef}${attrRef}: ${loc.message}`);
            }
          }
        }
        errors.push(error instanceof Error ? error : new Error(errorMsg));
      }
    }

    // If any check failed, throw combined error with check results
    if (errors.length > 0) {
      const errorMessages = errors.map((e) => e.message).join("\n");
      throw new ValidationError(
        `${errors.length} check(s) failed:\n${errorMessages}`,
        checkResults,
      );
    }

    return checkResults;
  }
}
