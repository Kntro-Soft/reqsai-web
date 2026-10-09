/**
 * Mirrors the codebase REST contract (`/api/projects/{projectId}/code/repositories`): the GitHub
 * repositories a project connects, the map of modules ReqsAI indexes from them, and the code
 * insight and transcript evidence AI suggestions carry.
 */

/** Where a repository is hosted. Only GitHub for now. */
export type CodeProvider = 'GITHUB';

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
  /** Whether an access token is stored for it (never returned). */
  hasToken: boolean;
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

/** `POST …/code/repositories`: `owner/name` or a github.com URL; token only for private repos. */
export interface ConnectCodeRepositoryRequest {
  repository: string;
  branch?: string | null;
  accessToken?: string | null;
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

/** A module a suggestion or a story points at. */
export interface CodeReference {
  /** `owner/name`. */
  repository: string;
  path: string;
  name: string;
  url: string | null;
}

/** What the code says about a suggestion: the capability already exists, or contradicts it. */
export type CodeFinding = 'ALREADY_EXISTS' | 'CONFLICTS_WITH_CODE';

/** The code insight of a suggestion; `finding` null means the code was checked with no finding. */
export interface SuggestionCodeInsight {
  finding: CodeFinding | null;
  note: string | null;
  references: CodeReference[];
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
