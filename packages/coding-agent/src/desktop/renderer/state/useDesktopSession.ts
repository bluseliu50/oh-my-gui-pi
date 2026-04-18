import { useEffect, useMemo, useState } from "react";
import type { DesktopBootstrap } from "../../common";
import {
	createDesktopInitialState,
	createExtensionResponse,
	isPromptingRequest,
	reduceDesktopFrame,
	type DesktopState,
} from "./store";

export interface UseDesktopSessionResult {
	state: DesktopState | null;
	loading: boolean;
	error: string | null;
	refresh(): Promise<void>;
	sendPrompt(message: string): Promise<void>;
	respondToExtensionRequest(value: string | boolean | { cancelled: true }): Promise<void>;
}

export function useDesktopSession(): UseDesktopSessionResult {
	const [bootstrap, setBootstrap] = useState<DesktopBootstrap | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [state, setState] = useState<DesktopState | null>(null);

	const refresh = useMemo(
		() => async () => {
			try {
				setLoading(true);
				const nextBootstrap = await window.ompDesktop.getBootstrap();
				setBootstrap(nextBootstrap);
				setState(createDesktopInitialState(nextBootstrap));
				setError(null);
			} catch (nextError) {
				setError(nextError instanceof Error ? nextError.message : String(nextError));
			} finally {
				setLoading(false);
			}
		},
		[],
	);

	useEffect(() => {
		void refresh();
		const unsubscribe = window.ompDesktop.subscribe(frame => {
			setState(current => (current ? reduceDesktopFrame(current, frame) : current));
		});
		return unsubscribe;
	}, [refresh]);

	const sendPrompt = async (message: string): Promise<void> => {
		const response = await window.ompDesktop.request({ type: "prompt", message });
		setState(current => (current ? reduceDesktopFrame(current, response) : current));
		if (!response.success) {
			throw new Error(response.error);
		}
	};

	const respondToExtensionRequest = async (value: string | boolean | { cancelled: true }): Promise<void> => {
		const currentState = state;
		if (!currentState || !isPromptingRequest(currentState.activeExtensionRequest)) {
			return;
		}
		const response = createExtensionResponse(currentState.activeExtensionRequest, value);
		await window.ompDesktop.request(response);
		setState(current =>
			current
				? {
					...current,
					activeExtensionRequest: null,
				}
				: current,
		);
	};

	return {
		state,
		loading,
		error,
		refresh,
		sendPrompt,
		respondToExtensionRequest,
	};
}
