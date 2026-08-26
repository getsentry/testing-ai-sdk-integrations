import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import type { AttributeDefinition } from "./types.js";

let cachedAttributes: Map<string, AttributeDefinition> | undefined;

/** Load all GenAI attribute definitions from the sentry-conventions submodule. */
export function loadAllGenAIAttributes(): Map<string, AttributeDefinition> {
	if (cachedAttributes) return cachedAttributes;

	const attributes = new Map<string, AttributeDefinition>();
	const directory = path.join(
		process.cwd(),
		"sentry-conventions",
		"model",
		"attributes",
		"gen_ai",
	);
	try {
		for (const file of readdirSync(directory).filter((name) =>
			name.endsWith(".json"),
		)) {
			try {
				const definition = JSON.parse(
					readFileSync(path.join(directory, file), "utf8"),
				) as AttributeDefinition;
				attributes.set(definition.key, definition);
			} catch (error) {
				console.warn(
					`Could not load GenAI convention ${file}: ${error instanceof Error ? error.message : error}`,
				);
			}
		}
	} catch {
		console.warn(
			"Could not load sentry-conventions; convention observations will be limited.",
		);
	}
	cachedAttributes = attributes;
	return attributes;
}
