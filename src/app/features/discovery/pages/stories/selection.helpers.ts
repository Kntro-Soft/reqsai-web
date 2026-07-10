/**
 * Pure helpers for the backlog's PER-PAGE multi-select. Selection is a set of story
 * ids scoped to the currently visible (server-side) page: it is cleared whenever the
 * page, filters or sort change, so it never carries ids the user can't see. Kept free
 * of Angular so the toggle / select-all / indeterminate rules are unit-tested directly.
 */

/** Toggles a single id in the selection, returning a NEW set (immutability for signals). */
export function toggleId(selected: ReadonlySet<string>, id: string): ReadonlySet<string> {
  const next = new Set(selected);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

/**
 * Header-checkbox toggle over the current page's ids: if every page row is already
 * selected, clears them all; otherwise selects the whole page. Returns a NEW set.
 */
export function toggleAllOnPage(
  selected: ReadonlySet<string>,
  pageIds: readonly string[],
): ReadonlySet<string> {
  if (allSelectedOnPage(selected, pageIds)) return new Set();
  return new Set(pageIds);
}

/** True when the page is non-empty and every one of its rows is selected. */
export function allSelectedOnPage(
  selected: ReadonlySet<string>,
  pageIds: readonly string[],
): boolean {
  return pageIds.length > 0 && pageIds.every((id) => selected.has(id));
}

/**
 * True when SOME — but not all — of the page's rows are selected: drives the header
 * checkbox's indeterminate (tri-state) flag. False for an empty or fully (un)selected page.
 */
export function someSelectedOnPage(
  selected: ReadonlySet<string>,
  pageIds: readonly string[],
): boolean {
  const count = pageIds.filter((id) => selected.has(id)).length;
  return count > 0 && count < pageIds.length;
}
