import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import PeriodicTypesPlugin, { describeNoteError, handleNoteError } from '../src/main';
import { DEFAULT_NOTE_TYPE } from '../src/constants';
import type { App, PluginManifest } from 'obsidian';
import type { NoteTypeConfig } from '../src/types';
import type { MomentLike } from '../src/utils';

/** Captured Notice messages, hoisted so the (also-hoisted) obsidian mock writes
 *  to the same array the assertions read. */
const { noticeMessages } = vi.hoisted(() => ({ noticeMessages: [] as string[] }));

/** The console.error spy created per test (handleNoteError logs through it). */
let consoleErrorSpy: Mock;

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
  // on mirrors the base Events.on: returns the event name so the mocked
  // registerEvent receives it (registerEvent(workspace.on(name, cb))).
  on: Mock;
}

interface AppDouble {
  vault: VaultDouble;
  fileManager: { processFrontMatter: Mock };
  workspace: WorkspaceDouble;
  metadataCache: { getFirstLinkpathDest: Mock };
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
      on: vi.fn((name: string) => name),
    },
    metadataCache: { getFirstLinkpathDest: vi.fn().mockReturnValue(null) },
  };
  return Object.assign(app, overrides);
};

/** A plugin bound to a vault whose create rejects with the given implementation. */
const makeCreatingPlugin = (app: AppDouble, createImpl: Mock): PeriodicTypesPlugin => {
  const plugin = new PeriodicTypesPlugin(app as unknown as App, {} as PluginManifest);
  plugin.settings = { types: [makeNoteType()] };
  app.vault.create = createImpl;
  return plugin;
};

/** The plugin's registerEvent mock viewed as a function-property (avoids
 *  unbound-method when the method is passed to `expect`). */
const registerEventSpy = (plugin: PeriodicTypesPlugin): Mock =>
  (plugin as unknown as { registerEvent: Mock }).registerEvent;

beforeEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
  noticeMessages.length = 0;
  // handleNoteError logs via console.error; silence it so it doesn't pollute
  // the test output, and keep the spy for the console assertions.
  consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('describeNoteError', () => {
  const ctx = { typeId: 'work', date: '2026-08-12', path: 'Work/2026-08-12.md' };

  it('should describe a folder-creation failure', () => {
    expect(describeNoteError('folder', ctx)).toBe(
      "Couldn't create the folder for the 'work' note at 'Work/2026-08-12.md' (2026-08-12).",
    );
  });

  it('should describe a create failure', () => {
    expect(describeNoteError('create', ctx)).toBe(
      "Couldn't create the 'work' note at 'Work/2026-08-12.md' (2026-08-12). Check the filename format and folder.",
    );
  });

  it('should describe a frontmatter stamp failure', () => {
    expect(describeNoteError('stamp', ctx)).toBe(
      "Couldn't write frontmatter for the 'work' note at 'Work/2026-08-12.md' — check the note's YAML.",
    );
  });

  it('should describe an open failure', () => {
    expect(describeNoteError('open', ctx)).toBe("Couldn't open the 'work' note at 'Work/2026-08-12.md'.");
  });
});

describe('handleNoteError', () => {
  it('should log a prefixed console error and show a Notice', () => {
    const error = new Error('boom');

    handleNoteError('stamp', { typeId: 'work', date: '2026-08-12', path: 'Work/2026-08-12.md' }, error);

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[periodic-types] stamp — type: work, date: 2026-08-12, path: Work/2026-08-12.md',
      error,
    );
    expect(noticeMessages).toEqual([
      "Couldn't write frontmatter for the 'work' note at 'Work/2026-08-12.md' — check the note's YAML.",
    ]);
  });
});

describe('createNote — "already exists" handling', () => {
  const createArgs = ['2026-08-12', 'Work/2026-08-12.md'] as const;

  it('should return null when vault.create rejects with an "already exists" Error', async () => {
    const app = makeApp();
    const plugin = makeCreatingPlugin(app, vi.fn().mockRejectedValue(new Error('File already exists')));

    await expect(plugin.createNote(makeNoteType(), makeDate(), ...createArgs)).resolves.toBeNull();
  });

  it('should propagate a non "already exists" Error', async () => {
    const app = makeApp();
    const plugin = makeCreatingPlugin(app, vi.fn().mockRejectedValue(new Error('permission denied')));

    await expect(plugin.createNote(makeNoteType(), makeDate(), ...createArgs)).rejects.toThrow('permission denied');
  });

  it('should propagate a non-Error "already exists" rejection', async () => {
    const app = makeApp();
    const plugin = makeCreatingPlugin(app, vi.fn().mockRejectedValue('already exists'));

    await expect(plugin.createNote(makeNoteType(), makeDate(), ...createArgs)).rejects.toBe('already exists');
  });
});

describe('loadSettings', () => {
  const loadSettingsPlugin = (data: unknown): PeriodicTypesPlugin => {
    const plugin = new PeriodicTypesPlugin({} as App, {} as PluginManifest);
    plugin.loadData = vi.fn().mockResolvedValue(data);
    return plugin;
  };

  it('should fall back to DEFAULT_SETTINGS when loadData resolves undefined', async () => {
    const plugin = loadSettingsPlugin(undefined);

    await plugin.loadSettings();

    expect(plugin.settings).toEqual({ types: [] });
  });

  it('should keep the provided types when loadData returns a partial settings object', async () => {
    const plugin = loadSettingsPlugin({ types: [makeNoteType({ id: 'journal' })] });

    await plugin.loadSettings();

    expect(plugin.settings.types).toEqual([makeNoteType({ id: 'journal' })]);
  });

  it('should fall back to DEFAULT_SETTINGS when loadData resolves an empty object', async () => {
    const plugin = loadSettingsPlugin({});

    await plugin.loadSettings();

    expect(plugin.settings).toEqual({ types: [] });
  });
});

describe('onload — openAtStartup wiring', () => {
  it('should register a layout-ready subscription when a type has openAtStartup', async () => {
    const app = makeApp();
    const plugin = new PeriodicTypesPlugin(app as unknown as App, {} as PluginManifest);
    plugin.loadData = vi.fn().mockResolvedValue({ types: [makeNoteType({ openAtStartup: true })] });

    await plugin.onload();

    expect(app.workspace.on).toHaveBeenCalledWith('layout-ready', expect.any(Function));
    expect(registerEventSpy(plugin)).toHaveBeenCalledWith('layout-ready');
  });

  it('should not register a layout-ready subscription when no type has openAtStartup', async () => {
    const plugin = new PeriodicTypesPlugin({} as App, {} as PluginManifest);
    plugin.loadData = vi.fn().mockResolvedValue({ types: [makeNoteType()] });

    await plugin.onload();

    expect(registerEventSpy(plugin)).not.toHaveBeenCalledWith('layout-ready');
  });
});
