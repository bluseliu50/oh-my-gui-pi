import * as path from "node:path";
import { BrowserWindow, app, ipcMain } from "electron";
import { DesktopBackendClient } from "./backend-launch";
import {
	DESKTOP_FRAME_CHANNEL,
	DESKTOP_GET_BOOTSTRAP_CHANNEL,
	DESKTOP_REQUEST_CHANNEL,
	type DesktopBootstrap,
	type DesktopCommand,
	type DesktopCommandResponse,
} from "./common";
import { enMessages } from "./i18n/en";

const currentDir = path.dirname(path.resolve(process.argv[1] || process.execPath));
const rendererEntry = path.join(currentDir, "renderer", "index.html");
const preloadEntry = path.join(currentDir, "preload.cjs");
const backendEntry = path.join(currentDir, "backend.js");

const backend = new DesktopBackendClient();
let mainWindow: BrowserWindow | null = null;

backend.onFrame(frame => {
	const window = mainWindow;
	if (!window || window.isDestroyed()) return;
	window.webContents.send(DESKTOP_FRAME_CHANNEL, frame);
});

async function buildBootstrap(): Promise<DesktopBootstrap> {
	const [stateResponse, messagesResponse] = await Promise.all([
		backend.request({ type: "get_state" }),
		backend.request({ type: "get_messages" }),
	]);

	if (!stateResponse.success || stateResponse.command !== "get_state") {
		throw new Error(stateResponse.success ? "Unexpected state response." : stateResponse.error);
	}
	if (!messagesResponse.success || messagesResponse.command !== "get_messages") {
		throw new Error(messagesResponse.success ? "Unexpected messages response." : messagesResponse.error);
	}

	return {
		backendStatus: backend.status,
		state: stateResponse.data,
		messages: messagesResponse.data.messages,
	};
}

async function handleDesktopRequest(command: DesktopCommand): Promise<DesktopCommandResponse> {
	return backend.request(command);
}

async function createMainWindow(): Promise<BrowserWindow> {
	await backend.start({ backendEntry, cwd: process.cwd() });
	const window = new BrowserWindow({
		title: enMessages.windowTitle,
		width: 1600,
		height: 1000,
		minWidth: 1200,
		minHeight: 720,
		backgroundColor: "#0b1020",
		webPreferences: {
			contextIsolation: true,
			nodeIntegration: false,
			sandbox: true,
			preload: preloadEntry,
		},
	});
	mainWindow = window;
	await window.loadFile(rendererEntry);
	if (process.env.OMP_DESKTOP_DEVTOOLS === "1") {
		window.webContents.openDevTools({ mode: "detach" });
	}
	window.on("closed", () => {
		if (mainWindow === window) {
			mainWindow = null;
		}
	});
	return window;
}

ipcMain.handle(DESKTOP_GET_BOOTSTRAP_CHANNEL, async () => buildBootstrap());
ipcMain.handle(DESKTOP_REQUEST_CHANNEL, async (_event, command: DesktopCommand) => handleDesktopRequest(command));

app.whenReady().then(async () => {
	await createMainWindow();
	app.on("activate", async () => {
		if (BrowserWindow.getAllWindows().length === 0) {
			await createMainWindow();
		}
	});
});

app.on("window-all-closed", () => {
	if (process.platform !== "darwin") {
		app.quit();
	}
});

app.on("before-quit", () => {
	void backend.stop();
});
