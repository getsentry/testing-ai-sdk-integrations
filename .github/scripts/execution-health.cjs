function primaryFailures(variant) {
	return (variant.runtimeFailures || []).filter(
		(failure) => !failure.recovered && !failure.secondary,
	);
}

function failureKey(failure) {
	return [
		failure.probeId || "setup",
		failure.kind,
		failure.statusCode || "",
		failure.code || "",
	].join(":");
}

function confirmedFailures(variant, baseline) {
	const unique = new Map(
		primaryFailures(variant).map((failure) => [failureKey(failure), failure]),
	);
	return [...unique.values()].filter((failure) => {
		const key = failureKey(failure);
		const attempts = (variant.attempts || []).filter((attempt) =>
			attempt.runtimeFailures.some(
				(item) => !item.secondary && failureKey(item) === key,
			),
		);
		return (
			attempts.length >= 2 ||
			(baseline &&
				primaryFailures(baseline).some((item) => failureKey(item) === key))
		);
	});
}

module.exports = { primaryFailures, confirmedFailures };
