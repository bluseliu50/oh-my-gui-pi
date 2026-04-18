import type { AgentMessage } from "@oh-my-pi/pi-agent-core";
import type {
	RpcCommand,
	RpcExtensionUIRequest,
	RpcExtensionUIResponse,
	RpcHostToolCallRequest,
	RpcHostToolCancelRequest,
	RpcResponse,
	RpcSessionState,
} from "../modes/rpc/rpc-types";
import type { AgentSessionEvent } from "../session/agent-session";

export const DESKTOP_FRAME_CHANNEL = "omp-desktop:frame";
export const DESKTOP_GET_BOOTSTRAP_CHANNEL = "omp-desktop:get-bootstrap";
export const DESKTOP_REQUEST_CHANNEL = "omp-desktop:request";

export type DesktopBackendStatus = "starting" | "ready" | "stopped" | "error";

export interface DesktopStatusFrame {
	type: "backend_status";
	status: DesktopBackendStatus;
	error?: string;
}

export type DesktopBackendFrame =
	| { type: "ready" }
	| DesktopStatusFrame
	| AgentSessionEvent
	| RpcExtensionUIRequest
	| RpcHostToolCallRequest
	| RpcHostToolCancelRequest
	| RpcResponse
	| Record<string, unknown>;

export interface DesktopSlashCommand {
	name: string;
	description: string;
	kind: "builtin" | "extension" | "custom" | "skill" | "prompt";
	source: string;
}

export interface DesktopBootstrap {
	backendStatus: DesktopBackendStatus;
	state: RpcSessionState;
	messages: AgentMessage[];
	slashCommands: DesktopSlashCommand[];
}

export type DesktopCommand = RpcCommand | RpcExtensionUIResponse;
export type DesktopCommandResponse =
	| RpcResponse
	| { type: "response"; command: "extension_ui_response"; success: true };

export interface DesktopApi {
	getBootstrap(): Promise<DesktopBootstrap>;
	request(command: DesktopCommand): Promise<DesktopCommandResponse>;
	subscribe(listener: (frame: DesktopBackendFrame) => void): () => void;
}
