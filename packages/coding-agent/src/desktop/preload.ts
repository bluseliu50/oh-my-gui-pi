import { contextBridge, ipcRenderer } from "electron";
import {
	DESKTOP_FRAME_CHANNEL,
	DESKTOP_GET_BOOTSTRAP_CHANNEL,
	DESKTOP_REQUEST_CHANNEL,
	type DesktopApi,
	type DesktopBackendFrame,
	type DesktopCommand,
} from "./common";

const desktopApi: DesktopApi = {
	getBootstrap: () => ipcRenderer.invoke(DESKTOP_GET_BOOTSTRAP_CHANNEL),
	request: (command: DesktopCommand) => ipcRenderer.invoke(DESKTOP_REQUEST_CHANNEL, command),
	subscribe(listener: (frame: DesktopBackendFrame) => void): () => void {
		const handler = (_event: unknown, frame: DesktopBackendFrame) => listener(frame);
		ipcRenderer.on(DESKTOP_FRAME_CHANNEL, handler);
		return () => {
			ipcRenderer.removeListener(DESKTOP_FRAME_CHANNEL, handler);
		};
	},
};

contextBridge.exposeInMainWorld("ompDesktop", desktopApi);
