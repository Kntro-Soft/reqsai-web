import { buildContextListParams } from './project-context-api.service';

describe('buildContextListParams', () => {
  it('emits nothing for an empty option set', () => {
    expect(buildContextListParams({}).keys()).toEqual([]);
  });

  it('emits page and size including zero', () => {
    const params = buildContextListParams({ page: 0, size: 50 });
    expect(params.get('page')).toBe('0');
    expect(params.get('size')).toBe('50');
  });

  it('emits a trimmed search term', () => {
    expect(buildContextListParams({ search: '  lead  ' }).get('search')).toBe('lead');
  });

  it('drops a blank search term', () => {
    expect(buildContextListParams({ search: '   ' }).has('search')).toBe(false);
  });
});
