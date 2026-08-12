import { Notice, normalizePath as obsidianNormalizePath } from "obsidian";
import type { NoteTypeConfig } from "./types";

/**
 * Minimal shape of a moment instance. The real obsidian `Moment` satisfies it
 * structurally, so token substitution stays pure and testable with an injected
 * stub instead of Obsidian's `window.moment`.
 */
export interface MomentLike {
	format(format: string): string;
}

/** Minimal vault surface used by the path helpers (real `App.vault` satisfies it). */
export interface VaultLike {
	getAbstractFileByPath(path: string): unknown;
	createFolder(path: string): Promise<unknown>;
}

/** Minimal app surface used by the path helpers (real `App` satisfies it). */
export interface AppLike {
	vault: VaultLike;
}

/** Minimal metadataCache surface used by getTemplateContents. */
interface TemplateMetadataCacheLike {
	getFirstLinkpathDest(path: string, sourcePath: string): unknown;
}

/** Minimal vault surface used by getTemplateContents. */
interface TemplateVaultLike {
	cachedRead(file: unknown): Promise<string>;
}

/** Minimal app surface used by getTemplateContents. */
interface TemplateAppLike {
	metadataCache: TemplateMetadataCacheLike;
	vault: TemplateVaultLike;
}

/**
 * Join path segments with "/" only (posix-safe; never emits "\" on Windows).
 * Edge slashes are trimmed per segment so empty/root folders join cleanly.
 */
function joinPosix(...parts: string[]): string {
	return parts
		.filter((part) => part !== "")
		.map((part) => part.replace(/^\/+|\/+$/g, ""))
		.filter((part) => part !== "")
		.join("/");
}

/**
 * Single path-normalization helper for the note-path pipeline. Mirrors
 * obsidian's documented `normalizePath` (backslash -> "/", collapse duplicate
 * slashes, strip leading/trailing slashes) without importing obsidian, so the
 * path helpers stay Layer-1 testable. getNotePath, ensureFolderExists, and the
 * Stage 5 rendered-path collision guard all flow through this one helper.
 */
function normalizePath(path: string): string {
	return path
		.replace(/\\/g, "/")
		.replace(/\/{2,}/g, "/")
		.replace(/^\/+|\/+$/g, "");
}

/**
 * Resolve the vault-absolute path for a note named `filename` inside `folder`.
 * THE shared path helper: getNotePath and the future rendered-path collision
 * guard must both use this so guard and runtime can never disagree.
 */
export function resolveNotePath(folder: string, filename: string): string {
	return normalizePath(joinPosix(folder, `${filename}.md`));
}

/**
 * Ensure every parent folder of `path` exists, creating missing folders via
 * `app.vault.createFolder`. Idempotent: a path that already resolves is skipped.
 */
export async function ensureFolderExists(app: AppLike, path: string): Promise<void> {
	const dirs = path.split("/");
	dirs.pop(); // the final segment is the file name
	let dirPath = "";
	for (const dir of dirs) {
		if (dir === "") continue;
		dirPath = dirPath === "" ? dir : `${dirPath}/${dir}`;
		if (!app.vault.getAbstractFileByPath(dirPath)) {
			await app.vault.createFolder(dirPath);
		}
	}
}

/** Resolve and ensure the folder for a note, returning its vault path. */
export async function getNotePath(
	app: AppLike,
	filename: string,
	type: Pick<NoteTypeConfig, "folder">
): Promise<string> {
	const path = resolveNotePath(type.folder, filename);
	await ensureFolderExists(app, path);
	return path;
}

/**
 * Substitute template tokens. `{{date}}` and `{{title}}` become the already-
 * formatted `filename`; `{{time}}` becomes the injected `date` formatted as
 * "HH:mm" (the injected date, not `window.moment()`, keeps this pure).
 */
export function applyTemplateTransformations(
	filename: string,
	date: MomentLike,
	templateContents: string
): string {
	return templateContents
		.replace(/{{\s*date\s*}}/gi, filename)
		.replace(/{{\s*time\s*}}/gi, date.format("HH:mm"))
		.replace(/{{\s*title\s*}}/gi, filename);
}

/**
 * Read a template's contents, or "" when the path is empty/root, the file
 * cannot be resolved, or reading fails (a Notice is shown in those cases).
 */
export async function getTemplateContents(
	app: TemplateAppLike,
	templatePath: string
): Promise<string> {
	if (templatePath === "" || templatePath === "/") return "";
	const file = app.metadataCache.getFirstLinkpathDest(
		obsidianNormalizePath(templatePath),
		""
	);
	if (!file) {
		new Notice(`Failed to read the template '${templatePath}'`);
		return "";
	}
	try {
		return await app.vault.cachedRead(file);
	} catch {
		new Notice(`Failed to read the template '${templatePath}'`);
		return "";
	}
}
