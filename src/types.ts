export type Granularity = "day" | "week" | "month" | "quarter" | "year";

export interface NoteTypeConfig {
	id: string;           // "work", "personal", "journal", ... unique
	name: string;         // "Work" (human-facing, used in command/labels)
	enabled: boolean;
	granularity: Granularity;
	folder: string;       // "Work"
	format: string;       // "YYYY-MM-DD"  → filename
	templatePath: string; // "Templates/work.md"
	openAtStartup: boolean;
}

export interface PluginSettings { types: NoteTypeConfig[]; }
