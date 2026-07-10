import { describe, expect, it } from 'vitest';
import {
  allSelectedOnPage,
  someSelectedOnPage,
  toggleAllOnPage,
  toggleId,
} from './selection.helpers';

describe('toggleId', () => {
  it('adds an id that is not selected', () => {
    expect([...toggleId(new Set(['a']), 'b')]).toEqual(['a', 'b']);
  });

  it('removes an id that is already selected', () => {
    expect([...toggleId(new Set(['a', 'b']), 'a')]).toEqual(['b']);
  });

  it('returns a new set (does not mutate the input)', () => {
    const input = new Set(['a']);
    const output = toggleId(input, 'b');
    expect(output).not.toBe(input);
    expect([...input]).toEqual(['a']);
  });
});

describe('toggleAllOnPage', () => {
  const page = ['a', 'b', 'c'];

  it('selects the whole page when nothing is selected', () => {
    expect([...toggleAllOnPage(new Set(), page)]).toEqual(page);
  });

  it('selects the whole page when only some rows are selected', () => {
    expect([...toggleAllOnPage(new Set(['a']), page)]).toEqual(page);
  });

  it('clears the selection when every row is already selected', () => {
    expect([...toggleAllOnPage(new Set(page), page)]).toEqual([]);
  });

  it('replaces cross-page selection with only the current page ids', () => {
    // A stale id from another page is dropped — selection stays per-page.
    expect([...toggleAllOnPage(new Set(['a']), page)]).toEqual(page);
  });
});

describe('allSelectedOnPage', () => {
  it('is true only when every page row is selected', () => {
    expect(allSelectedOnPage(new Set(['a', 'b']), ['a', 'b'])).toBe(true);
    expect(allSelectedOnPage(new Set(['a']), ['a', 'b'])).toBe(false);
  });

  it('is false for an empty page', () => {
    expect(allSelectedOnPage(new Set(['a']), [])).toBe(false);
  });
});

describe('someSelectedOnPage', () => {
  it('is true when a strict subset of the page is selected', () => {
    expect(someSelectedOnPage(new Set(['a']), ['a', 'b'])).toBe(true);
  });

  it('is false when the page is fully selected', () => {
    expect(someSelectedOnPage(new Set(['a', 'b']), ['a', 'b'])).toBe(false);
  });

  it('is false when nothing on the page is selected', () => {
    expect(someSelectedOnPage(new Set(['x']), ['a', 'b'])).toBe(false);
  });

  it('is false for an empty page', () => {
    expect(someSelectedOnPage(new Set(), [])).toBe(false);
  });
});
