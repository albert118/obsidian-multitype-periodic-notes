import { Events, MarkdownView, Notice, Plugin, TFile } from 'obsidian';
import { DEFAULT_FORMATS, makeWorkSeed } from './constants';
import type { NoteTypeConfig, PluginSettings } from './types';
import { NoteTypeSettingTab } from './settings';
import { NotePickerModal } from './picker';
import { getNotePath, getTemplateContents, renderNoteTemplate, type MomentLike } from './utils';

/**
 * First-run settings. An empty `types` list is invalid by design: onload seeds
 * the default `work` type whenever the list is empty. That covers the true first
 * run (no data.json), a stale/empty data.json, and a delete-all reset whose save
 * raced — all recover to the same seeded state, no marker.
 */
const DEFAULT_SETTINGS: PluginSettings = { types: [] };

/** id of the shared "Open periodic note…" command (stable, never removed). */
const PICKER_COMMAND_ID = 'open-periodic-picker';

/** Narrowed frontmatter shape used by the stamp helpers (the obsidian typing is `any`). */
type FrontMatterRecord = Record<string, unknown>;

/** The four failure surfaces that surface a user-facing Notice, keyed by kind. */
export type NoteErrorKind = 'folder' | 'create' | 'stamp' | 'open';

export interface NoteErrorContext {
    typeId: string;
    date: string;
    path: string;
}

export function describeNoteError(kind: NoteErrorKind, ctx: NoteErrorContext): string {
    switch (kind) {
        case 'folder':
            return `Couldn't create the folder for the '${ctx.typeId}' note at '${ctx.path}' (${ctx.date}).`;
        case 'create':
            return `Couldn't create the '${ctx.typeId}' note at '${ctx.path}' (${ctx.date}). Check the filename format and folder.`;
        case 'stamp':
            return `Couldn't write frontmatter for the '${ctx.typeId}' note at '${ctx.path}' — check the note's YAML.`;
        case 'open':
            return `Couldn't open the '${ctx.typeId}' note at '${ctx.path}'.`;
    }
}

export function handleNoteError(kind: NoteErrorKind, ctx: NoteErrorContext, error: unknown): void {
    console.error(`[periodic-types] ${kind} — type: ${ctx.typeId}, date: ${ctx.date}, path: ${ctx.path}`, error);
    new Notice(describeNoteError(kind, ctx));
}

function isAlreadyExistsError(error: unknown): boolean {
    return error instanceof Error && /already exists/i.test(error.message);
}

/**
 * Idempotent frontmatter stamp: write `type`/`date` only when absent so a
 * hand-made note at the type's path is claimed, but a plugin-created or
 * already-typed note is never rewritten on re-open.
 */
function stampFrontmatterIfMissing(fm: FrontMatterRecord, matter: { type: string; date: string }): void {
    if (fm.type === undefined) fm.type = matter.type;
    if (fm.date === undefined) fm.date = matter.date;
}

export default class PeriodicTypesPlugin extends Plugin {
    // Field-initialized to the empty default; loadSettings replaces it in onload.
    settings: PluginSettings = DEFAULT_SETTINGS;

    // Exactly the command ids (without the `periodic-types:` prefix) this plugin
    // currently has registered. Drives the add/remove diff in configureCommands.
    registeredCommandIds: Set<string> = new Set();

    async onload(): Promise<void> {
        await this.loadSettings();
        await this.seedWorkTypeIfEmpty();
        this.addSettingTab(new NoteTypeSettingTab(this.app, this));
        this.configureCommands();
        // openAtStartup is gated on "layout-ready" so it fires on a real app
        // launch, not on plugin reload/disable-toggle (which also runs onload).
        // "layout-ready" is a real Obsidian workspace event but is not in the
        // typed Workspace event union, so we subscribe via the base Events.on.
        if (this.settings.types.some(type => type.openAtStartup)) {
            const events: Events = this.app.workspace;
            this.registerEvent(
                events.on('layout-ready', () => {
                    for (const type of this.settings.types) {
                        if (type.enabled && type.openAtStartup) {
                            void this.openNote(type, window.moment());
                        }
                    }
                }),
            );
        }
    }

    onunload() {}

    async loadSettings(): Promise<void> {
        const data = (await this.loadData()) as Partial<PluginSettings> | undefined;
        this.settings = { ...DEFAULT_SETTINGS, ...(data ?? {}) };
    }

    async saveSettings(): Promise<void> {
        await this.saveData(this.settings);
    }

    /**
     * Seed the plugin's single `work` type when the registry is empty so there
     * is a real command out of the box. Covers the true first run (no data.json),
     * a stale/empty data.json, and a delete-all reset whose save raced. `format`
     * stays `""` so it falls back to `DEFAULT_FORMATS.day` at open time.
     */
    private async seedWorkTypeIfEmpty(): Promise<void> {
        if (this.settings.types.length === 0) {
            this.settings.types = [makeWorkSeed()];
            await this.saveSettings();
        }
    }

    /**
     * Command lifecycle. Do NOT rely on `addCommand` being idempotent/overwriting
     * (unverified and load-bearing — an earlier bug orphaned commands). Instead we
     * diff `registeredCommandIds` against the desired set: `removeCommand` for ids
     * no longer wanted, `addCommand` only for ids not already registered. This
     * keeps palettes/hotkeys clean when a type is added, disabled, renamed, or
     * deleted, without re-creating bindings on every settings save.
     */
    configureCommands(): void {
        const desired = new Set<string>();
        for (const type of this.settings.types) {
            if (type.enabled) desired.add(`open-today-${type.id}-note`);
        }
        // The picker is always desired, so it is never removed. Added BEFORE the
        // remove loop below — the loop must see it in `desired` or a second call
        // would prune the picker and never re-register it.
        desired.add(PICKER_COMMAND_ID);

        // Remove ids that are no longer desired (disabled/deleted/renamed types).
        // Only ids from the previous registration set can ever be removed, so we
        // never touch commands owned by other plugins.
        for (const id of this.registeredCommandIds) {
            if (!desired.has(id)) {
                this.removeCommand(`periodic-types:${id}`);
            }
        }

        // Add only ids that are new or newly re-enabled (not already registered).
        for (const type of this.settings.types) {
            if (!type.enabled) continue;
            const id = `open-today-${type.id}-note`;
            if (this.registeredCommandIds.has(id)) continue;
            this.addCommand({
                id,
                name: `Open today's ${type.id} note`,
                callback: () => this.openNote(type, window.moment()),
            });
        }

        // The single global picker: two-step type → period selection.
        if (!this.registeredCommandIds.has(PICKER_COMMAND_ID)) {
            this.addCommand({
                id: PICKER_COMMAND_ID,
                name: 'Open periodic note…',
                callback: () => {
                    new NotePickerModal(this.app, this).open();
                },
            });
        }

        this.registeredCommandIds = desired;
    }

    async openNote(type: NoteTypeConfig, date: MomentLike): Promise<void> {
        // Guaranteed non-rejecting: every call site (command callback, layout-ready,
        // picker) fires-and-forgets via `void`, so no path here may reject.
        let filename = '';
        let path = '';
        try {
            filename = date.format(type.format || DEFAULT_FORMATS[type.granularity]);
            path = await getNotePath(this.app, filename, type);
        } catch (error) {
            handleNoteError('folder', { typeId: type.id, date: filename, path }, error);
            return;
        }

        let file = this.app.vault.getAbstractFileByPath(path);
        if (!file) {
            try {
                file = await this.createNote(type, date, filename, path);
            } catch (error) {
                // createNote rethrew a non "already exists" error — re-check the
                // path in case another call won the race, else surface the failure.
                const raced = this.app.vault.getAbstractFileByPath(path);
                if (raced instanceof TFile) {
                    file = raced;
                } else {
                    handleNoteError('create', { typeId: type.id, date: filename, path }, error);
                    return;
                }
            }
            // createNote may have raced and failed-as-already-exists → re-fetch.
            if (!file) file = this.app.vault.getAbstractFileByPath(path);
        }

        // Guard against a FOLDER occupying the path (upgraded from a silent no-op).
        if (!(file instanceof TFile)) {
            new Notice(`Can't open the '${type.id}' note — a folder occupies the path '${file?.path ?? path}'.`);
            return;
        }

        // Stamp-if-missing: a pre-existing (e.g. hand-made) note at the type's
        // exact path is claimed by this type — `type:` is always present so
        // Dataview queries stay reliable even for non-plugin-created files. A
        // stamp failure is surfaced but never blocks opening the note.
        try {
            await this.app.fileManager.processFrontMatter(file, fm => {
                stampFrontmatterIfMissing(fm as FrontMatterRecord, {
                    type: type.id,
                    date: filename,
                });
            });
        } catch (error) {
            handleNoteError('stamp', { typeId: type.id, date: filename, path: file.path }, error);
        }

        // Reuse an already-open markdown leaf, else open a new one. Wrapped so
        // an open failure is surfaced instead of rejecting a fire-and-forget call.
        try {
            const existing = this.app.workspace
                .getLeavesOfType('markdown')
                .find(l => l.view instanceof MarkdownView && l.view.file?.path === file.path);
            if (existing) {
                this.app.workspace.setActiveLeaf(existing);
                return;
            }
            await this.app.workspace.getLeaf(false).openFile(file);
        } catch (error) {
            handleNoteError('open', { typeId: type.id, date: filename, path: file.path }, error);
        }
    }

    async createNote(
        type: NoteTypeConfig,
        date: MomentLike,
        filename: string,
        destPath: string,
    ): Promise<TFile | null> {
        const raw = await getTemplateContents(this.app, type.templatePath);
        const body = await renderNoteTemplate(this.app, filename, date, raw);
        let file: TFile;
        try {
            // `vault.create` (NOT createNewMarkdownFile) so we control the path.
            file = await this.app.vault.create(destPath, body);
        } catch (error) {
            // "already exists" from a concurrent open → return null; caller re-fetches.
            // Anything else propagates so openNote's create handling can surface it.
            if (isAlreadyExistsError(error)) return null;
            throw error;
        }
        try {
            await this.app.fileManager.processFrontMatter(file, fm => {
                const matter = fm as FrontMatterRecord;
                matter.type = type.id; // per-type queryability (Dataview)
                matter.date = filename;
            });
        } catch {
            // The note exists but is unstamped; openNote opens it and its own
            // stamp catch produces a single user-facing Notice — never a silent
            // created-but-unstamped file.
        }
        return file;
    }
}
