import { MarkdownView, Plugin, TFile } from "obsidian";
import { DEFAULT_FORMATS } from "./constants";
import type { NoteTypeConfig, PluginSettings } from "./types";
import {
	applyTemplateTransformations,
	getNotePath,
	getTemplateContents,
	type MomentLike,
} from "./utils";

/**
 * First-run settings. Empty `types` list triggers the seed in `onload`; a
 * deliberate empty registry (user deleted every type) is NOT reseeded because
 * the seed only runs while `types.length === 0`.
 */
const DEFAULT_SETTINGS: PluginSettings = { types: [] };

/** id of the seeded "work" type and its command id's stable suffix. */
const WORK_TYPE_ID = "work";

export default class PeriodicTypesPlugin extends Plugin {
	// Field-initialized to the empty default; loadSettings replaces it in onload.
	settings: PluginSettings = DEFAULT_SETTINGS;

	async onload(): Promise<void> {
		await this.loadSettings();
		await this.seedWorkTypeIfFirstRun();
		this.registerWorkCommand();
	}

	onunload() {}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	/**
	 * Seed the plugin's single `work` type on first run so there is a real
	 * command out of the box. `format` stays `""` so it falls back to
	 * `DEFAULT_FORMATS.day` at open time.
	 */
	private async seedWorkTypeIfFirstRun(): Promise<void> {
		if (this.settings.types.length === 0) {
			this.settings.types = [
				{
					id: WORK_TYPE_ID,
					name: "Work",
					enabled: true,
					granularity: "day",
					folder: "Work",
					format: "",               // → falls back to DEFAULT_FORMATS.day
					templatePath: "",
					openAtStartup: false,
				},
			];
			await this.saveSettings();
		}
	}

	/** The one Stage-3 command: "Open today's Work note". */
	private registerWorkCommand(): void {
		const workType = this.settings.types.find((t) => t.id === WORK_TYPE_ID);
		if (!workType) {
			// Shouldn't happen after the seed; no-op if the type is missing.
			return;
		}
		this.addCommand({
			id: "open-today-work-note",
			name: "Open today's Work note",
			callback: () => this.openNote(workType, window.moment()),
		});
	}

	async openNote(type: NoteTypeConfig, date: MomentLike): Promise<void> {
		const filename = date.format(type.format || DEFAULT_FORMATS[type.granularity]);
		const path = await getNotePath(this.app, filename, type);
		let file = this.app.vault.getAbstractFileByPath(path);
		if (!file) {
			file = await this.createNote(type, date, filename, path);
			// createNote may have raced and failed-as-already-exists → re-fetch.
			if (!file) file = this.app.vault.getAbstractFileByPath(path);
		}
		// Guard against a FOLDER occupying the path; open existing tab if already shown.
		if (!(file instanceof TFile)) return;

		// Stamp-if-missing: a pre-existing (e.g. hand-made) note at the type's
		// exact path is claimed by this type — `type:` is always present so
		// Dataview queries stay reliable even for non-plugin-created files.
		await this.stampFrontmatterIfMissing(file, { type: type.id, date: filename });

		const existing = this.app.workspace
			.getLeavesOfType("markdown")
			.find(
				(l) =>
					l.view instanceof MarkdownView && l.view.file?.path === file.path
			);
		if (existing) {
			this.app.workspace.setActiveLeaf(existing);
			return;
		}
		this.app.workspace.getLeaf(false).openFile(file);
	}

	async createNote(
		type: NoteTypeConfig,
		date: MomentLike,
		filename: string,
		destPath: string
	): Promise<TFile | null> {
		const raw = await getTemplateContents(this.app, type.templatePath);
		const body = applyTemplateTransformations(filename, date, raw);
		try {
			// `vault.create` (NOT createNewMarkdownFile) so we control the path.
			const file = await this.app.vault.create(destPath, body);
			await this.app.fileManager.processFrontMatter(file, (fm) => {
				fm.type = type.id; // per-type queryability (Dataview)
				fm.date = filename;
			});
			return file;
		} catch {
			// "already exists" from a concurrent open → return null; caller re-fetches.
			return null;
		}
	}

	/**
	 * Idempotent frontmatter stamp: write `type`/`date` only when absent so a
	 * hand-made note at the type's path is claimed, but a plugin-created or
	 * already-typed note is never rewritten on re-open.
	 */
	private async stampFrontmatterIfMissing(
		file: TFile,
		matter: { type: string; date: string }
	): Promise<void> {
		await this.app.fileManager.processFrontMatter(file, (fm) => {
			if (fm.type === undefined) fm.type = matter.type;
			if (fm.date === undefined) fm.date = matter.date;
		});
	}
}