import type { Granularity, NoteTypeConfig } from "./types";

export const DEFAULT_FORMATS: Record<Granularity, string> = Object.freeze({
	day: "YYYY-MM-DD",
	week: "gggg-[W]ww",
	month: "YYYY-MM",
	quarter: "YYYY-[Q]Q",
	year: "YYYY",
});

export const DEFAULT_NOTE_TYPE: Omit<NoteTypeConfig, "id" | "name"> = Object.freeze({
	enabled: true,
	granularity: "day",
	folder: "",
	format: "",           // falls back to DEFAULT_FORMATS[granularity]
	templatePath: "",
	openAtStartup: false,
});

/** Id must be command/hotkey/frontmatter-safe. Not user-editable once set. */
export const NOTE_TYPE_ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Slug a display name into a command/frontmatter-safe id. */
export function slug(name: string): string {
	return name.toLowerCase().trim()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}
