export interface PendingActionSummary {
	id: string;
	label: string;
	sourceToolName: string;
	createdAt: number;
	files?: string[];
	diff?: string;
}
