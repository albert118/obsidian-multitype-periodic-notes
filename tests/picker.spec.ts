import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import PeriodicTypesPlugin from '../src/main';
import { NotePickerModal } from '../src/picker';
import { DEFAULT_NOTE_TYPE } from '../src/constants';
import type { App, PluginManifest } from 'obsidian';
import type { NoteTypeConfig } from '../src/types';

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
    path = '';
  }
  class TFolder {
    path = '';
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
    constructor(_message: string) {}
  }
  class SuggestModal {
    inputEl: { value: string; dispatchEvent: ReturnType<typeof vi.fn> };
    setPlaceholder: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
    constructor(_app?: unknown) {
      this.inputEl = { value: '', dispatchEvent: vi.fn() };
      this.setPlaceholder = vi.fn();
      this.close = vi.fn();
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
  plugin.openNote = vi.fn().mockResolvedValue(undefined);
  return plugin;
};

const makePicker = (plugin: PeriodicTypesPlugin): NotePickerModal => new NotePickerModal({} as App, plugin);

/** The modality's spies viewed as function-property Mocks (avoids unbound-method
 *  when the methods are passed to `expect`; see config.spec's commandSpies). */
const openNoteSpy = (plugin: PeriodicTypesPlugin): Mock => (plugin as unknown as { openNote: Mock }).openNote;
const dispatchEventSpy = (picker: NotePickerModal): Mock =>
  (picker.inputEl as unknown as { dispatchEvent: Mock }).dispatchEvent;
const closeSpy = (picker: NotePickerModal): Mock => (picker as unknown as { close: Mock }).close;

beforeEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
  vi.stubGlobal('window', {
    moment: vi.fn(() => ({ add: vi.fn((delta: number, granularity: string) => ({ delta, granularity })) })),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('NotePickerModal — type step', () => {
  it('should suggest one entry per enabled type initially', () => {
    const types = [
      makeNoteType({ id: 'work', name: 'Work' }),
      makeNoteType({ id: 'journal', name: 'Journal' }),
      makeNoteType({ id: 'secret', name: 'Secret', enabled: false }),
    ];
    const picker = makePicker(makePlugin(types));

    const suggestions = picker.getSuggestions('');

    expect(suggestions).toHaveLength(2);
    expect(suggestions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'type', type: types[0], label: 'Work' }),
        expect.objectContaining({ kind: 'type', type: types[1], label: 'Journal' }),
      ]),
    );
    expect(suggestions).not.toEqual(expect.arrayContaining([expect.objectContaining({ type: types[2] })]));
  });

  it('should filter out disabled types from suggestions', () => {
    const types = [
      makeNoteType({ id: 'work', name: 'Work' }),
      makeNoteType({ id: 'secret', name: 'Secret', enabled: false }),
    ];
    const picker = makePicker(makePlugin(types));

    const suggestions = picker.getSuggestions('');

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]).toEqual(expect.objectContaining({ kind: 'type', type: types[0] }));
  });

  it('should match the query against the type name and id', () => {
    const types = [makeNoteType({ id: 'work', name: 'Work' }), makeNoteType({ id: 'journal', name: 'Journal' })];
    const picker = makePicker(makePlugin(types));

    expect(picker.getSuggestions('jour')).toHaveLength(1);
    expect(picker.getSuggestions('work')).toHaveLength(1);
    expect(picker.getSuggestions('zzz')).toHaveLength(0);
  });
});

describe('NotePickerModal — period step', () => {
  it('should advance to a period list after choosing a type', () => {
    const type = makeNoteType();
    const picker = makePicker(makePlugin([type]));

    picker.onChooseSuggestion({ kind: 'type', type, label: type.name }, {} as MouseEvent);

    expect(picker.inputEl.value).toBe('');
    expect(dispatchEventSpy(picker)).toHaveBeenCalledWith(expect.objectContaining({ type: 'input' }));

    const periods = picker.getSuggestions('') as ReadonlyArray<{
      kind: string;
      type: NoteTypeConfig;
      delta: number;
    }>;
    expect(periods).toHaveLength(3);
    expect(periods.map(period => period.delta).sort((a, b) => a - b)).toEqual([-1, 0, 1]);
    expect(periods.every(period => period.kind === 'period' && period.type === type)).toBe(true);
  });

  it('should open the next periodic note when a period is chosen', () => {
    const type = makeNoteType({ granularity: 'day' });
    const plugin = makePlugin([type]);
    const picker = makePicker(plugin);

    picker.onChooseSuggestion({ kind: 'type', type, label: type.name }, {} as MouseEvent);
    picker.onChooseSuggestion({ kind: 'period', delta: 1, type, label: 'Next day' }, {} as MouseEvent);

    expect(openNoteSpy(plugin)).toHaveBeenCalledWith(type, expect.objectContaining({ delta: 1, granularity: 'day' }));
    expect(closeSpy(picker)).toHaveBeenCalled();
  });
});
