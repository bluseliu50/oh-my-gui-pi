import type { AgentMessage } from "@oh-my-pi/pi-agent-core";
import type { AgentSessionEvent } from "../../../session/agent-session";
import type { DesktopBackendFrame, DesktopBackendStatus, DesktopBootstrap, DesktopCommandResponse } from "../../common";
import type { RpcExtensionUIRequest, RpcExtensionUIResponse, RpcSessionState } from "../../../modes/rpc/rpc-types";

export interface DesktopToolExecutionState {
	toolCallId: string;
	toolName: string;
	args: unknown;
	intent?: string;
	status: "running" | "completed" | "error";
	partialResult?: unknown;
	result?: unknown;
}

export interface DesktopState {
	backendStatus: DesktopBackendStatus;
	session: RpcSessionState | null;
	messages: AgentMessage[];
	streamingMessage: AgentMessage | null;
	toolExecutions: DesktopToolExecutionState[];
	activeExtensionRequest: RpcExtensionUIRequest | null;
	lastResponse: DesktopCommandResponse | null;
	error: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function isAgentEvent(frame: DesktopBackendFrame): frame is AgentSessionEvent {
	return (
		isRecord(frame) &&
		typeof frame.type === "string" &&
		[
			"agent_start",
			"agent_end",
			"turn_start",
			"turn_end",
			"message_start",
			"message_update",
			"message_end",
			"tool_execution_start",
			"tool_execution_update",
			"tool_execution_end",
			"pending_action_added",
			"pending_action_resolved",
		].includes(frame.type)
	);
}

function isExtensionUiRequest(frame: DesktopBackendFrame): frame is RpcExtensionUIRequest {
	return isRecord(frame) && frame.type === "extension_ui_request" && typeof frame.id === "string";
}

function isResponse(frame: DesktopBackendFrame): frame is DesktopCommandResponse {
	return (
		isRecord(frame) &&
		frame.type === "response" &&
		typeof frame.command === "string" &&
		typeof frame.success === "boolean"
	);
}

export function createDesktopInitialState(bootstrap: DesktopBootstrap): DesktopState {
	return {
		backendStatus: bootstrap.backendStatus,
		session: bootstrap.state,
		messages: bootstrap.messages,
		streamingMessage: null,
		toolExecutions: [],
		activeExtensionRequest: null,
		lastResponse: null,
		error: null,
	};
}

function replaceToolExecution(
	toolExecutions: DesktopToolExecutionState[],
	toolExecution: DesktopToolExecutionState,
): DesktopToolExecutionState[] {
	const index = toolExecutions.findIndex(entry => entry.toolCallId === toolExecution.toolCallId);
	if (index === -1) {
		return [toolExecution, ...toolExecutions].slice(0, 25);
	}
	return toolExecutions.map(entry => (entry.toolCallId === toolExecution.toolCallId ? toolExecution : entry));
}

function appendMessage(messages: AgentMessage[], message: AgentMessage): AgentMessage[] {
	const last = messages.at(-1);
	if (last === message) {
		return messages;
	}
	return [...messages, message];
}

export function reduceDesktopFrame(state: DesktopState, frame: DesktopBackendFrame): DesktopState {
	if (isRecord(frame) && frame.type === "backend_status") {
		return {
			...state,
			backendStatus: frame.status,
			error: frame.status === "error" && typeof frame.error === "string" ? frame.error : state.error,
		};
	}

	if (isExtensionUiRequest(frame)) {
		return {
			...state,
			activeExtensionRequest: frame.method === "cancel" ? null : frame,
		};
	}

	if (isResponse(frame)) {
		const nextState: DesktopState = { ...state, lastResponse: frame };
		if (!frame.success) {
			return { ...nextState, error: frame.error };
		}
		if (frame.command === "get_state" || frame.command === "set_plan_mode") {
			return { ...nextState, session: frame.data };
		}
		if (frame.command === "get_messages") {
			return { ...nextState, messages: frame.data.messages };
		}
		if (frame.command === "set_todos") {
			return nextState.session
				? {
						...nextState,
						session: { ...nextState.session, todoPhases: frame.data.todoPhases },
					}
				: nextState;
		}
		return nextState;
	}

	if (frame.type === "pending_action_added") {
		return state.session
			? {
					...state,
					session: {
						...state.session,
						pendingActions: [
							frame.action,
							...state.session.pendingActions.filter(action => action.id !== frame.action.id),
						],
						activePendingActionId: frame.action.id,
					},
				}
			: state;
	}

	if (frame.type === "pending_action_resolved") {
		return state.session
			? {
					...state,
					session: {
						...state.session,
						pendingActions: state.session.pendingActions.filter(action => action.id !== frame.actionId),
						activePendingActionId:
							state.session.activePendingActionId === frame.actionId
								? state.session.pendingActions.find(action => action.id !== frame.actionId)?.id
								: state.session.activePendingActionId,
					},
				}
			: state;
	}

	if (!isAgentEvent(frame)) {
		return state;
	}

	if (frame.type === "message_update") {
		return {
			...state,
			streamingMessage: frame.message,
		};
	}

	if (frame.type === "message_end") {
		return {
			...state,
			messages: appendMessage(state.messages, frame.message),
			streamingMessage: null,
		};
	}

	if (frame.type === "tool_execution_start") {
		return {
			...state,
			toolExecutions: replaceToolExecution(state.toolExecutions, {
				toolCallId: frame.toolCallId,
				toolName: frame.toolName,
				args: frame.args,
				intent: frame.intent,
				status: "running",
			}),
		};
	}

	if (frame.type === "tool_execution_update") {
		const current = state.toolExecutions.find(entry => entry.toolCallId === frame.toolCallId);
		return {
			...state,
			toolExecutions: replaceToolExecution(state.toolExecutions, {
				toolCallId: frame.toolCallId,
				toolName: frame.toolName,
				args: frame.args,
				intent: current?.intent,
				status: "running",
				partialResult: frame.partialResult,
				result: current?.result,
			}),
		};
	}

	if (frame.type === "tool_execution_end") {
		const current = state.toolExecutions.find(entry => entry.toolCallId === frame.toolCallId);
		return {
			...state,
			toolExecutions: replaceToolExecution(state.toolExecutions, {
				toolCallId: frame.toolCallId,
				toolName: frame.toolName,
				args: current?.args,
				intent: current?.intent,
				status: frame.isError ? "error" : "completed",
				partialResult: current?.partialResult,
				result: frame.result,
			}),
		};
	}

	if (frame.type === "agent_end") {
		return {
			...state,
			messages: frame.messages,
			streamingMessage: null,
		};
	}

	return state;
}

export function isPromptingRequest(request: RpcExtensionUIRequest | null): request is RpcExtensionUIRequest {
	return (
		!!request &&
		request.method !== "cancel" &&
		request.method !== "notify" &&
		request.method !== "setStatus" &&
		request.method !== "setWidget"
	);
}

export function createExtensionResponse(
	request: RpcExtensionUIRequest,
	value: string | boolean | { cancelled: true },
): RpcExtensionUIResponse {
	if (typeof value === "string") {
		return { type: "extension_ui_response", id: request.id, value };
	}
	if (typeof value === "boolean") {
		return { type: "extension_ui_response", id: request.id, confirmed: value };
	}
	return { type: "extension_ui_response", id: request.id, cancelled: true };
}
