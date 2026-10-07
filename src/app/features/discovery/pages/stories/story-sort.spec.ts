import { priorityRank, sortByPriority } from './story-sort';

const story = (id: string, priority: string, createdAt: string) => ({ id, priority, createdAt });

describe('priorityRank', () => {
  it('ranks by urgency, case-insensitively, defaulting unknowns to medium', () => {
    expect(priorityRank('CRITICAL')).toBeGreaterThan(priorityRank('HIGH'));
    expect(priorityRank('high')).toBeGreaterThan(priorityRank('MEDIUM'));
    expect(priorityRank('MEDIUM')).toBeGreaterThan(priorityRank('LOW'));
    expect(priorityRank(null)).toBe(priorityRank('MEDIUM'));
    expect(priorityRank('URGENT')).toBe(priorityRank('MEDIUM'));
  });
});

describe('sortByPriority', () => {
  // What the backend returns for sortBy=priority DESC: the enum sorted alphabetically.
  const alphabetical = [
    story('m', 'MEDIUM', '2026-10-01T10:00:00Z'),
    story('l', 'LOW', '2026-10-02T10:00:00Z'),
    story('h', 'HIGH', '2026-10-03T10:00:00Z'),
    story('c', 'CRITICAL', '2026-10-04T10:00:00Z'),
  ];

  it('puts the most urgent first when descending', () => {
    expect(sortByPriority(alphabetical, 'DESC').map((s) => s.id)).toEqual(['c', 'h', 'm', 'l']);
  });

  it('puts the least urgent first when ascending', () => {
    expect(sortByPriority(alphabetical, 'ASC').map((s) => s.id)).toEqual(['l', 'm', 'h', 'c']);
  });

  it('keeps the newest first within the same priority', () => {
    const sameLevel = [
      story('older', 'HIGH', '2026-10-01T10:00:00Z'),
      story('newer', 'HIGH', '2026-10-05T10:00:00Z'),
    ];
    expect(sortByPriority(sameLevel, 'DESC').map((s) => s.id)).toEqual(['newer', 'older']);
  });

  it('does not mutate its input', () => {
    const input = [...alphabetical];
    sortByPriority(input, 'DESC');
    expect(input.map((s) => s.id)).toEqual(['m', 'l', 'h', 'c']);
  });
});
