import type { DesktopApi } from "../common";

declare global {
	interface Window {
		ompDesktop: DesktopApi;
	}
}

export {};
