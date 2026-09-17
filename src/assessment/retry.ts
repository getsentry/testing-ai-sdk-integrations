import type { ProbeAttempt, RuntimeFailure } from "./types.js";

/** Provider SDK retries happen inside an attempt, bounded by its process deadline. */
export const SDK_RETRY_POLICY =
	"SDK defaults; no additional call-level retries; bounded by the probe deadline";
export const DEFAULT_PROBE_TIMEOUT_MS = 180_000;
export const MAX_RETRY_DELAY_MS = 120_000;

export function classifyFailure(failure: RuntimeFailure): RuntimeFailure {
	if (failure.category) return failure;
	const category =
		failure.kind === "setup"
			? "setup"
			: failure.kind === "provider"
				? "provider"
				: failure.kind === "flush" || failure.kind === "collector"
					? "telemetry"
					: failure.kind === "timeout"
						? "unknown"
						: "harness";
	return { ...failure, category };
}

export function retryReason(
	failures: readonly RuntimeFailure[],
): ProbeAttempt["retryReason"] {
	const primary = failures.filter((failure) => !failure.secondary);
	if (!primary.length) return undefined;
	const reasons = primary.map((failure): ProbeAttempt["retryReason"] => {
		if (failure.kind === "timeout") return "diagnostic_timeout";
		if (failure.kind === "flush") return "diagnostic_flush";
		if (
			failure.kind === "process_exit" &&
			/EADDRINUSE|Address already in use/i.test(failure.message)
		)
			return "port_collision";
		if (failure.kind !== "provider") return undefined;
		if (
			failure.statusCode === 429 ||
			(failure.statusCode !== undefined &&
				failure.statusCode >= 500 &&
				failure.statusCode <= 599)
		)
			return "transient_provider";
		if (
			/^(ECONNRESET|ECONNREFUSED|ETIMEDOUT|EPIPE|UND_ERR_SOCKET|UND_ERR_CONNECT_TIMEOUT)$/.test(
				failure.code ?? "",
			)
		)
			return "transient_provider";
		return undefined;
	});
	return reasons.every(Boolean) ? reasons[0] : undefined;
}

/** A long Retry-After is not shortened: leave the failure visible for a later run. */
export function retryDelay(
	failures: readonly RuntimeFailure[],
	random = Math.random,
): number | undefined {
	const requested = Math.max(
		0,
		...failures.map((failure) => failure.retryAfterMs ?? 0),
	);
	if (!Number.isFinite(requested) || requested > MAX_RETRY_DELAY_MS)
		return undefined;
	return Math.max(requested, 1_000 + Math.floor(random() * 1_000));
}
