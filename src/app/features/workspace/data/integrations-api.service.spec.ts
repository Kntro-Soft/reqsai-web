import { describe, expect, it } from 'vitest';
import { buildIssueTypesParams } from './integrations-api.service';

describe('buildIssueTypesParams', () => {
  it('emits a trimmed projectKey', () => {
    expect(buildIssueTypesParams('  PROJ  ').get('projectKey')).toBe('PROJ');
  });

  it('emits no param for a blank projectKey', () => {
    expect(buildIssueTypesParams('   ').has('projectKey')).toBe(false);
  });

  it('emits no param for undefined', () => {
    expect(buildIssueTypesParams(undefined).keys()).toEqual([]);
  });
});
