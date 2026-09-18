/**
 * HTTP server that collects Sentry spans from assessment variants
 */

import { Hono, type Context } from "hono";
import { serve } from "@hono/node-server";
import { parseEnvelope } from "./envelope-parser.js";
import { SpanStore } from "./store.js";
import type { CapturedSpan, RuntimeFailure } from "../assessment/types.js";
import * as zlib from "node:zlib";
import { promisify } from "node:util";

const gunzip = promisify(zlib.gunzip);

export class SpanCollector {
	private app: Hono;
	private server: ReturnType<typeof serve> | null = null;
	private store: SpanStore;
	private readonly failures = new Map<string, RuntimeFailure[]>();
	private port: number = 0;
	private host: string = "127.0.0.1";
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

		// Health check endpoint
		app.get("/health", (c) => {
			return c.json({ status: "ok" });
		});

		// Sentry envelope endpoint - matches standard Sentry DSN format
		// Both /api/{projectId}/envelope/ and /{projectId}/envelope are supported
		app.post("/api/:projectId/envelope/", (context) =>
			this.handleEnvelope(context),
		);

		app.post("/:projectId/envelope/", (context) =>
			this.handleEnvelope(context),
		);

		return app;
	}

	/**
	 * Handle Sentry envelope submission
	 */
	private async handleEnvelope(context: Context): Promise<Response> {
		let runId: string | undefined;
		try {
			const projectIdValue = context.req.param("projectId");
			if (!projectIdValue) {
				return context.json({ error: "Missing project ID" }, 400);
			}
			const projectId = Number.parseInt(projectIdValue, 10);

			// Look up runId from projectId
			runId = this.projectIdToRunId.get(projectId);
			if (!runId) {
				return context.json({ status: "ok" });
			}

			const contentEncoding = context.req.header("content-encoding");

			// Get raw body as buffer
			const arrayBuffer = await context.req.arrayBuffer();
			let body: string;

			// Handle gzip compression
			if (contentEncoding === "gzip") {
				try {
					const buffer = Buffer.from(arrayBuffer);
					const decompressed = await gunzip(buffer);
					body = decompressed.toString("utf-8");
				} catch {
					body = Buffer.from(arrayBuffer).toString("utf-8");
				}
			} else {
				body = Buffer.from(arrayBuffer).toString("utf-8");
			}

			// Parse envelope and extract spans
			const parsed = parseEnvelope(body);
			for (const message of parsed.failures) {
				this.recordFailure(runId, message);
			}

			// Store spans
			if (parsed.spans.length > 0) {
				this.store.addSpans(runId, parsed.spans);
			}

			return context.json({ status: "ok" });
		} catch (error) {
			if (runId) {
				const message = error instanceof Error ? error.message : String(error);
				this.recordFailure(
					runId,
					`Failed to handle Sentry envelope: ${message}`,
				);
			}
			return context.json({ error: "Failed to process envelope" }, 500);
		}
	}

	private recordFailure(runId: string, message: string): void {
		const failures = this.failures.get(runId) ?? [];
		if (failures.some((failure) => failure.message === message)) return;
		failures.push({ kind: "collector", message, stopsVariant: true });
		this.failures.set(runId, failures);
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
				},
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
	 * Register an assessment variant
	 */
	registerRun(runId: string): void {
		this.store.registerRun(runId);
		this.failures.set(runId, []);
	}

	/**
	 * Get the collector DSN for an assessment variant
	 *
	 * Returns a Sentry DSN in the format: http://public@host:port/projectId
	 * The runId is encoded in the project ID field (using a hash to make it numeric)
	 */
	getDsn(runId: string): string {
		// Generate a numeric project ID from runId
		// Use a simple hash to convert runId to a number
		let hash = 0;
		for (let i = 0; i < runId.length; i++) {
			hash = (hash << 5) - hash + runId.charCodeAt(i);
			hash = hash & hash; // Convert to 32-bit integer
		}
		const projectId = Math.abs(hash);

		// Store mapping of projectId -> runId for later lookup
		this.projectIdToRunId.set(projectId, runId);

		return `http://public@${this.host}:${this.port}/${projectId}`;
	}

	/**
	 * Get captured spans for an assessment variant
	 */
	getSpans(runId: string): CapturedSpan[] {
		return this.store.getSpans(runId);
	}

	getFailures(runId: string): RuntimeFailure[] {
		return [...(this.failures.get(runId) ?? [])];
	}
}
