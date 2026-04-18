import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import * as readline from "node:readline";
import type { DesktopBackendFrame, DesktopBackendStatus, DesktopCommand, DesktopCommandResponse } from "./common";

interface DesktopBackendClientOptions {
	backendEntry: string;
	cwd: string;
	bunBinary?: string;
}

interface PendingRequest {
	resolve(response: DesktopCommandResponse): void;
	reject(error: Error): void;
}

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function isDesktopCommandResponse(value: unknown): value is DesktopCommandResponse {
	return isObject(value) && value.type === "response" && typeof value.command === "string" && typeof value.success === "boolean";
}

export class DesktopBackendClient {
	#events = new EventEmitter();
	#process: ReturnType<typeof spawn> | null = null;
	#pendingRequests = new Map<string, PendingRequest>();
	#requestId = 0;
	#status: DesktopBackendStatus = "stopped";
	#readyPromise: Promise<void> | null = null;
	#stderr = "";

	get status(): DesktopBackendStatus {
		return this.#status;
	}

	onFrame(listener: (frame: DesktopBackendFrame) => void): () => void {
		this.#events.on("frame", listener);
		return () => this.#events.off("frame", listener);
	}

	async start(options: DesktopBackendClientOptions): Promise<void> {
		if (this.#readyPromise) {
			await this.#readyPromise;
			return;
		}

		this.#setStatus("starting");
		this.#stderr = "";
		const bunBinary = options.bunBinary || process.env.OMP_DESKTOP_BUN || "bun";
		const child = spawn(bunBinary, [options.backendEntry, "--mode", "rpc"], {
			cwd: options.cwd,
			env: process.env,
			stdio: ["pipe", "pipe", "pipe"],
		});
		this.#process = child;

		child.stderr.setEncoding("utf8");
		child.stderr.on("data", chunk => {
			this.#stderr += String(chunk);
		});

		const stdout = readline.createInterface({ input: child.stdout, crlfDelay: Number.POSITIVE_INFINITY });
		const { promise, resolve, reject } = Promise.withResolvers<void>();
		let ready = false;

		void (async () => {
			for await (const line of stdout) {
				try {
					const frame = JSON.parse(line) as DesktopBackendFrame;
					if (isObject(frame) && frame.type === "ready") {
						ready = true;
						this.#setStatus("ready");
						this.#emitFrame(frame);
						resolve();
						continue;
					}

					if (isDesktopCommandResponse(frame) && "id" in frame && typeof frame.id === "string") {
						const pending = this.#pendingRequests.get(frame.id);
						if (pending) {
							this.#pendingRequests.delete(frame.id);
							pending.resolve(frame);
							continue;
						}
					}

					this.#emitFrame(frame);
				} catch (error) {
					const message = error instanceof Error ? error.message : String(error);
					this.#setStatus("error", `Failed to parse backend frame: ${message}`);
					if (!ready) {
						reject(new Error(message));
					}
				}
			}
		})().catch((error: unknown) => {
			const message = error instanceof Error ? error.message : String(error);
			this.#setStatus("error", message);
			if (!ready) {
				reject(new Error(message));
			}
			this.#rejectPending(new Error(message));
		});

		child.on("error", (error: Error) => {
			this.#setStatus("error", error.message);
			if (!ready) {
				reject(error);
			}
			this.#rejectPending(error);
		});

		child.on("exit", (code: number | null) => {
			const stderr = this.#stderr.trim();
			const exitMessage = stderr || `Backend exited with code ${code ?? "unknown"}`;
			this.#setStatus(code === 0 ? "stopped" : "error", code === 0 ? undefined : exitMessage);
			if (!ready) {
				reject(new Error(exitMessage));
			}
			this.#process = null;
			this.#readyPromise = null;
			this.#rejectPending(new Error(exitMessage));
		});

		this.#readyPromise = promise;
		await promise;
	}

	async stop(): Promise<void> {
		const child = this.#process;
		this.#readyPromise = null;
		if (!child) {
			this.#setStatus("stopped");
			return;
		}

		child.kill();
		this.#process = null;
		this.#setStatus("stopped");
		this.#rejectPending(new Error("Backend stopped"));
	}

	async request(command: DesktopCommand): Promise<DesktopCommandResponse> {
		await this.#ensureReady();
		const child = this.#process;
		if (!child) {
			throw new Error("Desktop backend is not running.");
		}

		if (command.type === "extension_ui_response") {
			await new Promise<void>((resolve, reject) => {
				child.stdin!.write(`${JSON.stringify(command)}\n`, error => {
					if (error) {
						reject(error);
						return;
					}
					resolve();
				});
			});
			return { type: "response", command: "extension_ui_response", success: true };
		}

		const id = `desktop-${++this.#requestId}`;
		const payload = { ...command, id };
		const { promise, resolve, reject } = Promise.withResolvers<DesktopCommandResponse>();
		this.#pendingRequests.set(id, { resolve, reject });
		child.stdin!.write(`${JSON.stringify(payload)}\n`, error => {
			if (!error) return;
			this.#pendingRequests.delete(id);
			reject(error);
		});
		return promise;
	}

	async #ensureReady(): Promise<void> {
		const readyPromise = this.#readyPromise;
		if (!readyPromise) {
			throw new Error("Desktop backend has not been started.");
		}
		await readyPromise;
	}

	#emitFrame(frame: DesktopBackendFrame): void {
		this.#events.emit("frame", frame);
	}

	#setStatus(status: DesktopBackendStatus, error?: string): void {
		this.#status = status;
		this.#emitFrame({ type: "backend_status", status, ...(error ? { error } : {}) });
	}

	#rejectPending(error: Error): void {
		for (const pending of this.#pendingRequests.values()) {
			pending.reject(error);
		}
		this.#pendingRequests.clear();
	}
}
