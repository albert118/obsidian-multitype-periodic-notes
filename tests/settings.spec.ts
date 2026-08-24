import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import PeriodicTypesPlugin from '../src/main';
import { NoteTypeSettingTab } from '../src/settings';
import { DEFAULT_NOTE_TYPE, makeWorkSeed } from '../src/constants';
import type { App, PluginManifest } from 'obsidian';
import type { NoteTypeConfig } from '../src/types';

/**
 * The Setting mock's component callbacks are captured into these ordered
 * arrays (in render order) so tests can invoke them exactly once. The order
 * follows renderTab → renderTypeSettings: per type block [name, folder,
 * templatePath, momentFormat, granularity, enabled, openAtStartup, delete],
 * then the trailing add-row [name, add]. See the tests for the indexes used.
 * Callbacks are async (they persist), so each is typed Promise-returning to
 * keep `await` valid at the call sites.
 */
const { noticeMessages, captured } = vi.hoisted(() => ({
  noticeMessages: [] as string[],
  captured: {
    textOnChange: [] as Array<(value: string) => Promise<void>>,
    toggleOnChange: [] as Array<(value: boolean) => Promise<void>>,
    momentFormatOnChange: [] as Array<(value: string) => Promise<void>>,
    dropdownOnChange: [] as Array<(value: string) => Promise<void>>,
    buttonOnClick: [] as Array<() => Promise<void>>,
  },
}));

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
  }
  class PluginSettingTab {
    containerEl: HTMLElement | undefined;
    constructor(_app?: unknown, _plugin?: unknown) {}
  }
  class Notice {
    constructor(message: string) {
      noticeMessages.push(message);
    }
  }
  /** Chainable double returned by every add* wrapper: every setter returns
   *  itself so `.setX().onChange(...)` chains, and onChange/onClick hand the
   *  callback to a capture sink for later invocation by the test. Generic so
   *  each component captures with the exact callback shape its array holds. */
  const chain = <T extends (...args: never[]) => unknown>(capture: (fn: T) => void): Record<string, unknown> => {
    const self: Record<string, unknown> = {
      onChange: (fn: T) => {
        capture(fn);
        return self;
      },
      onClick: (fn: T) => {
        capture(fn);
        return self;
      },
      setPlaceholder: () => self,
      setDefaultFormat: () => self,
      setSampleEl: () => self,
      setValue: () => self,
      setButtonText: () => self,
      setCta: () => self,
      addOption: () => self,
    };
    return self;
  };
  class Setting {
    constructor(_containerEl: unknown) {}
    setName() {
      return this;
    }
    setDesc() {
      return this;
    }
    setHeading() {
      return this;
    }
    addText(cb: (c: unknown) => void) {
      cb(chain<(value: string) => Promise<void>>(fn => captured.textOnChange.push(fn)));
      return this;
    }
    addMomentFormat(cb: (c: unknown) => void) {
      cb(chain<(value: string) => Promise<void>>(fn => captured.momentFormatOnChange.push(fn)));
      return this;
    }
    addDropdown(cb: (c: unknown) => void) {
      cb(chain<(value: string) => Promise<void>>(fn => captured.dropdownOnChange.push(fn)));
      return this;
    }
    addToggle(cb: (c: unknown) => void) {
      cb(chain<(value: boolean) => Promise<void>>(fn => captured.toggleOnChange.push(fn)));
      return this;
    }
    addButton(cb: (c: unknown) => void) {
      cb(
        Object.assign(
          chain<() => Promise<void>>(fn => captured.buttonOnClick.push(fn)),
          {
            buttonEl: { addClass: () => undefined },
          },
        ),
      );
      return this;
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
    SuggestModal,
    MarkdownView,
    PluginSettingTab,
    Setting,
    Notice,
    normalizePath: vi.fn((path: string) => path),
  };
});

interface ContainerDouble {
  empty: Mock;
  createDiv: Mock;
  createEl: Mock;
  createSpan: Mock;
  addClass: Mock;
}

const makeContainerEl = (): ContainerDouble => {
  const el: ContainerDouble = {
    empty: vi.fn(),
    createDiv: vi.fn(() => makeContainerEl()),
    createEl: vi.fn(() => makeContainerEl()),
    createSpan: vi.fn(() => makeContainerEl()),
    addClass: vi.fn(),
  };
  return el;
};

const makeNoteType = (overrides: Partial<NoteTypeConfig> = {}): NoteTypeConfig => ({
  ...DEFAULT_NOTE_TYPE,
  id: 'work',
  name: 'Work',
  folder: 'Work',
  ...overrides,
});

const makePlugin = (types: NoteTypeConfig[]): PeriodicTypesPlugin => {
  const plugin = new PeriodicTypesPlugin({} as App, {} as PluginManifest);
  plugin.settings = { types: [...types] };
  plugin.saveSettings = vi.fn().mockResolvedValue(undefined);
  plugin.loadSettings = vi.fn().mockResolvedValue(undefined);
  plugin.configureCommands = vi.fn();
  return plugin;
};

const makeTab = (plugin: PeriodicTypesPlugin): NoteTypeSettingTab => {
  const tab = new NoteTypeSettingTab({} as App, plugin);
  // The mocked PluginSettingTab leaves containerEl unset; the render path
  // needs an HTMLElement-shaped double so renderTab()/redraw() are observable.
  tab.containerEl = makeContainerEl() as unknown as HTMLElement;
  return tab;
};

const containerDouble = (tab: NoteTypeSettingTab): ContainerDouble => tab.containerEl as unknown as ContainerDouble;

/** Run the registry's imperative render. display() is the deprecated alias for
 *  renderTab() (and is forbidden to disable), so drive renderTab directly. */
const renderTab = (tab: NoteTypeSettingTab): void => {
  (tab as unknown as { renderTab: () => void }).renderTab();
};

/** The plugin's async method spies viewed as function-property Mocks (avoids
 *  unbound-method when the methods are passed to `expect`). */
const pluginSpies = (
  plugin: PeriodicTypesPlugin,
): { saveSettings: Mock; loadSettings: Mock; configureCommands: Mock } =>
  plugin as unknown as { saveSettings: Mock; loadSettings: Mock; configureCommands: Mock };

beforeEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
  noticeMessages.length = 0;
  captured.textOnChange.length = 0;
  captured.toggleOnChange.length = 0;
  captured.momentFormatOnChange.length = 0;
  captured.dropdownOnChange.length = 0;
  captured.buttonOnClick.length = 0;
});

describe('addType — slug uniqueness', () => {
  it('should reject an empty name with a Notice when adding a type', async () => {
    const plugin = makePlugin([makeNoteType()]);
    const tab = makeTab(plugin);

    await tab.addType('');

    expect(noticeMessages).toContain('Enter a name for the new note type.');
    expect(plugin.settings.types).toHaveLength(1);
    expect(plugin.settings.types[0].id).toBe('work');
  });

  it('should append a numeric suffix on a duplicate slug', async () => {
    const plugin = makePlugin([makeNoteType()]);
    const tab = makeTab(plugin);

    await tab.addType('Work!');

    expect(plugin.settings.types.map(type => type.id)).toEqual(['work', 'work-2']);
  });

  it('should increment the suffix until a free id is found', async () => {
    const plugin = makePlugin([
      makeNoteType({ id: 'work', folder: 'Work' }),
      makeNoteType({ id: 'work-2', folder: 'WorkTwo' }),
      makeNoteType({ id: 'work-3', folder: 'WorkThree' }),
    ]);
    const tab = makeTab(plugin);

    await tab.addType('Work');

    expect(plugin.settings.types.map(type => type.id)).toEqual(['work', 'work-2', 'work-3', 'work-4']);
  });

  it('should use the plain slug when the name is unique', async () => {
    const plugin = makePlugin([makeNoteType()]);
    const tab = makeTab(plugin);

    await tab.addType('Journal');

    expect(plugin.settings.types.map(type => type.id)).toEqual(['work', 'journal']);
    expect(plugin.settings.types[1]).toMatchObject({ id: 'journal', name: 'Journal' });
  });
});

describe('NoteTypeSettingTab — registry mutations', () => {
  it('should reset to the work seed and show a Notice when the last type is deleted', async () => {
    const plugin = makePlugin([makeNoteType()]);
    const tab = makeTab(plugin);

    renderTab(tab);

    await captured.buttonOnClick[0]();

    expect(plugin.settings.types).toEqual([makeWorkSeed()]);
    expect(pluginSpies(plugin).saveSettings).toHaveBeenCalled();
    expect(pluginSpies(plugin).configureCommands).toHaveBeenCalled();
    expect(noticeMessages).toEqual(expect.arrayContaining([expect.stringContaining('reset to the default')]));
  });

  it('should revert settings from disk and re-render when a collision is detected on persist', async () => {
    const plugin = makePlugin([
      makeNoteType({ id: 'alpha', name: 'Alpha', folder: 'Alpha' }),
      makeNoteType({ id: 'beta', name: 'Beta', folder: 'Beta' }),
    ]);
    const tab = makeTab(plugin);

    renderTab(tab);

    // textOnChange[4] is the second type's Folder field: changing it to
    // "Alpha" makes beta's rendered path collide with alpha's.
    await captured.textOnChange[4]('Alpha');

    expect(pluginSpies(plugin).saveSettings).not.toHaveBeenCalled();
    expect(pluginSpies(plugin).loadSettings).toHaveBeenCalled();
    expect(noticeMessages[0]).toContain("'Alpha'");
    expect(noticeMessages[0]).toContain("'Beta'");
    expect(noticeMessages[0]).toContain('both resolve to');
    // the collision rejection forces a re-render: one from renderTab, one from redraw
    expect(containerDouble(tab).empty).toHaveBeenCalledTimes(2);
  });

  it('should persist and re-run configureCommands when a non-colliding onChange fires', async () => {
    const plugin = makePlugin([makeNoteType()]);
    const tab = makeTab(plugin);

    renderTab(tab);

    // toggleOnChange[0] is the Enabled toggle of the first type.
    await captured.toggleOnChange[0](false);

    expect(pluginSpies(plugin).saveSettings).toHaveBeenCalled();
    expect(pluginSpies(plugin).configureCommands).toHaveBeenCalled();
    expect(plugin.settings.types[0].enabled).toBe(false);
  });

  it('should return no declarative settings so Obsidian falls back to display', () => {
    const plugin = makePlugin([makeNoteType()]);
    const tab = makeTab(plugin);

    expect(tab.getSettingDefinitions()).toEqual([]);
  });
});
