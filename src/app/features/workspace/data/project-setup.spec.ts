import { afterEach, describe, expect, it } from 'vitest';
import {
  MAX_SETUP_REPOSITORIES,
  PROJECT_DRAFT_KEY,
  PickedRepository,
  ProjectDraft,
  buildSources,
  profileFromSources,
  canRetry,
  canSkip,
  discardDraft,
  dismissedKey,
  emptyDraft,
  failureEntries,
  isDismissed,
  jiraIncomplete,
  orderedSteps,
  partialFailures,
  rememberDismissed,
  saveDraft,
  sanitizeDraft,
  setPickBranch,
  setupActive,
  setupFailed,
  setupFinished,
  stepLabelKey,
  stepPercent,
  takeDraft,
  togglePick,
} from './project-setup';
import { ProjectSetupResponse, SetupStepResponse } from './project-setup.models';

function step(overrides: Partial<SetupStepResponse>): SetupStepResponse {
  return { key: 'GITHUB_REPOS', status: 'RUNNING', done: 0, total: 0, detail: null, ...overrides };
}

function setup(...steps: SetupStepResponse[]): ProjectSetupResponse {
  return { projectId: 'p1', active: false, steps, detectedStack: null };
}

const REPO = { installationId: 1, fullName: 'acme/a' };

describe('wizard sources', () => {
  it('sends nothing when no source is chosen', () => {
    expect(buildSources(emptyDraft())).toBeUndefined();
  });

  it('sends the Jira project only when it names a project and an issue type', () => {
    const draft = emptyDraft();
    draft.jira = {
      enabled: true,
      connectionId: 'c1',
      projectKey: ' PAY ',
      issueTypeName: 'Story',
      importStories: true,
    };

    expect(buildSources(draft)).toEqual({
      jira: { connectionId: 'c1', projectKey: 'PAY', issueTypeName: 'Story', importStories: true },
    });
    draft.jira.issueTypeName = '';
    expect(jiraIncomplete(draft.jira)).toBe(true);
    expect(buildSources(draft)).toBeUndefined();
    draft.jira.enabled = false;
    expect(jiraIncomplete(draft.jira)).toBe(false);
  });

  it('sends the picked repositories with their installation and a trimmed optional branch', () => {
    const draft = emptyDraft();
    draft.repositories = [
      { installationId: 7, fullName: 'acme/a', branch: ' develop ' },
      { installationId: 7, fullName: 'acme/b', branch: '  ' },
    ];

    expect(buildSources(draft)).toEqual({
      github: [
        { repository: 'acme/a', installationId: 7, branch: 'develop' },
        { repository: 'acme/b', installationId: 7 },
      ],
    });
  });

  it('toggles picks, never past the limit, and keeps branches per repository', () => {
    let picks: PickedRepository[] = [];
    for (const name of ['a', 'b', 'c', 'd']) {
      picks = togglePick(picks, { installationId: 1, fullName: `acme/${name}` });
    }
    expect(picks.map((p) => p.fullName)).toEqual(['acme/a', 'acme/b', 'acme/c']);
    expect(picks).toHaveLength(MAX_SETUP_REPOSITORIES);

    picks = setPickBranch(picks, { installationId: 1, fullName: 'acme/b' }, 'main');
    expect(picks.find((p) => p.fullName === 'acme/b')?.branch).toBe('main');
    picks = togglePick(picks, { installationId: 1, fullName: 'acme/a' });
    expect(picks.map((p) => p.fullName)).toEqual(['acme/b', 'acme/c']);
    expect(togglePick([], REPO)).toEqual([{ ...REPO, branch: '' }]);
  });
});

describe('wizard draft', () => {
  afterEach(() => sessionStorage.clear());

  it('survives the trip to GitHub once, and is cleared when taken', () => {
    const draft: ProjectDraft = { ...emptyDraft(), step: 2, name: 'Portal' };
    draft.repositories = [{ installationId: 3, fullName: 'acme/a', branch: 'x' }];
    saveDraft(draft);

    expect(takeDraft()).toEqual(draft);
    expect(takeDraft()).toBeNull();
  });

  it('can be discarded', () => {
    saveDraft(emptyDraft());
    discardDraft();
    expect(sessionStorage.getItem(PROJECT_DRAFT_KEY)).toBeNull();
  });

  it('rebuilds only known fields of the right type from storage', () => {
    const draft = sanitizeDraft({
      step: 9,
      name: 42,
      frameworks: ['Angular', 7],
      jira: { enabled: 'yes', projectKey: 'PAY' },
      repositories: [{ fullName: 'acme/a', installationId: 1 }, { fullName: 5 }, null],
      evil: '<script>',
    });

    expect(draft).not.toBeNull();
    expect(draft?.step).toBe(1);
    expect(draft?.name).toBe('');
    expect(draft?.frameworks).toEqual(['Angular']);
    expect(draft?.jira.enabled).toBe(false);
    expect(draft?.jira.projectKey).toBe('PAY');
    expect(draft?.repositories).toEqual([{ installationId: 1, fullName: 'acme/a', branch: '' }]);
    expect(sanitizeDraft('nope')).toBeNull();
  });

  it('ignores a corrupt entry', () => {
    sessionStorage.setItem(PROJECT_DRAFT_KEY, '{not json');
    expect(takeDraft()).toBeNull();
  });
});

describe('setup steps', () => {
  it('knows when the setup is active, failed or finished', () => {
    expect(setupActive(null)).toBe(false);
    expect(setupActive(setup(step({ status: 'PENDING' })))).toBe(true);
    expect(setupActive(setup(step({ status: 'DONE' }), step({ status: 'RUNNING' })))).toBe(true);
    expect(setupFailed(setup(step({ status: 'DONE' }), step({ status: 'FAILED' })))).toBe(true);
    expect(setupFinished(setup(step({ status: 'DONE' }), step({ status: 'SKIPPED' })))).toBe(true);
    expect(setupFinished(setup(step({ status: 'FAILED' })))).toBe(false);
    expect(setupFinished(setup())).toBe(false);
  });

  it('lets a step be skipped while open or failed, and retried only after a failure', () => {
    expect(canSkip(step({ status: 'RUNNING' }))).toBe(true);
    expect(canSkip(step({ status: 'FAILED' }))).toBe(true);
    expect(canSkip(step({ status: 'DONE' }))).toBe(false);
    expect(canSkip(step({ status: 'SKIPPED' }))).toBe(false);
    expect(canRetry(step({ status: 'FAILED' }))).toBe(true);
    expect(canRetry(step({ status: 'RUNNING' }))).toBe(false);
  });

  it('measures progress only when the total is known', () => {
    expect(stepPercent(step({ done: 3, total: 7 }))).toBe(43);
    expect(stepPercent(step({ done: 9, total: 7 }))).toBe(100);
    expect(stepPercent(step({ done: 3, total: 0 }))).toBeNull();
  });

  it('picks the label from the state, with counts while they are known', () => {
    expect(stepLabelKey(step({ status: 'RUNNING', total: 7 }))).toBe(
      'setup.step.GITHUB_REPOS.PROGRESS',
    );
    expect(stepLabelKey(step({ status: 'RUNNING', total: 0 }))).toBe(
      'setup.step.GITHUB_REPOS.RUNNING',
    );
    expect(stepLabelKey(step({ key: 'JIRA_LINK', status: 'PENDING' }))).toBe(
      'setup.step.JIRA_LINK.RUNNING',
    );
    expect(stepLabelKey(step({ key: 'JIRA_IMPORT', status: 'SKIPPED' }))).toBe(
      'setup.step.JIRA_IMPORT.SKIPPED',
    );
  });

  it('orders the steps for display', () => {
    const ordered = orderedSteps(
      setup(
        step({ key: 'GITHUB_REPOS' }),
        step({ key: 'JIRA_IMPORT' }),
        step({ key: 'JIRA_LINK' }),
      ),
    );
    expect(ordered.map((s) => s.key)).toEqual(['JIRA_LINK', 'JIRA_IMPORT', 'GITHUB_REPOS']);
    expect(orderedSteps(null)).toEqual([]);
  });

  it('splits a failure into its entries', () => {
    expect(failureEntries(null)).toEqual([]);
    expect(failureEntries('INTEGRATION_CONNECTION_NOT_FOUND')).toEqual([
      { subject: null, code: 'INTEGRATION_CONNECTION_NOT_FOUND' },
    ]);
    expect(failureEntries('acme/a: CODE_REPOSITORY_NOT_FOUND; acme/b: SETUP_STEP_FAILED')).toEqual([
      { subject: 'acme/a', code: 'CODE_REPOSITORY_NOT_FOUND' },
      { subject: 'acme/b', code: 'SETUP_STEP_FAILED' },
    ]);
    expect(partialFailures('PARTIAL:3')).toBe(3);
    expect(partialFailures('CODE')).toBeNull();
  });
});

describe('dismissal', () => {
  afterEach(() => localStorage.clear());

  it('is remembered per project', () => {
    expect(isDismissed('p1')).toBe(false);
    rememberDismissed('p1');
    expect(isDismissed('p1')).toBe(true);
    expect(isDismissed('p2')).toBe(false);
    expect(localStorage.getItem(dismissedKey('p1'))).toBe('1');
  });
});

describe('profileFromSources', () => {
  it('says nothing without sources', () => {
    expect(profileFromSources(null, [])).toEqual({ name: null, description: null, languages: [] });
  });

  it('prefers the Jira project and falls back to the first repository', () => {
    const repos = [
      { name: 'reservas-api', description: 'API de reservas', language: 'Java' },
      { name: 'reservas-web', description: null, language: 'TypeScript' },
      { name: 'infra', description: 'x', language: 'java' },
    ];

    expect(profileFromSources({ name: 'Reservas', description: ' ' }, repos)).toEqual({
      name: 'Reservas',
      description: 'API de reservas',
      languages: ['Java', 'TypeScript', 'java'],
    });
    expect(profileFromSources(null, repos).name).toBe('reservas-api');
  });
});
