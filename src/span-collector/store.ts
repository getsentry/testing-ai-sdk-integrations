/**
 * In-memory storage for captured spans
 */

import { CapturedSpan } from '../types.js';

export class SpanStore {
  private spans: Map<string, CapturedSpan[]> = new Map();

  /**
   * Register a new test run
   */
  registerRun(runId: string): void {
    this.spans.set(runId, []);
  }

  /**
   * Add spans for a test run
   */
  addSpans(runId: string, spans: CapturedSpan[]): void {
    const existing = this.spans.get(runId) || [];
    this.spans.set(runId, [...existing, ...spans]);
  }

  /**
   * Get spans for a test run
   */
  getSpans(runId: string): CapturedSpan[] {
    return this.spans.get(runId) || [];
  }

  /**
   * Clear spans for a test run
   */
  clearRun(runId: string): void {
    this.spans.delete(runId);
  }

  /**
   * Get all run IDs
   */
  getRunIds(): string[] {
    return Array.from(this.spans.keys());
  }
}
