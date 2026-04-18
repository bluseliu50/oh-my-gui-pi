export interface DesktopMessages {
	windowTitle: string;
	appTitle: string;
	appSubtitle: string;
	backendConnecting: string;
	backendError: string;
	backendReady: string;
	sessionLabel: string;
	modelLabel: string;
	messageCountLabel: string;
	statusStreaming: string;
	statusIdle: string;
	conversationTitle: string;
	conversationEmpty: string;
	streamingTitle: string;
	streamingEmpty: string;
	promptPlaceholder: string;
	submitPrompt: string;
	submitPromptBusy: string;
	rightPanelTitle: string;
	rightPanelDescription: string;
	toolStateTitle: string;
	backendStatusTitle: string;
	roleUser: string;
	roleAssistant: string;
	roleTool: string;
	roleSystem: string;
	roleCustom: string;
	unknownModel: string;
}

export function createTranslator(messages: DesktopMessages) {
	return (key: keyof DesktopMessages): string => messages[key];
}
