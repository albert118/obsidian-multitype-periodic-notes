import { SuggestModal } from 'obsidian';
import type { App } from 'obsidian';
import type PeriodicTypesPlugin from './main';
import type { NoteTypeConfig } from './types';

/** Period choices offered once a type is selected. */
const PERIODS: ReadonlyArray<{ delta: number; label: (granularity: string) => string }> = [
    { delta: 0, label: () => 'Today' },
    { delta: 1, label: granularity => `Next ${granularity}` },
    { delta: -1, label: granularity => `Previous ${granularity}` },
];

/**
 * A picker suggestion is either a note TYPE (step one) or a PERIOD for the
 * selected type (step two). Keeping both phases in one union lets the modal
 * reuse SuggestModal's rendering/filtering machinery across the two steps.
 */
type PickerSuggestion =
    | { kind: 'type'; type: NoteTypeConfig; label: string }
    | { kind: 'period'; type: NoteTypeConfig; delta: number; label: string };

/**
 * Two-step "Open periodic note…" picker: first choose a note type (from the
 * enabled types in settings), then choose a period (today / next / previous)
 * for that type. Step two is entered by clearing the input and re-dispatching
 * an `input` event, which is how SuggestModal's internal listener refreshes
 * its suggestion list (the same mechanism typing normally triggers).
 */
export class NotePickerModal extends SuggestModal<PickerSuggestion> {
    private selectedType: NoteTypeConfig | null = null;

    constructor(
        app: App,
        private plugin: PeriodicTypesPlugin,
    ) {
        super(app);
        this.setPlaceholder('Choose a note type…');
    }

    getSuggestions(query: string): PickerSuggestion[] {
        const needle = query.trim().toLowerCase();
        const selected = this.selectedType;
        if (!selected) {
            return this.plugin.settings.types
                .filter(type => type.enabled)
                .map((type): PickerSuggestion => ({
                    kind: 'type',
                    type,
                    label: type.name,
                }))
                .filter(
                    suggestion =>
                        suggestion.label.toLowerCase().includes(needle) || suggestion.type.id.includes(needle),
                );
        }
        return PERIODS.map((period): PickerSuggestion => ({
            kind: 'period',
            type: selected,
            delta: period.delta,
            label: period.label(selected.granularity),
        })).filter(suggestion => suggestion.label.toLowerCase().includes(needle));
    }

    renderSuggestion(suggestion: PickerSuggestion, el: HTMLElement): void {
        el.setText(suggestion.label);
    }

    onChooseSuggestion(suggestion: PickerSuggestion, _evt: MouseEvent | KeyboardEvent): void {
        if (suggestion.kind === 'type') {
            // Advance to the period step: remember the type, reset the input,
            // and force a refresh of the suggestion list.
            this.selectedType = suggestion.type;
            this.setPlaceholder(`Period for ${suggestion.type.name}…`);
            this.inputEl.value = '';
            this.inputEl.dispatchEvent(new Event('input'));
            return;
        }
        this.close();
        const date = window.moment().add(suggestion.delta, suggestion.type.granularity);
        void this.plugin.openNote(suggestion.type, date);
    }
}
