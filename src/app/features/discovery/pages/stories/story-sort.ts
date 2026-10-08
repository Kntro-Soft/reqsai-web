import { StorySortDirection } from '../../data/discovery.models';

/** Semantic rank of a priority (higher = more urgent); unknown values sort as MEDIUM. */
const PRIORITY_RANK: Record<string, number> = { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 };

export function priorityRank(priority: string | null | undefined): number {
  return PRIORITY_RANK[(priority ?? '').toUpperCase()] ?? PRIORITY_RANK['MEDIUM'];
}

/**
 * Re-orders a page of stories by the MEANING of their priority (Critical > High >
 * Medium > Low), newest first within a level. The backend persists the priority as
 * a string enum, so its `sortBy=priority` is alphabetical (Medium, Low, High,
 * Critical); this keeps the visible page in the order the column header promises.
 * Returns a new array; the input is never mutated.
 */
export function sortByPriority<T extends { priority: string; createdAt?: string | null }>(
  stories: readonly T[],
  direction: StorySortDirection,
): T[] {
  const sign = direction === 'ASC' ? 1 : -1;
  return [...stories].sort((a, b) => {
    const byRank = (priorityRank(a.priority) - priorityRank(b.priority)) * sign;
    if (byRank !== 0) return byRank;
    return Date.parse(b.createdAt ?? '') - Date.parse(a.createdAt ?? '') || 0;
  });
}
