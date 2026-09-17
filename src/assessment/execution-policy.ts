import { createLimiter } from "../concurrency.js";

export const DEFAULT_PARALLEL = 6;
export const DEFAULT_ENDPOINT_LIMITS: Record<string, number> = {
	openrouter: 2,
	google: 2,
};

export function positiveInteger(value: string, option: string): number {
	const normalized = value.replace(/^=/, "");
	if (
		!/^[1-9]\d*$/.test(normalized) ||
		!Number.isSafeInteger(Number(normalized))
	)
		throw new Error(`${option} must be a positive integer.`);
	return Number(normalized);
}

export function endpointLimits(
	values: readonly string[] = [],
): Record<string, number> {
	const result = { ...DEFAULT_ENDPOINT_LIMITS };
	for (const value of values) {
		const [endpoint, limit, extra] = value.split("=");
		if (
			!Object.hasOwn(DEFAULT_ENDPOINT_LIMITS, endpoint) ||
			!limit ||
			extra !== undefined
		)
			throw new Error("--endpoint-limit must be openrouter=N or google=N.");
		result[endpoint] = positiveInteger(limit, "--endpoint-limit");
	}
	return result;
}

/** Acquire only around a probe process; setup and retry backoff do not hold an endpoint slot. */
export function createEndpointScheduler(limits: Record<string, number>) {
	const schedulers = new Map(
		Object.entries(limits).map(([endpoint, limit]) => [
			endpoint,
			createLimiter(limit),
		]),
	);
	return <T>(endpoint: string, work: () => Promise<T>): Promise<T> => {
		if (endpoint === "none") return work();
		const schedule = schedulers.get(endpoint);
		if (!schedule)
			throw new Error(
				`No concurrency limit is configured for endpoint ${endpoint}.`,
			);
		return schedule(work);
	};
}
