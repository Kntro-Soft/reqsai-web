/**
 * Mirrors the codebase REST contract (`/api/projects/{projectId}/code/repositories`): the GitHub
 * repositories a project connects, the map of modules ReqsAI indexes from them, and the code
 * insight and transcript evidence AI suggestions carry.
 */

/** Where a repository is hosted. Only GitHub for now. */
export type CodeProvider = 'GITHUB';

/** How ReqsAI reads a repository: through the organization's GitHub App, or anonymously (public). */
export type CodeRepositorySource = 'GITHUB_APP' | 'PUBLIC';

/** Indexing lifecycle: queued, reading the files, done, or failed (`error` says why). */
export type CodeRepositoryStatus = 'PENDING' | 'INDEXING' | 'READY' | 'FAILED';

/** The technology ReqsAI recognized in a repository. */
export interface CodeProfile {
  languages: string[];
  frameworks: string[];
  databases: string[];
  platforms: string[];
  /** A short description of what the code does; null when nothing was summarized. */
  overview: string | null;
}

/** A connected repository (`GET …/code/repositories`). */
export interface CodeRepositoryResponse {
  id: string;
  projectId: string;
  provider: CodeProvider;
  owner: string;
  name: string;
  /** `owner/name`. */
  fullName: string;
  branch: string;
  htmlUrl: string;
  private: boolean;
  source: CodeRepositorySource;
  /** Whether every push to the branch updates the index (repositories read through the App). */
  autoUpdate: boolean;
  status: CodeRepositoryStatus;
  error: string | null;
  commitSha: string | null;
  /** When the last indexing finished (ISO 8601). */
  indexedAt: string | null;
  fileCount: number;
  moduleCount: number;
  /** Modules summarized so far while indexing. */
  modulesDone: number;
  /** False when no AI model was available: the modules carry heuristic summaries. */
  summarized: boolean;
  profile: CodeProfile;
  createdAt: string;
}

/**
 * `POST …/code/repositories`: `owner/name` or a github.com URL. `installationId` comes from the
 * GitHub picker; without it ReqsAI uses the organization's installation that shares the repository,
 * or reads it anonymously (public repositories only).
 */
export interface ConnectCodeRepositoryRequest {
  repository: string;
  branch?: string | null;
  installationId?: number | null;
}

/** A GitHub account where the organization installed the ReqsAI GitHub App. */
export interface GitHubInstallationResponse {
  installationId: number;
  /** GitHub login of the account. */
  account: string;
  accountType: string;
  /** `all` the account's repositories, or a `selected` few; null when GitHub did not say. */
  repositorySelection: 'all' | 'selected' | null;
  /** Where the account changes the shared repositories or uninstalls the App, on GitHub. */
  manageUrl: string | null;
  suspended: boolean;
  connectedAt: string;
}

/** `GET …/code/github`: whether the server has the App, and where the organization installed it. */
export interface GitHubConnectionResponse {
  available: boolean;
  installations: GitHubInstallationResponse[];
}

/** A repository the organization's GitHub App installation shares with ReqsAI. */
export interface GitHubRepositoryResponse {
  installationId: number;
  owner: string;
  name: string;
  fullName: string;
  defaultBranch: string;
  htmlUrl: string;
  private: boolean;
  description: string | null;
  /** Last push (ISO 8601). */
  pushedAt: string | null;
  /** Whether the project already reads it. */
  connected: boolean;
}

/** `POST /api/organizations/{orgId}/code/github/installations`: what GitHub put in the redirect. */
export interface CompleteGitHubInstallRequest {
  installationId: number | null;
  setupAction: string | null;
  state: string | null;
  code: string | null;
}

/** LINKED to the organization, or REQUESTED: a GitHub organization owner must approve it first. */
export interface GitHubInstallResultResponse {
  status: 'LINKED' | 'REQUESTED';
  installation: GitHubInstallationResponse | null;
}

/** One module of a repository's map (`GET …/repositories/{id}/modules`, ordered by path). */
export interface CodeModuleResponse {
  id: string;
  /** Folder path inside the repository; `""` for the repository root. */
  path: string;
  name: string;
  summary: string;
  capabilities: string[];
  businessRules: string[];
  endpoints: string[];
  entities: string[];
  fileCount: number;
  /** The folder on GitHub; null when it cannot be linked. */
  url: string | null;
}

/**
 * A place in the client's code a suggestion, story or chat reply points at. A module reference has
 * the module's folder and name; one found by a deep search of the source code also has the file
 * and its lines, and `url` then opens those lines on GitHub at the indexed commit. The location
 * fields are absent on references created before deep search.
 */
export interface CodeReference {
  /** `owner/name`. */
  repository: string;
  path: string;
  name: string;
  url: string | null;
  /** File inside the repository (deep search only). */
  file?: string | null;
  lineStart?: number | null;
  lineEnd?: number | null;
  /** A short quote of the code that proves it (deep search only). */
  quote?: string | null;
}

/** What the code says about a suggestion: the capability already exists, or contradicts it. */
export type CodeFinding = 'ALREADY_EXISTS' | 'CONFLICTS_WITH_CODE';

/** What a deep verification of a suggestion in the pure source code concluded. */
export type CodeVerdict = 'ALREADY_EXISTS' | 'CONFLICTS_WITH_CODE' | 'NOT_FOUND' | 'UNSURE';

/** Where the deep verification of a suggestion stands. */
export type CodeVerifyState = 'VERIFYING' | 'VERIFIED' | 'FAILED';

/** The code insight of a suggestion; `finding` null means the code was checked with no finding. */
export interface SuggestionCodeInsight {
  finding: CodeFinding | null;
  note: string | null;
  references: CodeReference[];
  /** Outcome of the last deep verification; absent or null when the analyst never asked. */
  verdict?: CodeVerdict | null;
  verifyState?: CodeVerifyState | null;
  /** When the last deep verification finished (ISO 8601). */
  verifiedAt?: string | null;
  /** Why the deep verification failed (technical, English). */
  verifyError?: string | null;
}

/** Where in the session's transcript a suggestion comes from: the segment and its verbatim words. */
export interface SuggestionEvidence {
  /** Transcript segment sequence in the suggestion's session. */
  sequence: number;
  quote: string;
}

/** Where an accepted story comes from: the session, the segment and the client's words. */
export interface StoryOrigin {
  sessionId: string;
  sequence: number;
  quote: string;
}
