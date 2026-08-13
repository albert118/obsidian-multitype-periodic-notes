import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import PeriodicTypesPlugin from '../src/main';
import { DEFAULT_NOTE_TYPE } from '../src/constants';
import type { App, PluginManifest } from 'obsidian';
import type { NoteTypeConfig } from '../src/types';

vi.mock('obsidian', () => {
    class Plugin {
        app: unknown;
        addCommand = vi.fn();
        removeCommand = vi.fn();
        registerEvent = vi.fn();
        addSettingTab = vi.fn();
        loadData = vi.fn();
        saveData = vi.fn();
        constructor(app?: unknown, _manifest?: unknown) {
            this.app = app;
        }
    }
    class TFile {
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
    }
    class Setting {
        constructor(_containerEl: unknown) {}
    }
    class PluginSettingTab {
        app: unknown;
        plugin: unknown;
        constructor(app?: unknown, plugin?: unknown) {
            this.app = app;
            this.plugin = plugin;
        }
    }
    class Notice {
        constructor(_message: string) {}
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

const makeNoteType = (overrides: Partial<NoteTypeConfig> = {}): NoteTypeConfig => ({
    ...DEFAULT_NOTE_TYPE,
    id: 'work',
    name: 'Work',
    ...overrides,
});

/** Build a fresh plugin with a known type set and no prior command registrations. */
const makePlugin = (types: NoteTypeConfig[]): PeriodicTypesPlugin => {
    const plugin = new PeriodicTypesPlugin({} as App, {} as PluginManifest);
    plugin.settings = { types: [...types] };
    return plugin;
};

/**
 * The command mocks on the plugin. The real obsidian `Plugin` typing declares
 * `addCommand`/`removeCommand` as methods, which would trip `unbound-method`
 * when passed to `expect`; viewing them through function-property (Mock) types
 * keeps the assertions clean and matches how the other spec files access spies.
 */
interface CommandSpies {
    addCommand: Mock;
    removeCommand: Mock;
}

const commandSpies = (plugin: PeriodicTypesPlugin): CommandSpies => plugin as unknown as CommandSpies;

/** The command ids passed to addCommand across the lifecycle. */
const addedIds = (plugin: PeriodicTypesPlugin): string[] =>
    commandSpies(plugin).addCommand.mock.calls.map((call: unknown[]) => (call[0] as { id: string }).id);

beforeEach(() => {
    vi.clearAllMocks();
});

describe('configureCommands', () => {
    it('should add an open-today command for a new enabled type', () => {
        const plugin = makePlugin([makeNoteType()]);

        plugin.configureCommands();

        expect(commandSpies(plugin).addCommand).toHaveBeenCalledWith(
            expect.objectContaining({
                id: 'open-today-work-note',
                name: "Open today's work note", // labelled from the immutable id
            }),
        );
    });

    it('should not re-add an already-registered id across repeated calls', () => {
        const plugin = makePlugin([makeNoteType()]);

        plugin.configureCommands();
        plugin.configureCommands();

        expect(addedIds(plugin).filter(id => id === 'open-today-work-note')).toHaveLength(1);
    });

    it('should remove a command whose type was deleted and not re-add it', () => {
        const plugin = makePlugin([makeNoteType()]);
        plugin.configureCommands();

        plugin.settings.types = [];
        plugin.configureCommands();

        expect(commandSpies(plugin).removeCommand).toHaveBeenCalledWith('periodic-types:open-today-work-note');
        // registered exactly once: the initial configure, never re-added after delete
        expect(addedIds(plugin).filter(id => id === 'open-today-work-note')).toHaveLength(1);
    });

    it('should remove a command whose type was disabled and register nothing for it', () => {
        const plugin = makePlugin([makeNoteType()]);
        plugin.configureCommands();

        plugin.settings.types = [makeNoteType({ enabled: false })];
        plugin.configureCommands();

        expect(commandSpies(plugin).removeCommand).toHaveBeenCalledWith('periodic-types:open-today-work-note');
        expect(addedIds(plugin).filter(id => id === 'open-today-work-note')).toHaveLength(1);
    });

    it('should remove the stale command and register the new one when a type id changes', () => {
        const plugin = makePlugin([makeNoteType()]);
        plugin.configureCommands();

        plugin.settings.types = [makeNoteType({ id: 'work-2', name: 'Work 2' })];
        plugin.configureCommands();

        expect(commandSpies(plugin).removeCommand).toHaveBeenCalledWith('periodic-types:open-today-work-note');
        expect(addedIds(plugin)).toContain('open-today-work-2-note');
    });

    it('should only remove commands that were previously registered', () => {
        const plugin = makePlugin([makeNoteType()]);
        plugin.configureCommands();

        plugin.settings.types = [makeNoteType({ id: 'journal' })];
        plugin.configureCommands();

        expect(commandSpies(plugin).removeCommand).toHaveBeenCalledTimes(1);
        expect(commandSpies(plugin).removeCommand).toHaveBeenCalledWith('periodic-types:open-today-work-note');
    });

    it('should keep the picker command stable across calls and never remove it', () => {
        const plugin = makePlugin([makeNoteType()]);

        plugin.configureCommands();
        plugin.configureCommands();
        plugin.settings.types = [];
        plugin.configureCommands();

        expect(addedIds(plugin).filter(id => id === 'open-periodic-picker')).toHaveLength(1);
        expect(commandSpies(plugin).removeCommand).not.toHaveBeenCalledWith('periodic-types:open-periodic-picker');
    });

    it('should not register a command for a disabled type', () => {
        const plugin = makePlugin([makeNoteType({ enabled: false })]);

        plugin.configureCommands();

        expect(addedIds(plugin)).not.toContain('open-today-work-note');
        expect(addedIds(plugin)).toContain('open-periodic-picker');
    });

    it('should keep the command label stable across name renames since it derives from the id', () => {
        const plugin = makePlugin([makeNoteType()]);
        plugin.configureCommands();

        // Rename the display name; the id is unchanged, so the command is never
        // re-added and its label still reads as the id ("work").
        plugin.settings.types = [makeNoteType({ name: 'Work Renamed' })];
        plugin.configureCommands();

        expect(addedIds(plugin).filter(id => id === 'open-today-work-note')).toHaveLength(1);
        expect(commandSpies(plugin).addCommand).toHaveBeenCalledWith(
            expect.objectContaining({
                id: 'open-today-work-note',
                name: "Open today's work note",
            }),
        );
    });
});

describe('onload seeding', () => {
    /** The `saveData` method viewed as a function-property Mock (see CommandSpies). */
    const saveDataSpy = (plugin: PeriodicTypesPlugin): Mock => (plugin as unknown as { saveData: Mock }).saveData;

    it('should seed the default work type and persist it when loadData resolves undefined', async () => {
        const plugin = new PeriodicTypesPlugin({} as App, {} as PluginManifest);
        plugin.loadData = vi.fn().mockResolvedValue(undefined);
        plugin.saveData = vi.fn().mockResolvedValue(undefined);

        await plugin.onload();

        expect(plugin.settings.types).toEqual([expect.objectContaining({ id: 'work', name: 'Work', folder: 'Work' })]);
        expect(saveDataSpy(plugin)).toHaveBeenCalledTimes(1);
    });

    it('should not seed or persist when loadData returns a non-empty types list', async () => {
        const plugin = new PeriodicTypesPlugin({} as App, {} as PluginManifest);
        plugin.loadData = vi.fn().mockResolvedValue({ types: [makeNoteType({ id: 'journal' })] });
        plugin.saveData = vi.fn().mockResolvedValue(undefined);

        await plugin.onload();

        expect(plugin.settings.types).toHaveLength(1);
        expect(plugin.settings.types[0]).toMatchObject({ id: 'journal' });
        expect(saveDataSpy(plugin)).not.toHaveBeenCalled();
    });
});
