import type { ResolvedFramework } from "./framework-config.js";

export interface AssessmentEnvironmentContext {
	workDir: string;
	framework: ResolvedFramework;
}

export interface AssessmentExecutionContext {
	workDir: string;
	sentryDsn: string;
	programPath: string;
	logPath: string;
	timeoutMs: number;
}

export interface AssessmentExecutionResult {
	stdout: string;
	stderr: string;
	exitError?: string;
	timedOut: boolean;
}

export interface AssessmentRunner {
	needsSetup(context: AssessmentEnvironmentContext): Promise<boolean>;
	setupEnvironment(context: AssessmentEnvironmentContext): Promise<void>;
	executeAssessmentProgram(
		context: AssessmentExecutionContext,
	): Promise<AssessmentExecutionResult>;
}

export function resolveDependencyVersion(
	version: string,
	framework: ResolvedFramework,
): string {
	if (version === "framework") return framework.version;
	if (version === "sentry") return framework.sentryVersion;
	return version;
}

export function assessmentEnvironment(
	context: Pick<AssessmentExecutionContext, "sentryDsn">,
): NodeJS.ProcessEnv {
	return {
		...process.env,
		SENTRY_DSN: context.sentryDsn,
		OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? "",
		OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY ?? "",
		GOOGLE_GENAI_API_KEY: process.env.GOOGLE_GENAI_API_KEY ?? "",
	};
}

export function executionFailure(error: unknown): AssessmentExecutionResult {
	const failure = error as {
		message?: string;
		stdout?: string | Buffer;
		stderr?: string | Buffer;
		killed?: boolean;
		code?: string | number;
		name?: string;
	};
	return {
		stdout: failure.stdout?.toString() ?? "",
		stderr: failure.stderr?.toString() ?? "",
		exitError: failure.message ?? "Assessment program failed.",
		timedOut:
			failure.killed === true ||
			failure.code === "ETIMEDOUT" ||
			failure.name === "TimeoutError",
	};
}

export function executionLog(
	context: AssessmentExecutionContext,
	result: AssessmentExecutionResult,
): string {
	return [
		"=== Assessment Execution Log ===",
		`Program: ${context.programPath}`,
		`Timestamp: ${new Date().toISOString()}`,
		"",
		"=== STDOUT ===",
		result.stdout || "(no output)",
		"",
		"=== STDERR ===",
		result.stderr || "(no errors)",
		result.exitError ? `\n=== PROCESS ERROR ===\n${result.exitError}` : "",
		"",
		"=== End of Log ===",
	].join("\n");
}
