import { Notice, PluginSettingTab, Setting } from 'obsidian';
import type { App, SettingDefinitionItem } from 'obsidian';
import { DEFAULT_FORMATS, DEFAULT_NOTE_TYPE, ensureNonEmptyTypes, slug } from './constants';
import { findRenderedPathCollisions } from './utils';
import type { Granularity, NoteTypeConfig } from './types';
import type PeriodicTypesPlugin from './main';

/** All supported granularities, in the order they appear in the dropdown. */
const GRANULARITIES: Granularity[] = ['day', 'week', 'month', 'quarter', 'year'];

function granularityLabel(granularity: Granularity): string {
    return `${granularity} (${DEFAULT_FORMATS[granularity]})`;
}

/**
 * The type registry UI. One settings block per configured type (name, folder,
 * filename format, template, granularity, enabled, openAtStartup, delete) plus
 * a trailing "Add note type" row. Every mutation persists via the plugin, keeps
 * the command set in sync (`configureCommands`), and is guarded by the
 * rendered-path collision check so two enabled types can never silently write
 * to the same vault path.
 *
 * The registry is dynamic: blocks are added/deleted at runtime and each control
 * mutates its type live, so the UI renders imperatively via `display()` (the
 * `getSettingDefinitions` override below intentionally returns no declarative
 * definitions, which makes Obsidian fall back to `display()` on 1.13+ too).
 */
export class NoteTypeSettingTab extends PluginSettingTab {
    plugin: PeriodicTypesPlugin;

    constructor(app: App, plugin: PeriodicTypesPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    /**
     * Declarative settings surface (Obsidian 1.13+). This tab is a dynamic,
     * user-added registry that the imperative render manages (add/delete, live
     * onChange, collision-rejection re-render), so we deliberately return no
     * declarative definitions — Obsidian then falls back to calling `display()`,
     * which keeps behavior identical on every version.
     */
    getSettingDefinitions(): SettingDefinitionItem[] {
        return [];
    }

    display(): void {
        this.renderTab();
    }

    private renderTab(): void {
        const { containerEl } = this;
        containerEl.empty();

        new Setting(containerEl).setName('Note types').setHeading();

        for (const type of this.plugin.settings.types) {
            this.renderTypeSettings(containerEl.createDiv(), type);
        }

        // Trailing "Add note type" row.
        const newName = { value: '' };
        new Setting(containerEl)
            .setName('Add note type')
            .setDesc(
                'Name a new note type. The type ID (used for commands) is derived from the name and cannot change later.',
            )
            .addText(text =>
                text.setPlaceholder('E.g. Journal, meetings…').onChange(value => {
                    newName.value = value;
                }),
            )
            .addButton(btn =>
                btn
                    .setButtonText('Add')
                    .setCta()
                    .onClick(() => this.addType(newName.value)),
            );
    }

    /**
     * One settings block for `type`. `type` is the live object held in
     * `plugin.settings.types`; mutations below write straight through to it.
     */
    private renderTypeSettings(parent: HTMLElement, type: NoteTypeConfig): void {
        new Setting(parent).setName(type.name).setHeading();
        parent.createEl('p', { text: `ID: ${type.id}` }).addClass('setting-item-description');

        new Setting(parent)
            .setName('Name')
            .setDesc(
                'Display name used in the settings tab and picker. Commands are labeled from the immutable ID — renaming never changes a command.',
            )
            .addText(text =>
                text.setValue(type.name).onChange(async value => {
                    type.name = value;
                    await this.persist(false);
                }),
            );

        new Setting(parent)
            .setName('Folder')
            .setDesc("Vault folder for this type's notes.")
            .addText(text =>
                text.setValue(type.folder).onChange(async value => {
                    type.folder = value;
                    await this.persist(false);
                }),
            );

        // Live moment-format preview: the sample element renders today's date
        // against the current value, and is created per-block so it survives the
        // no-re-render text editing path.
        const formatSample = parent.createSpan();
        new Setting(parent)
            .setName('Filename format')
            .setDesc('Moment format for the filename. Leave blank for the granularity default.')
            .addMomentFormat(fmt =>
                fmt
                    .setPlaceholder(DEFAULT_FORMATS[type.granularity])
                    .setDefaultFormat(DEFAULT_FORMATS[type.granularity])
                    .setValue(type.format)
                    .setSampleEl(formatSample)
                    .onChange(async value => {
                        type.format = value;
                        await this.persist(false);
                    }),
            );

        new Setting(parent)
            .setName('Template path')
            .setDesc('Optional vault path to a template applied to new notes.')
            .addText(text =>
                text.setValue(type.templatePath).onChange(async value => {
                    type.templatePath = value;
                    await this.persist(false);
                }),
            );

        new Setting(parent)
            .setName('Granularity')
            .setDesc('How often this note rolls over (used for the filename format default).')
            .addDropdown(dropdown => {
                for (const g of GRANULARITIES) dropdown.addOption(g, granularityLabel(g));
                dropdown.setValue(type.granularity).onChange(async value => {
                    type.granularity = value as Granularity;
                    await this.persist(true);
                });
            });

        new Setting(parent)
            .setName('Enabled')
            .setDesc("Register this type's command and allow opening notes.")
            .addToggle(toggle =>
                toggle.setValue(type.enabled).onChange(async value => {
                    type.enabled = value;
                    await this.persist(true);
                }),
            );

        new Setting(parent)
            .setName('Open at startup')
            .setDesc("Open today's note for this type when Obsidian launches (but not on a plugin reload).")
            .addToggle(toggle =>
                toggle.setValue(type.openAtStartup).onChange(async value => {
                    type.openAtStartup = value;
                    await this.persist(true);
                }),
            );

        new Setting(parent).addButton(btn => {
            btn.setButtonText('Delete').onClick(async () => {
                const remaining = this.plugin.settings.types.filter(t => t !== type);
                const next = ensureNonEmptyTypes(remaining);
                if (next !== remaining) {
                    new Notice("All note types deleted — reset to the default 'work' type.");
                }
                this.plugin.settings.types = next;
                await this.persist(true);
            });
            // setWarning() is deprecated in favor of setDestructive(), which
            // requires Obsidian 1.13.0+ (above our 1.7.2 minAppVersion), so the
            // standard warning style is applied to the public button element
            // directly instead of through the deprecated API.
            btn.buttonEl.addClass('mod-warning');
        });
    }

    /**
     * Add a new type from a display name. The id is `slug(name)`; an empty slug
     * is rejected and a duplicate id gets a numeric suffix (`work`, `work-2`, …).
     */
    private async addType(name: string): Promise<void> {
        let id = slug(name);
        if (id === '') {
            new Notice('Enter a name for the new note type.');
            return;
        }
        const existing = new Set(this.plugin.settings.types.map(t => t.id));
        if (existing.has(id)) {
            const base = id;
            let counter = 2;
            while (existing.has(`${base}-${counter}`)) counter += 1;
            id = `${base}-${counter}`;
        }
        this.plugin.settings.types.push({
            ...DEFAULT_NOTE_TYPE,
            id,
            name: name.trim(),
        });
        await this.persist(true);
    }

    /**
     * Persist the current (already-mutated) settings, keep the command set in
     * sync, and optionally re-render. Before saving, the rendered-path collision
     * guard runs: if two ENABLED types resolve to the same note path
     * (via the shared `findRenderedPathCollisions` helper — the same
     * `resolveNotePath` pipeline `openNote` uses), the change is rejected —
     * settings are reverted from disk and the tab is re-rendered, so the
     * colliding state is never saved.
     */
    private async persist(rerender: boolean): Promise<void> {
        const collision = findRenderedPathCollisions(this.plugin.settings.types);
        if (collision) {
            new Notice(collision);
            await this.plugin.loadSettings();
            this.redraw();
            return;
        }
        await this.plugin.saveSettings();
        this.plugin.configureCommands();
        if (rerender) this.redraw();
    }

    /** Re-render the registry tab in place (add/delete/collision rejection). */
    private redraw(): void {
        this.renderTab();
    }
}
