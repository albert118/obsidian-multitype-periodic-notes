import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import PeriodicTypesPlugin from '../src/main';
import { DEFAULT_NOTE_TYPE } from '../src/constants';
import { MarkdownView, TFile, TFolder } from 'obsidian';
import type { App, PluginManifest } from 'obsidian';
import type { NoteTypeConfig } from '../src/types';
import type { MomentLike } from '../src/utils';

/** Captured Notice messages, hoisted so the (also-hoisted) obsidian mock writes
 *  to the same array the assertions read. */
const { noticeMessages } = vi.hoisted(() => ({ noticeMessages: [] as string[] }));

vi.mock('obsidian', () => {
    class Plugin {
        app: unknown;
        addCommand = vi.fn();
        removeCommand = vi.fn();
        registerEvent = vi.fn();
        loadData = vi.fn();
        saveData = vi.fn();
        constructor(app?: unknown, _manifest?: unknown) {
            this.app = app;
        }
    }
    class TFile {
        basename = '';
        extension = 'md';
        path = '';
    }
    class TFolder {
        path = '';
    }
    class SuggestModal {
        constructor(_app: unknown) {}
    }
    class MarkdownView {
        file: unknown = null;
        constructor(file?: unknown) {
            this.file = file ?? null;
        }
    }
    class Setting {
        constructor(_containerEl: unknown) {}
    }
    class PluginSettingTab {
        constructor(_app?: unknown, _plugin?: unknown) {}
    }
    class Notice {
        constructor(message: string) {
            noticeMessages.push(message);
        }
    }
    return {
        Events: class {
            on(_name: string, _cb: (...data: unknown[]) => unknown) {
                return { ref: true };
            }
        },
        Plugin,
        TFile,
        TFolder,
        Notice,
        normalizePath: vi.fn((path: string) => path),
        SuggestModal,
        MarkdownView,
        Setting,
        PluginSettingTab,
    };
});

interface VaultDouble {
    getAbstractFileByPath: Mock;
    createFolder: Mock;
    create: Mock;
    cachedRead: Mock;
}

interface WorkspaceDouble {
    getLeavesOfType: Mock;
    setActiveLeaf: Mock;
    getLeaf: Mock;
    on: Mock;
}

interface AppDouble {
    vault: VaultDouble;
    fileManager: { processFrontMatter: Mock };
    workspace: WorkspaceDouble;
    metadataCache: { getFirstLinkpathDest: Mock };
    plugins: Record<string, unknown>;
}

const makeNoteType = (overrides: Partial<NoteTypeConfig> = {}): NoteTypeConfig => ({
    ...DEFAULT_NOTE_TYPE,
    id: 'work',
    name: 'Work',
    folder: 'Work',
    ...overrides,
});

const makeDate = (filename = '2026-08-12', time = '09:30'): MomentLike => ({
    format: vi.fn((format: string) => (format === 'HH:mm' ? time : filename)),
});

const makeApp = (overrides: Partial<AppDouble> = {}): AppDouble => {
    const app: AppDouble = {
        vault: {
            getAbstractFileByPath: vi.fn().mockReturnValue(null),
            createFolder: vi.fn().mockResolvedValue(undefined),
            create: vi.fn().mockResolvedValue(null),
            cachedRead: vi.fn().mockResolvedValue(''),
        },
        fileManager: { processFrontMatter: vi.fn().mockResolvedValue(undefined) },
        workspace: {
            getLeavesOfType: vi.fn().mockReturnValue([]),
            setActiveLeaf: vi.fn(),
            getLeaf: vi.fn().mockReturnValue({ openFile: vi.fn().mockResolvedValue(undefined) }),
            on: vi.fn().mockReturnValue(() => {}),
        },
        metadataCache: { getFirstLinkpathDest: vi.fn().mockReturnValue(null) },
        plugins: {},
    };
    return Object.assign(app, overrides);
};

const makePlugin = (type: NoteTypeConfig, app: AppDouble): PeriodicTypesPlugin => {
    const plugin = new PeriodicTypesPlugin(app as unknown as App, {} as PluginManifest);
    plugin.settings = { types: [type] };
    return plugin;
};

/** A processFrontMatter double that runs its callback against `matter`. */
const matterProcessor = (matter: Record<string, unknown>): { processFrontMatter: Mock } => ({
    processFrontMatter: vi.fn((_file: unknown, fn: (fm: Record<string, unknown>) => void) => {
        fn(matter);
        return Promise.resolve();
    }),
});

beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    noticeMessages.length = 0;
    // handleNoteError logs via console.error; silence it so it doesn't pollute
    // the test output.
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('openNote — create path', () => {
    it('should create a note at the rendered path with stamped type and date', async () => {
        const type = makeNoteType();
        const file = new TFile();
        file.path = 'Work/2026-08-12.md';
        const matter: Record<string, unknown> = {};
        const app = makeApp({
            vault: {
                getAbstractFileByPath: vi.fn().mockReturnValue(null),
                createFolder: vi.fn().mockResolvedValue(undefined),
                create: vi.fn().mockResolvedValue(file),
                cachedRead: vi.fn().mockResolvedValue(''),
            },
            fileManager: matterProcessor(matter),
        });
        const plugin = makePlugin(type, app);

        await plugin.openNote(type, makeDate());

        expect(app.vault.create).toHaveBeenCalledWith('Work/2026-08-12.md', '');
        expect(matter.type).toBe('work');
        expect(matter.date).toBe('2026-08-12');
        expect(app.workspace.getLeaf).toHaveBeenCalledWith(false);
    });

    it('should substitute template tokens into the created body', async () => {
        const type = makeNoteType({ templatePath: 'Templates/work.md' });
        const file = new TFile();
        file.path = 'Work/2026-08-12.md';
        const app = makeApp({
            vault: {
                getAbstractFileByPath: vi.fn().mockReturnValue(null),
                createFolder: vi.fn().mockResolvedValue(undefined),
                create: vi.fn().mockResolvedValue(file),
                cachedRead: vi.fn().mockResolvedValue('heading {{date}} @ {{time}}'),
            },
            metadataCache: {
                getFirstLinkpathDest: vi.fn().mockReturnValue({ path: 'Templates/work.md' }),
            },
        });
        const plugin = makePlugin(type, app);

        await plugin.openNote(type, makeDate());

        expect(app.vault.create).toHaveBeenCalledWith('Work/2026-08-12.md', 'heading 2026-08-12 @ 09:30');
    });
});

describe('openNote — existing path handling', () => {
    it('should open an existing note without creating it', async () => {
        const type = makeNoteType();
        const file = new TFile();
        file.path = 'Work/2026-08-12.md';
        const app = makeApp({
            vault: {
                getAbstractFileByPath: vi.fn().mockReturnValue(file),
                createFolder: vi.fn().mockResolvedValue(undefined),
                create: vi.fn(),
                cachedRead: vi.fn(),
            },
        });
        const plugin = makePlugin(type, app);

        await plugin.openNote(type, makeDate());

        expect(app.vault.create).not.toHaveBeenCalled();
        expect(app.workspace.getLeaf).toHaveBeenCalledWith(false);
    });

    it('should stamp type and date on a pre-existing file only when they are absent', async () => {
        const type = makeNoteType();
        const file = new TFile();
        file.path = 'Work/2026-08-12.md';
        const matter: Record<string, unknown> = { type: 'custom' };
        const app = makeApp({
            vault: {
                getAbstractFileByPath: vi.fn().mockReturnValue(file),
                createFolder: vi.fn().mockResolvedValue(undefined),
                create: vi.fn(),
                cachedRead: vi.fn(),
            },
            fileManager: matterProcessor(matter),
        });
        const plugin = makePlugin(type, app);

        await plugin.openNote(type, makeDate());

        // type was already present → untouched (idempotent); date absent → stamped.
        expect(matter.type).toBe('custom');
        expect(matter.date).toBe('2026-08-12');
    });

    it('should reuse an existing leaf instead of opening a second tab', async () => {
        const type = makeNoteType();
        const file = new TFile();
        file.path = 'Work/2026-08-12.md';
        const app = makeApp({
            vault: {
                getAbstractFileByPath: vi.fn().mockReturnValue(file),
                createFolder: vi.fn().mockResolvedValue(undefined),
                create: vi.fn(),
                cachedRead: vi.fn(),
            },
            workspace: {
                getLeavesOfType: vi.fn().mockReturnValue([{ view: new MarkdownView(file) }]),
                setActiveLeaf: vi.fn(),
                getLeaf: vi.fn(),
                on: vi.fn().mockReturnValue(() => {}),
            },
        });
        const plugin = makePlugin(type, app);

        await plugin.openNote(type, makeDate());

        expect(app.workspace.setActiveLeaf).toHaveBeenCalledTimes(1);
        expect(app.workspace.getLeaf).not.toHaveBeenCalled();
    });
});

describe('openNote — race and guard paths', () => {
    it('should re-fetch and open when create races and fails as already-existing', async () => {
        const type = makeNoteType();
        const file = new TFile();
        file.path = 'Work/2026-08-12.md';
        const app = makeApp({
            vault: {
                getAbstractFileByPath: vi
                    .fn()
                    .mockReturnValueOnce(null) // folder check in ensureFolderExists
                    .mockReturnValueOnce(null) // first file fetch → missing
                    .mockReturnValue(file), // re-fetch after create fails
                createFolder: vi.fn().mockResolvedValue(undefined),
                create: vi.fn().mockRejectedValue(new Error('already exists')),
                cachedRead: vi.fn(),
            },
        });
        const plugin = makePlugin(type, app);

        await expect(plugin.openNote(type, makeDate())).resolves.toBeUndefined();

        expect(app.vault.create).toHaveBeenCalledTimes(1);
        expect(app.vault.getAbstractFileByPath).toHaveBeenCalledWith('Work/2026-08-12.md');
        expect(app.workspace.getLeaf).toHaveBeenCalledWith(false);
    });

    it('should no-op safely when a folder occupies the rendered path', async () => {
        const type = makeNoteType();
        const folder = new TFolder();
        folder.path = 'Work/2026-08-12.md';
        const app = makeApp({
            vault: {
                getAbstractFileByPath: vi.fn().mockReturnValue(folder),
                createFolder: vi.fn().mockResolvedValue(undefined),
                create: vi.fn(),
                cachedRead: vi.fn(),
            },
        });
        const plugin = makePlugin(type, app);

        await plugin.openNote(type, makeDate());

        expect(app.vault.create).not.toHaveBeenCalled();
        expect(app.workspace.getLeaf).not.toHaveBeenCalled();
        expect(app.workspace.setActiveLeaf).not.toHaveBeenCalled();
        // a short Notice explains the folder at that path
        expect(noticeMessages).toHaveLength(1);
        expect(noticeMessages[0]).toContain('folder');
        expect(noticeMessages[0]).toContain('Work/2026-08-12.md');
    });

    it('should show a frontmatter Notice and still open when stamping an existing note fails', async () => {
        const type = makeNoteType();
        const file = new TFile();
        file.path = 'Work/2026-08-12.md';
        const app = makeApp({
            vault: {
                getAbstractFileByPath: vi.fn().mockReturnValue(file),
                createFolder: vi.fn().mockResolvedValue(undefined),
                create: vi.fn(),
                cachedRead: vi.fn(),
            },
            fileManager: {
                processFrontMatter: vi.fn().mockRejectedValue(new Error('bad yaml')),
            },
        });
        const plugin = makePlugin(type, app);

        await plugin.openNote(type, makeDate());

        expect(noticeMessages).toHaveLength(1);
        expect(noticeMessages[0]).toContain('frontmatter');
        expect(noticeMessages[0]).toContain('Work/2026-08-12.md');
        // the note still opens despite the stamp failure
        expect(app.workspace.getLeaf).toHaveBeenCalledWith(false);
    });

    it('should surface a create Notice and not open when vault.create rejects with a non-race error', async () => {
        const type = makeNoteType();
        const app = makeApp({
            vault: {
                getAbstractFileByPath: vi.fn().mockReturnValue(null),
                createFolder: vi.fn().mockResolvedValue(undefined),
                create: vi.fn().mockRejectedValue(new Error('permission denied')),
                cachedRead: vi.fn().mockResolvedValue(''),
            },
        });
        const plugin = makePlugin(type, app);

        await expect(plugin.openNote(type, makeDate())).resolves.toBeUndefined();

        expect(noticeMessages).toHaveLength(1);
        expect(noticeMessages[0]).toContain('create');
        expect(app.workspace.getLeaf).not.toHaveBeenCalled();
    });

    it('should open the note with exactly one stamp Notice when stamping the fresh note fails', async () => {
        const type = makeNoteType();
        const file = new TFile();
        file.path = 'Work/2026-08-12.md';
        const app = makeApp({
            vault: {
                getAbstractFileByPath: vi.fn().mockReturnValue(null),
                createFolder: vi.fn().mockResolvedValue(undefined),
                create: vi.fn().mockResolvedValue(file),
                cachedRead: vi.fn().mockResolvedValue(''),
            },
            fileManager: {
                processFrontMatter: vi.fn().mockRejectedValue(new Error('write fail')),
            },
        });
        const plugin = makePlugin(type, app);

        await plugin.openNote(type, makeDate());

        // createNote's stamp catch swallows; openNote's stamp catch surfaces
        // the single user-facing Notice, and the note still opens.
        expect(noticeMessages).toHaveLength(1);
        expect(noticeMessages[0]).toContain('frontmatter');
        expect(app.workspace.getLeaf).toHaveBeenCalledWith(false);
    });

    it('should surface a folder Notice and not create or open when folder creation fails', async () => {
        const type = makeNoteType();
        const app = makeApp({
            vault: {
                getAbstractFileByPath: vi.fn().mockReturnValue(null),
                createFolder: vi.fn().mockRejectedValue(new Error('denied')),
                create: vi.fn(),
                cachedRead: vi.fn(),
            },
        });
        const plugin = makePlugin(type, app);

        await expect(plugin.openNote(type, makeDate())).resolves.toBeUndefined();

        expect(noticeMessages).toHaveLength(1);
        expect(noticeMessages[0]).toContain('folder');
        expect(app.vault.create).not.toHaveBeenCalled();
        expect(app.workspace.getLeaf).not.toHaveBeenCalled();
    });
});
