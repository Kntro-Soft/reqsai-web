import { describe, expect, it } from 'vitest';
import { buildIssueTypesParams } from './integrations-api.service';
import {
  defaultImportSelection,
  isJobTerminal,
  isSitesResult,
  jobLabelKey,
  jobProgressPercent,
  summarizeImport,
  type IntegrationConnectionResponse,
  type JiraImportPreviewResponse,
  type JiraImportResponse,
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

describe('defaultImportSelection', () => {
  const preview: JiraImportPreviewResponse = {
    total: 3,
    issues: [
      { jiraIssueKey: 'PROJ-1', summary: 'New login', issueType: 'Story', duplicate: false },
      {
        jiraIssueKey: 'PROJ-2',
        summary: 'Already imported',
        issueType: 'Story',
        duplicate: true,
        existingStoryId: 's-2',
      },
      { jiraIssueKey: 'PROJ-3', summary: 'Fix bug', issueType: 'Bug', duplicate: false },
    ],
  };

  it('pre-selects only the non-duplicate issues', () => {
    expect(defaultImportSelection(preview)).toEqual(['PROJ-1', 'PROJ-3']);
  });

  it('returns an empty selection when every candidate is a duplicate', () => {
    const allDup: JiraImportPreviewResponse = {
      total: 1,
      issues: [{ jiraIssueKey: 'PROJ-9', summary: 'Dup', issueType: 'Story', duplicate: true }],
    };
    expect(defaultImportSelection(allDup)).toEqual([]);
  });

  it('returns an empty selection for an empty preview', () => {
    expect(defaultImportSelection({ total: 0, issues: [] })).toEqual([]);
  });
});

describe('summarizeImport', () => {
  it('counts imported, skipped (duplicate) and failed from the per-issue results', () => {
    const response: JiraImportResponse = {
      imported: 2,
      skipped: 1,
      failed: 1,
      results: [
        { jiraIssueKey: 'PROJ-1', storyId: 's-1', status: 'imported' },
        { jiraIssueKey: 'PROJ-3', storyId: 's-3', status: 'imported' },
        { jiraIssueKey: 'PROJ-2', status: 'duplicate' },
        { jiraIssueKey: 'PROJ-4', status: 'failed', message: 'boom' },
      ],
    };
    expect(summarizeImport(response)).toEqual({ imported: 2, skipped: 1, failed: 1 });
  });

  it('derives counts from results even when the top-level tallies disagree', () => {
    const response: JiraImportResponse = {
      imported: 99,
      skipped: 99,
      failed: 99,
      results: [{ jiraIssueKey: 'PROJ-1', storyId: 's-1', status: 'imported' }],
    };
    expect(summarizeImport(response)).toEqual({ imported: 1, skipped: 0, failed: 0 });
  });

  it('returns all-zero counts for an empty result set', () => {
    expect(summarizeImport({ imported: 0, skipped: 0, failed: 0, results: [] })).toEqual({
      imported: 0,
      skipped: 0,
      failed: 0,
    });
  });
});

describe('isJobTerminal', () => {
  it('is false while the job is running', () => {
    expect(isJobTerminal({ status: 'RUNNING' })).toBe(false);
  });

  it('is true for completed and failed jobs', () => {
    expect(isJobTerminal({ status: 'COMPLETED' })).toBe(true);
    expect(isJobTerminal({ status: 'FAILED' })).toBe(true);
  });
});

describe('jobProgressPercent', () => {
  it('is null while the total is unknown (indeterminate)', () => {
    expect(jobProgressPercent({ processed: 3, total: 0 })).toBeNull();
  });

  it('rounds the processed/total ratio to a whole percentage', () => {
    expect(jobProgressPercent({ processed: 1, total: 3 })).toBe(33);
    expect(jobProgressPercent({ processed: 3, total: 3 })).toBe(100);
  });

  it('clamps an over-reporting backend to 100', () => {
    expect(jobProgressPercent({ processed: 7, total: 3 })).toBe(100);
  });

  it('clamps a negative processed count to 0', () => {
    expect(jobProgressPercent({ processed: -1, total: 3 })).toBe(0);
  });
});

describe('jobLabelKey', () => {
  it('selects the import label for IMPORT jobs', () => {
    expect(jobLabelKey('IMPORT')).toBe('integrations.jobs.importRunning');
  });

  it('selects the push label for PUSH_ALL jobs', () => {
    expect(jobLabelKey('PUSH_ALL')).toBe('integrations.jobs.pushRunning');
  });
});
