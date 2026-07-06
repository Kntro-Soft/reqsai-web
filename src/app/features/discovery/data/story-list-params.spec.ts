import { buildStoryListParams } from './discovery-api.service';

describe('buildStoryListParams', () => {
  it('emits nothing for an empty filter set', () => {
    expect(buildStoryListParams({}).keys()).toEqual([]);
  });

  it('emits page and size including zero', () => {
    const params = buildStoryListParams({ page: 0, size: 20 });
    expect(params.get('page')).toBe('0');
    expect(params.get('size')).toBe('20');
  });

  it('emits sort, search, status, priority and date range', () => {
    const params = buildStoryListParams({
      sortBy: 'title',
      sortDirection: 'ASC',
      search: 'upload',
      status: 'DRAFT',
      priority: 'HIGH',
      createdAfter: '2026-06-01T00:00:00Z',
      createdBefore: '2026-07-01T00:00:00Z',
    });
    expect(params.get('sortBy')).toBe('title');
    expect(params.get('sortDirection')).toBe('ASC');
    expect(params.get('search')).toBe('upload');
    expect(params.get('status')).toBe('DRAFT');
    expect(params.get('priority')).toBe('HIGH');
    expect(params.get('createdAfter')).toBe('2026-06-01T00:00:00Z');
    expect(params.get('createdBefore')).toBe('2026-07-01T00:00:00Z');
  });

  it('trims and drops blank string filters', () => {
    const params = buildStoryListParams({ search: '   ', status: undefined });
    expect(params.has('search')).toBe(false);
    expect(params.has('status')).toBe(false);
  });

  it('trims surrounding whitespace on a real search term', () => {
    expect(buildStoryListParams({ search: '  csv  ' }).get('search')).toBe('csv');
  });
});
