import { spawn, type ChildProcess } from "node:child_process";
import { createWriteStream } from "node:fs";
import type {
	AssessmentExecutionContext,
	AssessmentExecutionResult,
} from "./execution.js";
import { assessmentEnvironment } from "./execution.js";

export function signalProcessTree(
	child: ChildProcess,
	signal: NodeJS.Signals,
): void {
	if (!child.pid) return;
	try {
		if (process.platform !== "win32") process.kill(-child.pid, signal);
		else child.kill(signal);
	} catch {
		child.kill(signal);
	}
}

export async function stopProcessTree(child: ChildProcess): Promise<void> {
	if (!child.pid) return;
	await new Promise<void>((resolve) => {
		const kill = setTimeout(() => {
			signalProcessTree(child, "SIGKILL");
			resolve();
		}, 1_000);
		child.once("close", () => {
			clearTimeout(kill);
			// Descendants may outlive a normally exited parent.
			signalProcessTree(child, "SIGKILL");
			resolve();
		});
		signalProcessTree(child, "SIGTERM");
	});
}

/** Kill the entire process group on deadline, including synchronous Python calls. */
export function executeProcess(
	command: string,
	args: string[],
	context: AssessmentExecutionContext,
): Promise<AssessmentExecutionResult> {
	return new Promise((resolve) => {
		const log = createWriteStream(context.logPath);
		let stdout = "";
		let stderr = "";
		let capturedBytes = 0;
		let exitError: string | undefined;
		let timedOut = false;
		let finished = false;
		let killTimer: ReturnType<typeof setTimeout> | undefined;
		const child = spawn(command, args, {
			cwd: context.workDir,
			env: assessmentEnvironment(context),
			detached: process.platform !== "win32",
			stdio: ["ignore", "pipe", "pipe"],
		});
		const stop = (message: string) => {
			exitError ??= message;
			if (finished) return;
			signalProcessTree(child, "SIGTERM");
			killTimer ??= setTimeout(() => {
				signalProcessTree(child, "SIGKILL");
				finish();
			}, 1_000);
		};
		const timeout = setTimeout(() => {
			timedOut = true;
			stop(`Probe exceeded its ${context.timeoutMs} ms process deadline.`);
		}, context.timeoutMs);
		const finish = () => {
			if (finished) return;
			finished = true;
			clearTimeout(timeout);
			if (killTimer) clearTimeout(killTimer);
			signalProcessTree(child, "SIGKILL");
			child.stdout.destroy();
			child.stderr.destroy();
			log.end(() => resolve({ stdout, stderr, exitError, timedOut }));
		};
		log.on("error", (error) =>
			stop(`Could not persist probe output: ${error.message}`),
		);
		child.stdout.setEncoding("utf8");
		child.stderr.setEncoding("utf8");
		const capture = (text: string, channel: "stdout" | "stderr") => {
			capturedBytes += Buffer.byteLength(text);
			if (capturedBytes > 32 * 1024 * 1024) {
				stop("Probe output exceeded the 32 MiB capture limit.");
				return;
			}
			if (channel === "stdout") stdout += text;
			else stderr += text;
			log.write(text);
		};
		child.stdout.on("data", (data: string) => capture(data, "stdout"));
		child.stderr.on("data", (data: string) => capture(data, "stderr"));
		child.once("error", (error) => {
			exitError = error.message;
			finish();
		});
		child.once("close", (code, signal) => {
			if (code !== 0)
				exitError ??= `Probe process exited with ${signal ?? `code ${code}`}.`;
			finish();
		});
	});
}
