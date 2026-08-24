import { describe, expect, it } from 'vitest';
import { DEFAULT_FORMATS, DEFAULT_NOTE_TYPE, ensureNonEmptyTypes, makeWorkSeed } from '../src/constants';

describe('DEFAULT_FORMATS', () => {
  it('should map each granularity to its format string', () => {
    expect(DEFAULT_FORMATS.day).toBe('YYYY-MM-DD');
    expect(DEFAULT_FORMATS.week).toBe('gggg-[W]ww');
    expect(DEFAULT_FORMATS.month).toBe('YYYY-MM');
    expect(DEFAULT_FORMATS.quarter).toBe('YYYY-[Q]Q');
    expect(DEFAULT_FORMATS.year).toBe('YYYY');
  });

  it('should contain exactly the five granularity keys', () => {
    expect(Object.keys(DEFAULT_FORMATS).sort()).toEqual(['day', 'month', 'quarter', 'week', 'year']);
  });

  it('should be frozen against mutation', () => {
    expect(Object.isFrozen(DEFAULT_FORMATS)).toBe(true);
  });
});

describe('DEFAULT_NOTE_TYPE', () => {
  it('should default to an enabled daily note with empty path fields', () => {
    expect(DEFAULT_NOTE_TYPE.enabled).toBe(true);
    expect(DEFAULT_NOTE_TYPE.granularity).toBe('day');
    expect(DEFAULT_NOTE_TYPE.folder).toBe('');
    expect(DEFAULT_NOTE_TYPE.format).toBe('');
    expect(DEFAULT_NOTE_TYPE.templatePath).toBe('');
    expect(DEFAULT_NOTE_TYPE.openAtStartup).toBe(false);
  });

  it('should be frozen against mutation', () => {
    expect(Object.isFrozen(DEFAULT_NOTE_TYPE)).toBe(true);
  });

  it('should form a complete config when spread with id and name', () => {
    const config = { ...DEFAULT_NOTE_TYPE, id: 'work', name: 'Work' };
    expect(config.id).toBe('work');
    expect(config.name).toBe('Work');
    expect(config.enabled).toBe(true);
    expect(config.granularity).toBe('day');
  });
});

describe('makeWorkSeed', () => {
  it('should return a fresh copy on every call', () => {
    const first = makeWorkSeed();
    const second = makeWorkSeed();
    expect(first).not.toBe(second);
    expect(first).toEqual(second);
  });

  it('should seed the default work id, name, and folder', () => {
    const seed = makeWorkSeed();
    expect(seed.id).toBe('work');
    expect(seed.name).toBe('Work');
    expect(seed.folder).toBe('Work');
    expect(seed.granularity).toBe('day');
    expect(seed.format).toBe('');
    expect(seed.templatePath).toBe('');
    expect(seed.openAtStartup).toBe(false);
  });

  it('should be a complete config matching the DAY_DEFAULT spread over the work identity', () => {
    expect(makeWorkSeed()).toEqual({
      ...DEFAULT_NOTE_TYPE,
      id: 'work',
      name: 'Work',
      folder: 'Work',
    });
  });
});

describe('ensureNonEmptyTypes', () => {
  it('should return the input list unchanged (same reference) when non-empty', () => {
    const types = [makeWorkSeed()];
    expect(ensureNonEmptyTypes(types)).toBe(types);
  });

  it('should return the work seed for an empty list', () => {
    expect(ensureNonEmptyTypes([])).toEqual([makeWorkSeed()]);
  });
});
