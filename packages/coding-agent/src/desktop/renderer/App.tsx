import type { AgentMessage } from "@oh-my-pi/pi-agent-core";
import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import {
	User,
	Bot,
	Wrench,
	Settings,
	TerminalSquare,
	SendHorizontal,
	Activity,
	Clock,
	CheckCircle2,
	XCircle,
	FileCode2,
	ListTodo,
	Route,
	Blocks,
} from "lucide-react";
import type { DesktopSlashCommand } from "../common";
import { enMessages } from "../i18n/en";
import { createTranslator } from "../i18n/messages";
import { useDesktopSession } from "./state/useDesktopSession";

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function getMessageRole(message: AgentMessage): string {
	if (isRecord(message) && typeof message.role === "string") {
		return message.role;
	}
	return "custom";
}

function describeContentPart(part: unknown): string {
	if (!isRecord(part)) return "";
	if (part.type === "text" && typeof part.text === "string") {
		return part.text;
	}
	if (typeof part.type === "string") {
		return `[${part.type}]`;
	}
	return "";
}

function renderMessageText(message: AgentMessage): string {
	if (!isRecord(message)) {
		return JSON.stringify(message, null, 2);
	}
	const content = message.content;
	if (typeof content === "string") {
		return content;
	}
	if (Array.isArray(content)) {
		const text = content.map(describeContentPart).filter(Boolean).join("\n").trim();
		return text || "[no text content]";
	}
	return JSON.stringify(message, null, 2);
}

function RoleIcon({ role }: { role: string }) {
	switch (role) {
		case "user":
			return <User size={16} className="text-blue-600" />;
		case "assistant":
			return <Bot size={16} className="text-purple-600" />;
		case "tool":
			return <Wrench size={16} className="text-amber-600" />;
		case "system":
			return <Settings size={16} className="text-gray-500" />;
		default:
			return <TerminalSquare size={16} className="text-gray-500" />;
	}
}

function roleLabel(role: string, t: ReturnType<typeof createTranslator>): string {
	switch (role) {
		case "user":
			return t("roleUser");
		case "assistant":
			return t("roleAssistant");
		case "tool":
			return t("roleTool");
		case "system":
			return t("roleSystem");
		default:
			return t("roleCustom");
	}
}

function getSlashCommandQuery(value: string): string | null {
	const trimmed = value.trim();
	if (!trimmed.startsWith("/") || trimmed.includes("\n") || trimmed.includes(" ")) return null;
	return trimmed.slice(1).toLowerCase();
}

export default function App() {
	const t = useMemo(() => createTranslator(enMessages), []);
	const {
		state,
		slashCommands,
		loading,
		error: sessionError,
		sendPrompt,
		respondToExtensionRequest,
	} = useDesktopSession();
	const [input, setInput] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const inputRef = useRef<HTMLTextAreaElement | null>(null);
	const [selectedSlashCommandIndex, setSelectedSlashCommandIndex] = useState(0);
	const slashCommandQuery = getSlashCommandQuery(input);
	const matchingSlashCommands = useMemo(
		() =>
			slashCommandQuery === null ? [] : slashCommands.filter(command => command.name.startsWith(slashCommandQuery)),
		[slashCommandQuery, slashCommands],
	);
	const activeSlashCommand = matchingSlashCommands[selectedSlashCommandIndex] ?? matchingSlashCommands[0] ?? null;

	useEffect(() => {
		setSelectedSlashCommandIndex(0);
	}, [slashCommandQuery, matchingSlashCommands.length]);

	const applySlashCommandSelection = (command: DesktopSlashCommand) => {
		setInput(`/${command.name} `);
		setSelectedSlashCommandIndex(0);
		inputRef.current?.focus();
	};

	const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (!input.trim() || submitting) return;
		setSubmitting(true);
		setError(null);
		try {
			await sendPrompt(input.trim());
			setInput("");
		} catch (nextError) {
			setError(nextError instanceof Error ? nextError.message : String(nextError));
		} finally {
			setSubmitting(false);
		}
	};

	const handlePromptKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
		if (matchingSlashCommands.length > 0) {
			if (event.key === "ArrowDown") {
				event.preventDefault();
				setSelectedSlashCommandIndex(current => (current + 1) % matchingSlashCommands.length);
				return;
			}
			if (event.key === "ArrowUp") {
				event.preventDefault();
				setSelectedSlashCommandIndex(current => (current === 0 ? matchingSlashCommands.length - 1 : current - 1));
				return;
			}
			if ((event.key === "Tab" || event.key === "Enter") && !event.shiftKey && !event.nativeEvent.isComposing) {
				if (activeSlashCommand && input.trim() !== `/${activeSlashCommand.name}`) {
					event.preventDefault();
					applySlashCommandSelection(activeSlashCommand);
					return;
				}
			}
		}
		if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
		event.preventDefault();
		event.currentTarget.form?.requestSubmit();
	};

	const handleExtensionSubmit = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		const formData = new FormData(event.currentTarget);
		const value = formData.get("extension-value");
		if (typeof value === "string") {
			await respondToExtensionRequest(value);
		}
	};

	const sessionId = state?.session?.sessionName || state?.session?.sessionId || "—";
	const modelId = state?.session?.model
		? `${state.session.model.provider}/${state.session.model.id}`
		: t("unknownModel");
	const messageCount = state?.session?.messageCount ?? state?.messages.length ?? 0;
	const backendStatus = state?.backendStatus ?? "starting";
	const isStreaming = state?.session?.isStreaming ?? false;
	const streamingText = state?.streamingMessage ? renderMessageText(state.streamingMessage) : t("streamingEmpty");
	const todoPhases = state?.session?.todoPhases ?? [];
	const pendingActions = state?.session?.pendingActions ?? [];
	const activePendingAction = pendingActions[0] ?? null;
	const planMode = state?.session?.planMode;
	const toolExecutions = state?.toolExecutions ?? [];
	const activeRequest = state?.activeExtensionRequest ?? null;
	const displayedError = error ?? state?.error ?? sessionError;

	return (
		<div className="h-screen overflow-hidden bg-[var(--desktop-bg)] text-[var(--desktop-fg)]">
			<div className="mx-auto flex h-screen max-w-[1800px] flex-col overflow-hidden px-4 py-4">
				<header className="mb-4 flex items-center justify-between border border-[var(--desktop-border)] bg-[var(--desktop-surface)] px-5 py-4">
					<div>
						<p className="text-xs uppercase tracking-[0.24em] text-[var(--desktop-muted)]">{t("appTitle")}</p>
						<h1 className="mt-1 text-2xl font-semibold">{t("appSubtitle")}</h1>
					</div>
					<div className="flex items-center gap-3 text-sm text-[var(--desktop-muted)]">
						<span className={`status-pill ${isStreaming ? "status-pill--streaming" : "status-pill--idle"}`}>
							{isStreaming ? (
								<>
									<Activity size={14} className="mr-1.5 animate-pulse" /> {t("statusStreaming")}
								</>
							) : (
								<>
									<CheckCircle2 size={14} className="mr-1.5" /> {t("statusIdle")}
								</>
							)}
						</span>
					</div>
				</header>

				<div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_340px] gap-4 overflow-hidden">
					<section className="flex min-h-0 flex-col border border-[var(--desktop-border)] bg-[var(--desktop-surface)]">
						<div className="border-b border-[var(--desktop-border)] px-5 py-4 flex items-center gap-2">
							<TerminalSquare size={18} className="text-[var(--desktop-muted)]" />
							<h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--desktop-muted)]">
								{t("conversationTitle")}
							</h2>
						</div>
						<div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
							{loading && <p className="text-sm text-[var(--desktop-muted)]">{t("backendConnecting")}</p>}
							{!loading && (state?.messages.length ?? 0) === 0 && (
								<p className="text-sm text-[var(--desktop-muted)]">{t("conversationEmpty")}</p>
							)}
							{state?.messages.map((message, index) => {
								const role = getMessageRole(message);
								return (
									<article
										className="message-card"
										key={`${role}-${index}-${renderMessageText(message).slice(0, 32)}`}
									>
										<div className="message-card__header">
											<span className="message-card__role">
												<RoleIcon role={role} />
												<span className="ml-1.5">{roleLabel(role, t)}</span>
											</span>
										</div>
										<pre className="message-card__body">{renderMessageText(message)}</pre>
									</article>
								);
							})}
						</div>
						<form className="shrink-0 border-t border-[var(--desktop-border)] px-5 py-4" onSubmit={handleSubmit}>
							<div className="prompt-shell">
								<label className="sr-only" htmlFor="desktop-prompt">
									{t("promptPlaceholder")}
								</label>
								{matchingSlashCommands.length > 0 && (
									<div aria-label="Slash commands" className="slash-command-picker" role="listbox">
										{matchingSlashCommands.map(command => (
											<button
												className={`slash-command-item ${activeSlashCommand?.name === command.name ? "slash-command-item--active" : ""}`}
												key={`${command.kind}-${command.name}`}
												onClick={() => applySlashCommandSelection(command)}
												onMouseDown={event => event.preventDefault()}
												type="button"
											>
												<span className="slash-command-item__header">
													<span className="slash-command-item__name">/{command.name}</span>
													<span className="slash-command-item__source">{command.source}</span>
												</span>
												<span className="slash-command-item__description">{command.description}</span>
											</button>
										))}
									</div>
								)}
								<textarea
									id="desktop-prompt"
									className="prompt-input"
									placeholder={t("promptPlaceholder")}
									rows={4}
									ref={inputRef}
									value={input}
									onChange={event => setInput(event.target.value)}
									onKeyDown={handlePromptKeyDown}
								/>
							</div>
							<div className="mt-3 flex items-center justify-between gap-4">
								{displayedError ? (
									<p className="text-sm text-[var(--desktop-error)]">{displayedError}</p>
								) : (
									<div />
								)}
								<button className="send-button" disabled={submitting || !input.trim()} type="submit">
									{submitting ? (
										<>
											<Clock size={16} className="animate-spin mr-1.5 inline-block" />{" "}
											{t("submitPromptBusy")}
										</>
									) : (
										<>
											<SendHorizontal size={16} className="mr-1.5 inline-block" /> {t("submitPrompt")}
										</>
									)}
								</button>
							</div>
						</form>
					</section>

					<aside className="flex min-h-0 flex-col gap-4 overflow-y-auto">
						<section className="border border-[var(--desktop-border)] bg-[var(--desktop-surface)] px-5 py-4">
							<div className="flex items-center gap-2">
								<Blocks size={18} className="text-[var(--desktop-muted)]" />
								<h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--desktop-muted)]">
									{t("toolStateTitle")}
								</h2>
							</div>
							<dl className="mt-4 space-y-4 text-sm">
								<div className="state-row">
									<dt>{t("backendStatusTitle")}</dt>
									<dd>{backendStatus === "ready" ? t("backendReady") : t("backendConnecting")}</dd>
								</div>
								<div className="state-row">
									<dt>{t("sessionLabel")}</dt>
									<dd>{sessionId}</dd>
								</div>
								<div className="state-row">
									<dt>{t("modelLabel")}</dt>
									<dd>{modelId}</dd>
								</div>
								<div className="state-row">
									<dt>{t("messageCountLabel")}</dt>
									<dd>{messageCount}</dd>
								</div>
							</dl>
						</section>

						<section className="border border-[var(--desktop-border)] bg-[var(--desktop-surface)] px-5 py-4">
							<div className="flex items-center gap-2">
								<FileCode2 size={18} className="text-[var(--desktop-muted)]" />
								<h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--desktop-muted)]">
									Pending changes
								</h2>
							</div>
							{pendingActions.length === 0 ? (
								<p className="mt-3 text-sm text-[var(--desktop-muted)]">No staged changes yet.</p>
							) : (
								<div className="mt-3 space-y-3">
									{pendingActions.map(action => (
										<div
											className="border border-[var(--desktop-border)] bg-[var(--desktop-panel)] p-3"
											key={action.id}
										>
											<div className="flex items-start justify-between gap-3">
												<div>
													<p className="text-sm font-semibold">{action.label}</p>
													<p className="mt-1 text-xs text-[var(--desktop-muted)]">
														{action.sourceToolName}
													</p>
												</div>
												<span className="status-chip">staged</span>
											</div>
											{action.files?.length ? (
												<p className="mt-3 text-xs text-[var(--desktop-muted)]">
													{action.files.join(", ")}
												</p>
											) : null}
										</div>
									))}
									{activePendingAction?.diff ? (
										<div className="border border-[var(--desktop-border)] bg-[var(--desktop-panel)] p-3">
											<p className="text-xs uppercase tracking-[0.12em] text-[var(--desktop-muted)]">
												Preview
											</p>
											<pre className="message-card__body mt-2 text-xs">{activePendingAction.diff}</pre>
										</div>
									) : null}
								</div>
							)}
						</section>

						<section className="border border-[var(--desktop-border)] bg-[var(--desktop-surface)] px-5 py-4">
							<div className="flex items-center gap-2">
								<ListTodo size={18} className="text-[var(--desktop-muted)]" />
								<h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--desktop-muted)]">
									Todos
								</h2>
							</div>
							{todoPhases.length === 0 ? (
								<p className="mt-3 text-sm text-[var(--desktop-muted)]">No active todo phases.</p>
							) : (
								<div className="mt-3 space-y-3">
									{todoPhases.map(phase => (
										<div
											className="border border-[var(--desktop-border)] bg-[var(--desktop-panel)] p-3"
											key={phase.id}
										>
											<p className="text-sm font-semibold">{phase.name}</p>
											<ul className="mt-2 space-y-2 text-sm text-[var(--desktop-muted)]">
												{phase.tasks.map(task => (
													<li className="flex items-start justify-between gap-3" key={task.id}>
														<span>{task.content}</span>
														<span className="status-chip">{task.status}</span>
													</li>
												))}
											</ul>
										</div>
									))}
								</div>
							)}
						</section>

						<section className="border border-[var(--desktop-border)] bg-[var(--desktop-surface)] px-5 py-4">
							<div className="flex items-center gap-2">
								<Route size={18} className="text-[var(--desktop-muted)]" />
								<h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--desktop-muted)]">
									Plan mode
								</h2>
							</div>
							{planMode?.enabled ? (
								<div className="mt-3 space-y-2 text-sm text-[var(--desktop-muted)]">
									<p>Plan file: {planMode.planFilePath}</p>
									<p>Workflow: {planMode.workflow ?? "parallel"}</p>
									<p>Reentry: {planMode.reentry ? "Yes" : "No"}</p>
								</div>
							) : (
								<p className="mt-3 text-sm text-[var(--desktop-muted)]">Plan mode is inactive.</p>
							)}
						</section>

						<section className="flex min-h-0 flex-1 flex-col border border-[var(--desktop-border)] bg-[var(--desktop-surface)] px-5 py-4">
							<div className="flex items-center gap-2">
								<Activity size={18} className="text-[var(--desktop-muted)]" />
								<h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--desktop-muted)]">
									{t("streamingTitle")}
								</h2>
							</div>
							<div className="mt-4 min-h-0 flex-1 overflow-y-auto border border-[var(--desktop-border)] bg-[var(--desktop-panel)] p-4">
								<pre className="message-card__body text-sm">{streamingText}</pre>
							</div>
							<div className="flex items-center gap-2 mt-4">
								<Wrench size={18} className="text-[var(--desktop-muted)]" />
								<h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--desktop-muted)]">
									Tool executions
								</h3>
							</div>
							<div className="mt-3 min-h-0 flex-1 space-y-3 overflow-y-auto">
								{toolExecutions.length === 0 ? (
									<p className="text-sm text-[var(--desktop-muted)]">No tool executions yet.</p>
								) : (
									toolExecutions.map(execution => (
										<div
											className="border border-[var(--desktop-border)] bg-[var(--desktop-panel)] p-3"
											key={execution.toolCallId}
										>
											<div className="flex items-start justify-between gap-3">
												<div>
													<p className="text-sm font-semibold">{execution.toolName}</p>
													{execution.intent ? (
														<p className="mt-1 text-xs text-[var(--desktop-muted)]">{execution.intent}</p>
													) : null}
												</div>
												<span className="status-chip">{execution.status}</span>
											</div>
										</div>
									))
								)}
							</div>
						</section>
					</aside>
				</div>

				{activeRequest && activeRequest.method === "input" ? (
					<div className="overlay">
						<form className="overlay-card" onSubmit={handleExtensionSubmit}>
							<h2 className="text-lg font-semibold">{activeRequest.title}</h2>
							<input
								className="prompt-input mt-4"
								name="extension-value"
								placeholder={activeRequest.placeholder}
							/>
							<div className="mt-4 flex justify-end gap-3">
								<button
									className="secondary-button"
									onClick={() => void respondToExtensionRequest({ cancelled: true })}
									type="button"
								>
									Cancel
								</button>
								<button className="send-button" type="submit">
									Submit
								</button>
							</div>
						</form>
					</div>
				) : null}

				{activeRequest && activeRequest.method === "confirm" ? (
					<div className="overlay">
						<div className="overlay-card">
							<h2 className="text-lg font-semibold">{activeRequest.title}</h2>
							<p className="mt-4 text-sm text-[var(--desktop-muted)]">{activeRequest.message}</p>
							<div className="mt-4 flex justify-end gap-3">
								<button
									className="secondary-button"
									onClick={() => void respondToExtensionRequest(false)}
									type="button"
								>
									Decline
								</button>
								<button
									className="send-button"
									onClick={() => void respondToExtensionRequest(true)}
									type="button"
								>
									Accept
								</button>
							</div>
						</div>
					</div>
				) : null}

				{activeRequest && activeRequest.method === "select" ? (
					<div className="overlay">
						<div className="overlay-card">
							<h2 className="text-lg font-semibold">{activeRequest.title}</h2>
							<div className="mt-4 flex flex-col gap-3">
								{activeRequest.options.map(option => (
									<button
										className="secondary-button justify-start"
										key={option}
										onClick={() => void respondToExtensionRequest(option)}
										type="button"
									>
										{option}
									</button>
								))}
							</div>
						</div>
					</div>
				) : null}
			</div>
		</div>
	);
}
