const safePart = (value) => String(value).replace(/[^A-Za-z0-9_-]/g, "-");

function reportPath(report) {
	const date = report.generatedAt.slice(0, 10);
	if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
		throw new Error("Report date must use YYYY-MM-DD.");
	const key = [
		report.runId || "local",
		report.runAttempt || "1",
		report.executionId || report.generatedAt,
	]
		.map(safePart)
		.join("-");
	return `reports/${date}/${key}`;
}

function retainedReportPath(entry) {
	const value = entry.reportPath || `reports/${entry.date}`;
	if (!/^reports\/\d{4}-\d{2}-\d{2}(?:\/[A-Za-z0-9_-]+)?$/.test(value))
		throw new Error("History contains an unsafe report path.");
	return value;
}

module.exports = { reportPath, retainedReportPath };
