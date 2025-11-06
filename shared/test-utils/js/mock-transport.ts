/**
 * Mock Sentry transport for testing
 *
 * Captures all Sentry events in memory instead of sending them to Sentry servers.
 * Provides helpers to query and verify captured events.
 */

import { createTransport } from "@sentry/core";
import type { Transport, Envelope, BaseTransportOptions } from "@sentry/core";

interface EnvelopeItem {
  headers: Record<string, any>;
  payload: string | Uint8Array;
}

class MockTransportCapture {
  private envelopes: Envelope[] = [];

  /**
   * Capture an envelope
   */
  capture(envelope: Envelope): void {
    this.envelopes.push(envelope);
  }

  /**
   * Clear all captured envelopes
   */
  clear(): void {
    this.envelopes = [];
  }

  /**
   * Get all captured envelopes
   */
  getEnvelopes(): Envelope[] {
    return this.envelopes;
  }

  /**
   * Parse envelope body string into header and items
   * Envelope format is newline-separated:
   * Line 1: Envelope headers (JSON)
   * Line 2: Item 1 headers (JSON)
   * Line 3: Item 1 payload (JSON)
   * Line 4: Item 2 headers (JSON)
   * Line 5: Item 2 payload (JSON)
   * etc.
   */
  private parseEnvelopeBody(body: string): {
    headers: any;
    items: Array<{ headers: any; payload: any }>;
  } {
    const lines = body.split("\n").filter((line) => line.trim());

    if (lines.length === 0) {
      return { headers: {}, items: [] };
    }

    // First line is envelope headers
    const headers = JSON.parse(lines[0]);
    const items: Array<{ headers: any; payload: any }> = [];

    // Remaining lines are pairs of item headers + item payload
    for (let i = 1; i < lines.length; i += 2) {
      if (i + 1 < lines.length) {
        const itemHeaders = JSON.parse(lines[i]);
        const itemPayload = JSON.parse(lines[i + 1]);
        items.push({ headers: itemHeaders, payload: itemPayload });
      }
    }

    return { headers, items };
  }

  /**
   * Get all captured transactions
   */
  getTransactions(): any[] {
    const transactions: any[] = [];

    for (const envelope of this.envelopes) {
      const body = (envelope as any).body;
      if (typeof body !== "string") continue;

      const parsed = this.parseEnvelopeBody(body);

      for (const item of parsed.items) {
        if (item.headers.type === "transaction") {
          transactions.push(item.payload);
        }
      }
    }

    return transactions;
  }

  /**
   * Get all captured spans (extracted from transactions)
   */
  getSpans(): any[] {
    const spans: any[] = [];

    for (const transaction of this.getTransactions()) {
      if (transaction.spans && Array.isArray(transaction.spans)) {
        spans.push(...transaction.spans);
      }
    }

    return spans;
  }

  /**
   * Get all captured events (errors, messages, etc.)
   */
  getEvents(): any[] {
    const events: any[] = [];

    for (const envelope of this.envelopes) {
      const body = (envelope as any).body;
      if (typeof body !== "string") continue;

      const parsed = this.parseEnvelopeBody(body);

      for (const item of parsed.items) {
        if (item.headers.type === "event") {
          events.push(item.payload);
        }
      }
    }

    return events;
  }
}

let mockTransportCapture: MockTransportCapture | null = null;

/**
 * Create a mock transport factory (to be passed to Sentry.init)
 */
export function createMockTransport(options: BaseTransportOptions): Transport {
  // Initialize capture instance
  mockTransportCapture = new MockTransportCapture();

  // Create transport using Sentry's createTransport helper
  return createTransport(options, (envelope: Envelope) => {
    // Capture the envelope
    if (mockTransportCapture) {
      mockTransportCapture.capture(envelope);
    }

    // Return success response
    return Promise.resolve({
      statusCode: 200,
      headers: {},
    });
  });
}

/**
 * Get the current mock transport capture instance
 */
export function getMockTransport(): MockTransportCapture {
  if (!mockTransportCapture) {
    throw new Error(
      "Mock transport not initialized. Did you call Sentry.init with createMockTransport?"
    );
  }
  return mockTransportCapture;
}

/**
 * Clear all captured events
 */
export function clearMockTransport(): void {
  if (mockTransportCapture) {
    mockTransportCapture.clear();
  }
}
