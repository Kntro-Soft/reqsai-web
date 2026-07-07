import { describe, expect, it } from 'vitest';
import { buildIssueTypesParams } from './integrations-api.service';
import {
  isSitesResult,
  type IntegrationConnectionResponse,
  type JiraSitesResponse,
} from './integrations.models';

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

describe('isSitesResult', () => {
  const connection: IntegrationConnectionResponse = {
    id: 'c1',
    organizationId: 'o1',
    provider: 'JIRA',
    siteUrl: 'https://acme.atlassian.net',
    email: null,
    status: 'CONNECTED',
    credentialType: 'OAUTH2',
    lastVerifiedAt: null,
    createdAt: '2026-07-06T00:00:00Z',
    updatedAt: '2026-07-06T00:00:00Z',
  };

  it('is true for a site-picker result', () => {
    const sites: JiraSitesResponse = {
      sites: [{ cloudId: 'cloud-1', url: 'https://acme.atlassian.net', name: 'Acme' }],
    };
    expect(isSitesResult(sites)).toBe(true);
  });

  it('is true even when the sites list is empty (still the picker shape)', () => {
    expect(isSitesResult({ sites: [] })).toBe(true);
  });

  it('is false for a saved connection result', () => {
    expect(isSitesResult(connection)).toBe(false);
  });
});
