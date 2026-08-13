import { beforeEach, describe, expect, it, vi } from 'vitest';
import { findRenderedPathCollisions } from '../src/utils';
import { DEFAULT_NOTE_TYPE } from '../src/constants';
import type { NoteTypeConfig } from '../src/types';

vi.mock('obsidian', () => ({
    normalizePath: vi.fn((path: string) => path),
    Notice: vi.fn(),
}));

const makeNoteType = (overrides: Partial<NoteTypeConfig> = {}): NoteTypeConfig => ({
    ...DEFAULT_NOTE_TYPE,
    id: 'work',
    name: 'Work',
    folder: 'Work',
    ...overrides,
});

beforeEach(() => {
    vi.clearAllMocks();
});

describe('findRenderedPathCollisions', () => {
    it('should detect a collision between a folder with and without a trailing slash', () => {
        const types = [
            makeNoteType({ id: 'alpha', name: 'Alpha', folder: 'Work', format: 'YYYY-MM-DD' }),
            makeNoteType({ id: 'beta', name: 'Beta', folder: 'Work/', format: 'YYYY-MM-DD' }),
        ];

        const result = findRenderedPathCollisions(types);

        expect(result).not.toBeNull();
        expect(result).toContain('Alpha');
        expect(result).toContain('Beta');
    });

    it('should detect a collision from a trailing-space format', () => {
        const types = [
            makeNoteType({ id: 'alpha', name: 'Alpha', folder: 'Work', format: 'YYYY-MM-DD' }),
            makeNoteType({ id: 'beta', name: 'Beta', folder: 'Work', format: 'YYYY-MM-DD ' }),
        ];

        expect(findRenderedPathCollisions(types)).not.toBeNull();
    });

    it('should detect the same rendered name across different granularities', () => {
        const types = [
            // a daily note with an overridden month-only format → "YYYY-MM"
            makeNoteType({
                id: 'alpha',
                name: 'Alpha',
                folder: 'Work',
                granularity: 'day',
                format: 'YYYY-MM',
            }),
            // a monthly note using its default format → "YYYY-MM"
            makeNoteType({ id: 'beta', name: 'Beta', folder: 'Work', granularity: 'month' }),
        ];

        expect(findRenderedPathCollisions(types)).not.toBeNull();
    });

    it('should allow distinct rendered names in the same folder', () => {
        const types = [
            makeNoteType({
                id: 'alpha',
                name: 'Alpha',
                folder: 'Work',
                granularity: 'day',
                format: 'YYYY-MM-DD',
            }),
            makeNoteType({ id: 'beta', name: 'Beta', folder: 'Work', granularity: 'month' }),
        ];

        expect(findRenderedPathCollisions(types)).toBeNull();
    });

    it('should ignore disabled types', () => {
        const types = [
            makeNoteType({ id: 'alpha', name: 'Alpha', folder: 'Work', format: 'YYYY-MM-DD' }),
            makeNoteType({
                id: 'beta',
                name: 'Beta',
                folder: 'Work',
                format: 'YYYY-MM-DD',
                enabled: false,
            }),
        ];

        expect(findRenderedPathCollisions(types)).toBeNull();
    });

    it('should return null with fewer than two enabled types', () => {
        expect(findRenderedPathCollisions([])).toBeNull();
        expect(findRenderedPathCollisions([makeNoteType()])).toBeNull();
    });
});
