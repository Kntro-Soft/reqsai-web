import { MAX_REPOSITORIES } from '../../discovery/data/codebase';
import {
  GitHubSourceRequest,
  JiraSourceRequest,
  ProjectSetupResponse,
  ProjectSourcesRequest,
  SetupStepKey,
  SetupStepResponse,
} from './project-setup.models';

/**
 * Pure rules of the create-project wizard and of the setup bar: which sources the wizard sends, how
 * its draft survives the trip to GitHub or Atlassian, and how the steps the server reports read
 * (open, failed, skippable, how far along). Kept free of Angular so they are unit-testable.
 */

/** Most repositories a new project connects (the same limit as a project's Code page). */
export const MAX_SETUP_REPOSITORIES = MAX_REPOSITORIES;

/** How often the setup is re-read while a step is open (the socket pushes it too). */
export const SETUP_POLL_MS = 4000;

/** How long the finished bar stays when there is nothing left to offer, before it dismisses itself. */
export const SETUP_AUTO_DISMISS_MS = 8000;

/** Session key of the wizard draft kept across the redirect to GitHub or Atlassian. */
export const PROJECT_DRAFT_KEY = 'reqsai.project.draft';

/** The steps in the order the bar shows them. */
export const SETUP_STEP_ORDER: readonly SetupStepKey[] = [
  'JIRA_LINK',
  'JIRA_IMPORT',
  'GITHUB_REPOS',
];

// ---- Wizard draft ----

/** A repository picked in the wizard. */
export interface PickedRepository {
  installationId: number;
  fullName: string;
  /** The branch typed for it; blank reads the repository's default. */
  branch: string;
}

/** The Jira part of the draft. */
export interface JiraDraft {
  enabled: boolean;
  connectionId: string;
  projectKey: string;
  issueTypeName: string;
  importStories: boolean;
}

/** Everything the wizard keeps: the basics of step 1 and the sources of step 2. */
export interface ProjectDraft {
  step: 1 | 2 | 3;
  name: string;
  description: string;
  domain: string;
  architecture: string;
  programmingLanguages: string[];
  frameworks: string[];
  clientPlatforms: string[];
  databases: string[];
  showAdvanced: boolean;
  jira: JiraDraft;
  repositories: PickedRepository[];
}

export function emptyDraft(): ProjectDraft {
  return {
    step: 1,
    name: '',
    description: '',
    domain: '',
    architecture: '',
    programmingLanguages: [],
    frameworks: [],
    clientPlatforms: [],
    databases: [],
    showAdvanced: false,
    jira: {
      enabled: false,
      connectionId: '',
      projectKey: '',
      issueTypeName: '',
      importStories: false,
    },
    repositories: [],
  };
}

/** True when the Jira part is switched on and names a project and an issue type. */
export function jiraReady(jira: JiraDraft): boolean {
  return jira.enabled && !!jira.projectKey.trim() && !!jira.issueTypeName.trim();
}

/** True when the Jira part is switched on but still lacks its project or issue type. */
export function jiraIncomplete(jira: JiraDraft): boolean {
  return jira.enabled && !jiraReady(jira);
}

/** The sources the create request carries; undefined when the wizard asks for none. */
export function buildSources(draft: ProjectDraft): ProjectSourcesRequest | undefined {
  const sources: ProjectSourcesRequest = {};
  if (jiraReady(draft.jira)) {
    const jira: JiraSourceRequest = {
      projectKey: draft.jira.projectKey.trim(),
      issueTypeName: draft.jira.issueTypeName.trim(),
      importStories: draft.jira.importStories,
    };
    if (draft.jira.connectionId) jira.connectionId = draft.jira.connectionId;
    sources.jira = jira;
  }
  if (draft.repositories.length > 0) {
    sources.github = draft.repositories.slice(0, MAX_SETUP_REPOSITORIES).map((repo) => {
      const github: GitHubSourceRequest = {
        repository: repo.fullName,
        installationId: repo.installationId,
      };
      const branch = repo.branch.trim();
      if (branch) github.branch = branch;
      return github;
    });
  }
  return sources.jira || sources.github ? sources : undefined;
}

/** True when a repository is already picked (same installation and name). */
export function isPicked(
  picks: readonly PickedRepository[],
  repo: Pick<PickedRepository, 'installationId' | 'fullName'>,
): boolean {
  return picks.some(
    (p) => p.installationId === repo.installationId && p.fullName === repo.fullName,
  );
}

/** Adds the repository, or removes it when already picked; a pick past the limit is ignored. */
export function togglePick(
  picks: readonly PickedRepository[],
  repo: Pick<PickedRepository, 'installationId' | 'fullName'>,
  max: number = MAX_SETUP_REPOSITORIES,
): PickedRepository[] {
  if (isPicked(picks, repo)) {
    return picks.filter(
      (p) => !(p.installationId === repo.installationId && p.fullName === repo.fullName),
    );
  }
  if (picks.length >= max) return [...picks];
  return [...picks, { installationId: repo.installationId, fullName: repo.fullName, branch: '' }];
}

/** Sets the branch of a picked repository. */
export function setPickBranch(
  picks: readonly PickedRepository[],
  repo: Pick<PickedRepository, 'installationId' | 'fullName'>,
  branch: string,
): PickedRepository[] {
  return picks.map((p) =>
    p.installationId === repo.installationId && p.fullName === repo.fullName ? { ...p, branch } : p,
  );
}

/** Remembers the draft for the trip to GitHub or Atlassian (a no-op without storage). */
export function saveDraft(draft: ProjectDraft): void {
  try {
    sessionStorage.setItem(PROJECT_DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // Private mode or storage disabled: the wizard starts over after the redirect.
  }
}

/** The remembered draft, once (it is cleared), or null when there is none or it is not a draft. */
export function takeDraft(): ProjectDraft | null {
  try {
    const raw = sessionStorage.getItem(PROJECT_DRAFT_KEY);
    sessionStorage.removeItem(PROJECT_DRAFT_KEY);
    return raw ? sanitizeDraft(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function discardDraft(): void {
  try {
    sessionStorage.removeItem(PROJECT_DRAFT_KEY);
  } catch {
    // Nothing to clear without storage.
  }
}

function text(value: unknown, max = 2000): string {
  return typeof value === 'string' ? value.slice(0, max) : '';
}

function textList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === 'string').slice(0, 50)
    : [];
}

/** Rebuilds a draft from untrusted storage: only known fields of the right type survive. */
export function sanitizeDraft(value: unknown): ProjectDraft | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const jira = (raw['jira'] && typeof raw['jira'] === 'object' ? raw['jira'] : {}) as Record<
    string,
    unknown
  >;
  const repositories = Array.isArray(raw['repositories']) ? raw['repositories'] : [];
  const step = raw['step'] === 2 || raw['step'] === 3 ? raw['step'] : 1;
  return {
    step,
    name: text(raw['name'], 150),
    description: text(raw['description']),
    domain: text(raw['domain'], 100),
    architecture: text(raw['architecture'], 100),
    programmingLanguages: textList(raw['programmingLanguages']),
    frameworks: textList(raw['frameworks']),
    clientPlatforms: textList(raw['clientPlatforms']),
    databases: textList(raw['databases']),
    showAdvanced: raw['showAdvanced'] === true,
    jira: {
      enabled: jira['enabled'] === true,
      connectionId: text(jira['connectionId'], 64),
      projectKey: text(jira['projectKey'], 100),
      issueTypeName: text(jira['issueTypeName'], 100),
      importStories: jira['importStories'] === true,
    },
    repositories: repositories
      .filter(
        (r): r is Record<string, unknown> =>
          !!r &&
          typeof r === 'object' &&
          typeof (r as Record<string, unknown>)['fullName'] === 'string' &&
          typeof (r as Record<string, unknown>)['installationId'] === 'number',
      )
      .slice(0, MAX_SETUP_REPOSITORIES)
      .map((r) => ({
        installationId: r['installationId'] as number,
        fullName: text(r['fullName'], 200),
        branch: text(r['branch'], 255),
      })),
  };
}

// ---- Setup bar ----

/** True while the step still has work ahead. */
export function isStepOpen(step: Pick<SetupStepResponse, 'status'>): boolean {
  return step.status === 'PENDING' || step.status === 'RUNNING';
}

/** True while any step still has work ahead. */
export function setupActive(setup: Pick<ProjectSetupResponse, 'steps'> | null): boolean {
  return !!setup && setup.steps.some(isStepOpen);
}

/** True when a step failed (the bar keeps it, with a retry, until dismissed). */
export function setupFailed(setup: Pick<ProjectSetupResponse, 'steps'> | null): boolean {
  return !!setup && setup.steps.some((s) => s.status === 'FAILED');
}

/** True when the project asked for sources and every step has settled without a failure. */
export function setupFinished(setup: Pick<ProjectSetupResponse, 'steps'> | null): boolean {
  return !!setup && setup.steps.length > 0 && !setupActive(setup) && !setupFailed(setup);
}

/** A step can be left out while it is open or after it failed; a finished one has nothing to skip. */
export function canSkip(step: Pick<SetupStepResponse, 'status'>): boolean {
  return isStepOpen(step) || step.status === 'FAILED';
}

export function canRetry(step: Pick<SetupStepResponse, 'status'>): boolean {
  return step.status === 'FAILED';
}

/** Progress as a whole percentage, or null while the total is unknown. */
export function stepPercent(step: Pick<SetupStepResponse, 'done' | 'total'>): number | null {
  if (!step.total || step.total <= 0) return null;
  return Math.min(100, Math.max(0, Math.round((Math.max(0, step.done) / step.total) * 100)));
}

/**
 * The i18n key of a step's label for its state. A waiting step reads as running; a running one
 * with a known total reads `PROGRESS` and takes `{done, total}`.
 */
export function stepLabelKey(step: Pick<SetupStepResponse, 'key' | 'status' | 'total'>): string {
  if (step.status === 'RUNNING' && step.total > 0) return `setup.step.${step.key}.PROGRESS`;
  const state = step.status === 'PENDING' ? 'RUNNING' : step.status;
  return `setup.step.${step.key}.${state}`;
}

/** The steps in display order (the server already sorts them; this guards an unknown key). */
export function orderedSteps(
  setup: Pick<ProjectSetupResponse, 'steps'> | null,
): SetupStepResponse[] {
  if (!setup) return [];
  return SETUP_STEP_ORDER.flatMap((key) => setup.steps.filter((s) => s.key === key));
}

/** One reason of a failed step: an error code, with the repository it is about when there is one. */
export interface FailureEntry {
  subject: string | null;
  code: string;
}

/**
 * Splits a failed step's `detail` into its entries. The server writes either one code
 * (`INTEGRATION_CONNECTION_NOT_FOUND`) or one `owner/name: CODE` per repository joined by `; `; free
 * text from an import job is kept as it is.
 */
export function failureEntries(detail: string | null | undefined): FailureEntry[] {
  const clean = detail?.trim();
  if (!clean) return [];
  return clean
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .map((part) => {
      const at = part.lastIndexOf(': ');
      if (at > 0) return { subject: part.slice(0, at), code: part.slice(at + 2) };
      return { subject: null, code: part };
    });
}

/** The count in an import's `PARTIAL:<n>` note, or null when the detail says something else. */
export function partialFailures(detail: string | null | undefined): number | null {
  const match = /^PARTIAL:(\d+)$/.exec(detail?.trim() ?? '');
  return match ? Number(match[1]) : null;
}

// ---- Dismissal ----

/** localStorage key under which the bar of a project remembers it was dismissed. */
export function dismissedKey(projectId: string): string {
  return `reqsai.setup.dismissed.${projectId}`;
}

export function isDismissed(projectId: string): boolean {
  try {
    return localStorage.getItem(dismissedKey(projectId)) === '1';
  } catch {
    return false;
  }
}

export function rememberDismissed(projectId: string): void {
  try {
    localStorage.setItem(dismissedKey(projectId), '1');
  } catch {
    // Without storage the bar just shows again on the next visit.
  }
}
