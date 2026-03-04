/**
 * HTTP server that collects Sentry spans from test runs
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serve } from '@hono/node-server';
import { SpanStore } from './store.js';
import { CapturedSpan } from '../types.js';
import * as zlib from 'zlib';
import { promisify } from 'util';

const gunzip = promisify(zlib.gunzip);

export class SpanCollector {
  private app: Hono;
  private server: ReturnType<typeof serve> | null = null;
  private store: SpanStore;
  private port: number = 0;
  private host: string = 'localhost';
  private projectIdToRunId: Map<number, string> = new Map();

  constructor(port: number = 0) {
    this.port = port; // 0 = random available port
    this.store = new SpanStore();
    this.app = this.createApp();
  }

  /**
   * Create Hono app with routes
   */
  private createApp(): Hono {
    const app = new Hono();

    // Enable CORS for browser tests (Playwright, Vite)
    app.use('/*', cors());

    // Health check endpoint
    app.get('/health', (c) => {
      return c.json({ status: 'ok' });
    });

    // Sentry envelope endpoint - matches standard Sentry DSN format
    // Both /api/{projectId}/envelope/ and /{projectId}/envelope are supported
    app.post('/api/:projectId/envelope/', async (c) => {
      return this.handleEnvelope(c);
    });
    
    app.post('/:projectId/envelope/', async (c) => {
      return this.handleEnvelope(c);
    });

    return app;
  }

  /**
   * Handle Sentry envelope submission
   */
  private async handleEnvelope(c: any): Promise<Response> {
    try {
      const projectIdStr = c.req.param('projectId');
      const projectId = parseInt(projectIdStr, 10);
      
      // Look up runId from projectId
      const runId = this.projectIdToRunId.get(projectId);
      if (!runId) {
        console.warn(`Received envelope for unknown projectId: ${projectId}`);
        // Accept it anyway to avoid breaking the SDK
        return c.json({ status: 'ok' });
      }
      
      const contentEncoding = c.req.header('content-encoding');
      
      // Get raw body as buffer
      const arrayBuffer = await c.req.arrayBuffer();
      let body: string;

      // Handle gzip compression
      if (contentEncoding === 'gzip') {
        try {
          const buffer = Buffer.from(arrayBuffer);
          const decompressed = await gunzip(buffer);
          body = decompressed.toString('utf-8');
        } catch (gzipError) {
          // If decompression fails, try as plain text
          console.warn('Failed to decompress gzip, trying as plain text');
          body = Buffer.from(arrayBuffer).toString('utf-8');
        }
      } else {
        body = Buffer.from(arrayBuffer).toString('utf-8');
      }

      // Parse envelope and extract spans
      const spans = this.parseEnvelope(body);

      // Store spans
      if (spans.length > 0) {
        this.store.addSpans(runId, spans);
      }

      return c.json({ status: 'ok' });
    } catch (error) {
      console.error('Error handling envelope:', error);
      return c.json({ error: 'Failed to process envelope' }, 500);
    }
  }

  /**
   * Parse Sentry envelope format
   */
  private parseEnvelope(body: string): CapturedSpan[] {
    const lines = body.trim().split('\n');
    const spans: CapturedSpan[] = [];

    // Envelope format: header line, then item header + item body pairs
    for (let i = 1; i < lines.length; i += 2) {
      try {
        const itemHeader = JSON.parse(lines[i]);
        const itemBody = JSON.parse(lines[i + 1]);

        if (itemHeader.type === 'transaction' || itemHeader.type === 'span') {
          // Transaction contains child spans
          if (itemBody.spans) {
            spans.push(...itemBody.spans);
          }
          // The transaction itself is also a span
          if (itemBody.span_id) {
            spans.push(itemBody);
          } else if (itemBody.contexts?.trace?.span_id) {
            // Sentry JS SDK v10 sends some transactions (e.g. MCP spans) with
            // span_id nested in contexts.trace instead of at the root level.
            // Extract a CapturedSpan from the transaction + contexts.trace.
            const trace = itemBody.contexts.trace;
            spans.push({
              span_id: trace.span_id,
              trace_id: trace.trace_id,
              parent_span_id: trace.parent_span_id,
              op: trace.op || itemBody.op,
              description: itemBody.transaction || trace.description,
              start_timestamp: itemBody.start_timestamp,
              timestamp: itemBody.timestamp,
              data: trace.data || {},
              status: trace.status,
            });
          }
        }
      } catch (error) {
        console.warn('Failed to parse envelope item:', error);
      }
    }

    return spans;
  }

  /**
   * Start the HTTP server
   */
  async start(): Promise<void> {
    return new Promise((resolve) => {
      this.server = serve(
        {
          fetch: this.app.fetch,
          port: this.port,
          hostname: this.host,
        },
        (info) => {
          this.port = info.port;
          resolve();
        }
      );
    });
  }

  /**
   * Stop the HTTP server
   */
  async stop(): Promise<void> {
    if (this.server) {
      this.server.close();
      this.server = null;
    }
  }

  /**
   * Register a test run
   */
  registerRun(runId: string): void {
    this.store.registerRun(runId);
  }

  /**
   * Get DSN for a test run
   * 
   * Returns a Sentry DSN in the format: http://public@host:port/projectId
   * The runId is encoded in the project ID field (using a hash to make it numeric)
   */
  getDsn(runId: string): string {
    // Generate a numeric project ID from runId
    // Use a simple hash to convert runId to a number
    let hash = 0;
    for (let i = 0; i < runId.length; i++) {
      hash = ((hash << 5) - hash) + runId.charCodeAt(i);
      hash = hash & hash; // Convert to 32-bit integer
    }
    const projectId = Math.abs(hash);
    
    // Store mapping of projectId -> runId for later lookup
    this.projectIdToRunId.set(projectId, runId);
    
    return `http://public@${this.host}:${this.port}/${projectId}`;
  }

  /**
   * Get captured spans for a test run
   */
  getSpans(runId: string): CapturedSpan[] {
    return this.store.getSpans(runId);
  }

  /**
   * Clear spans for a test run
   */
  clearRun(runId: string): void {
    this.store.clearRun(runId);
  }

  /**
   * Get server port
   */
  getPort(): number {
    return this.port;
  }
}
