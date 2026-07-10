/**
 * DTOs for the Jira integration API (locked backend contract, `Api-Version: 1`).
 *
 * An integration lives at two levels: an ORGANIZATION-level *connection* (the Jira
 * site credentials, encrypted server-side — the token is never returned), and a
 * PROJECT-level *target* that maps one project to a Jira project + issue type so
 * stories can be pushed as issues.
 */

/** The integration provider. Only Jira is supported for now. */
export type IntegrationProvider = 'JIRA';

/** Connection health, set by the backend from the last verification. */
export type IntegrationStatus = 'CONNECTED' | 'ERROR';

/**
 * How the connection's credentials were obtained: a manually pasted API token or
 * an Atlassian OAuth 2.0 authorization. OAuth connections may have a null `email`
 * (Atlassian doesn't always expose the account email).
 */
export type IntegrationCredentialType = 'API_TOKEN' | 'OAUTH2';

/**
 * An organization-level integration connection. Never carries the API token or
 * OAuth tokens — they are encrypted server-side and only ever sent TO the backend
 * on create / exchange.
 */
export interface IntegrationConnectionResponse {
  id: string;
  organizationId: string;
  provider: IntegrationProvider;
  siteUrl: string;
  /** The Atlassian account email. Null for OAuth connections that don't expose it. */
  email: string | null;
  status: IntegrationStatus;
  /** Whether this connection was created via a manual API token or Atlassian OAuth. */
  credentialType: IntegrationCredentialType;
  /** ISO instant of the last successful verification, or null if never verified. */
  lastVerifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Body for creating a Jira connection. The token is write-only (never returned). */
export interface CreateJiraConnectionRequest {
  siteUrl: string;
  email: string;
  apiToken: string;
}

/** Result of testing a connection: whether it verified and the resolved account name. */
export interface TestConnectionResponse {
  ok: boolean;
  accountName?: string;
}

/** A Jira project available on a connection's site. */
export interface JiraProjectResponse {
  key: string;
  name: string;
}

/** A Jira issue type available in a project. */
export interface JiraIssueTypeResponse {
  id: string;
  name: string;
}

/** The project → Jira mapping used when pushing stories. 404 from the backend when unset. */
export interface ProjectJiraTargetResponse {
  id: string;
  projectId: string;
  connectionId: string;
  jiraProjectKey: string;
  issueTypeName: string;
  createdAt: string;
  updatedAt: string;
}

/** Body for setting/updating a project's Jira push target. */
export interface UpsertProjectJiraTargetRequest {
  connectionId: string;
  jiraProjectKey: string;
  issueTypeName: string;
}

/** The outcome of pushing a single story: the created/updated Jira issue key + URL. */
export interface JiraPushResultResponse {
  storyId: string;
  jiraIssueKey: string;
  jiraIssueUrl: string;
}

/** Aggregate outcome of a push-all: per-story results plus pushed/failed counts. */
export interface JiraPushAllResponse {
  results: JiraPushResultResponse[];
  pushed: number;
  failed: number;
}

// --- Import FROM Jira ---

/**
 * One candidate Jira issue for import, as returned by the preview. `duplicate` is
 * true when an existing story already maps to this issue (then `existingStoryId`
 * points at it); such rows are de-selected by default in the import picker.
 */
export interface JiraImportIssue {
  jiraIssueKey: string;
  summary: string;
  issueType: string;
  duplicate: boolean;
  existingStoryId?: string;
}

/** The import preview: the candidate Jira issues plus the total available. */
export interface JiraImportPreviewResponse {
  total: number;
  issues: JiraImportIssue[];
}

/**
 * Body for POST import. Omit `issueKeys` (or send undefined) to import every
 * available issue; otherwise only the listed keys are imported.
 */
export interface JiraImportRequest {
  issueKeys?: string[];
}

/** The per-issue outcome of an import. */
export type JiraImportStatus = 'imported' | 'duplicate' | 'failed';

/** One issue's import result: its status and, when imported, the new story id. */
export interface JiraImportResult {
  jiraIssueKey: string;
  storyId?: string;
  status: JiraImportStatus;
  message?: string;
}

/** Aggregate outcome of an import: per-issue results plus imported/skipped/failed counts. */
export interface JiraImportResponse {
  imported: number;
  skipped: number;
  failed: number;
  results: JiraImportResult[];
}

// --- Background integration jobs (import / push-all) ---

/** The kind of background work an integration job performs. */
export type IntegrationJobType = 'IMPORT' | 'PUSH_ALL';

/** An integration job's lifecycle state. RUNNING is the only non-terminal state. */
export type IntegrationJobStatus = 'RUNNING' | 'COMPLETED' | 'FAILED';

/**
 * A background integration job (Jira import or push-all). Returned with 202 by the
 * import/push-all POSTs and streamed as full snapshots over the project's
 * `integration-jobs` STOMP topic while it progresses. `total` may be 0 while the
 * backend is still counting the work (render an indeterminate progress state).
 */
export interface IntegrationJobResponse {
  id: string;
  projectId: string;
  jobType: IntegrationJobType;
  status: IntegrationJobStatus;
  total: number;
  processed: number;
  succeeded: number;
  failed: number;
  /** A human-readable failure reason or backend error code; null while healthy. */
  message: string | null;
  createdAt: string;
  finishedAt: string | null;
}

/** True when the job reached a terminal state (COMPLETED or FAILED). */
export function isJobTerminal(job: Pick<IntegrationJobResponse, 'status'>): boolean {
  return job.status !== 'RUNNING';
}

/**
 * The job's progress as a 0–100 percentage, or null while it is indeterminate
 * (`total` is 0 or negative — the backend hasn't counted the work yet). Clamped so
 * an over-reporting backend can never overflow the progress bar. Pure/testable.
 */
export function jobProgressPercent(
  job: Pick<IntegrationJobResponse, 'processed' | 'total'>,
): number | null {
  if (job.total <= 0) return null;
  const percent = Math.round((job.processed / job.total) * 100);
  return Math.min(100, Math.max(0, percent));
}

/** The i18n key of the banner label for a running job of this type. Pure/testable. */
export function jobLabelKey(jobType: IntegrationJobType): string {
  return jobType === 'IMPORT'
    ? 'integrations.jobs.importRunning'
    : 'integrations.jobs.pushRunning';
}

// --- Atlassian OAuth 2.0 ---

/**
 * The Atlassian consent URL to redirect the browser to, plus the signed anti-forgery
 * `state` that round-trips through the redirect. The `state` is NOT a secret — the
 * backend signs and verifies it — so it may be stashed client-side purely to
 * double-check on return.
 */
export interface AuthorizeUrlResponse {
  url: string;
  state: string;
}

/**
 * Body for exchanging the Atlassian authorization `code` (and `state`) for a saved
 * connection. When the account has multiple Atlassian sites the first call returns a
 * site picker and nothing is saved; the caller re-POSTs with the chosen `cloudId`.
 */
export interface JiraOAuthCallbackRequest {
  code: string;
  state: string;
  cloudId?: string;
}

/** One Atlassian site (cloud instance) the authorized account can access. */
export interface JiraSiteResponse {
  cloudId: string;
  url: string;
  name: string;
}

/** The site-picker branch of the callback: multiple sites, nothing saved yet. */
export interface JiraSitesResponse {
  sites: JiraSiteResponse[];
}

/**
 * The two shapes the OAuth callback can return: a saved {@link IntegrationConnectionResponse}
 * or a {@link JiraSitesResponse} site picker. Discriminate with {@link isSitesResult}.
 */
export type OAuthCallbackResult = IntegrationConnectionResponse | JiraSitesResponse;

/**
 * Type guard discriminating the OAuth callback result: `true` when the backend
 * returned a site picker (multiple Atlassian sites, nothing saved), `false` when it
 * returned a saved connection. Pure and exported so it is unit-tested without HTTP.
 */
export function isSitesResult(result: OAuthCallbackResult): result is JiraSitesResponse {
  return Array.isArray((result as JiraSitesResponse).sites);
}

/**
 * The Jira issue keys selected by default in the import picker: every NON-duplicate
 * candidate. Duplicates (already mapped to an existing story) are left unchecked so
 * a confirm imports only new work by default. Pure and exported so it is unit-tested.
 */
export function defaultImportSelection(preview: JiraImportPreviewResponse): string[] {
  return preview.issues.filter((i) => !i.duplicate).map((i) => i.jiraIssueKey);
}

/**
 * The counts to surface after an import, derived defensively from the per-issue
 * `results` rather than trusting the top-level tallies, so the toast can never
 * disagree with the rows. `imported`/`duplicate`/`failed` map to the status values;
 * `skipped` counts the duplicates (nothing was created for them). Pure/testable.
 */
export function summarizeImport(response: JiraImportResponse): {
  imported: number;
  skipped: number;
  failed: number;
} {
  let imported = 0;
  let skipped = 0;
  let failed = 0;
  for (const r of response.results) {
    if (r.status === 'imported') imported++;
    else if (r.status === 'duplicate') skipped++;
    else failed++;
  }
  return { imported, skipped, failed };
}
