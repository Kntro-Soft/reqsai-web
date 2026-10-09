import {
  CodeModuleResponse,
  CodeProfile,
  CodeRepositoryResponse,
  CodeRepositoryStatus,
} from './codebase.models';

/**
 * Pure rules for a project's connected code: which repository references the connect form accepts,
 * the indexing state of a repository, the technical profile detected across repositories and what
 * of it is new to the project, and the module filter. Kept free of Angular so they are unit-testable.
 */

/** Most repositories a project may connect (mirrors `CODE_REPOSITORY_LIMIT_REACHED`). */
export const MAX_REPOSITORIES = 3;

/** How often the repository list is refreshed while one is indexing. */
export const INDEXING_POLL_MS = 3000;

/** A GitHub repository reference as the connect form understands it. */
export interface RepositoryRef {
  owner: string;
  name: string;
  /** The branch of a `/tree/<branch>` URL; null when the input names none. */
  branch: string | null;
}

/** GitHub logins: letters, digits and single hyphens, 1–39 characters, no leading hyphen. */
const OWNER = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
/** GitHub repository names: letters, digits, `.`, `_` and `-`, up to 100 characters. */
const NAME = /^[A-Za-z0-9._-]{1,100}$/;
const GITHUB_HOSTS = new Set(['github.com', 'www.github.com']);

function repoRef(owner: string, rawName: string, branch: string | null): RepositoryRef | null {
  const name = rawName.replace(/\.git$/i, '');
  if (!OWNER.test(owner) || !NAME.test(name) || name === '.' || name === '..') return null;
  return { owner, name, branch };
}

/**
 * Parses what the analyst typed into a repository reference. Accepts `owner/name` and a github.com
 * URL (with or without the scheme), optionally ending in `.git`, a trailing slash or
 * `/tree/<branch>`. Anything else (another host, a file or issues URL, a bare name) is null.
 */
export function parseRepositoryInput(raw: string | null | undefined): RepositoryRef | null {
  const text = (raw ?? '').trim();
  if (!text || /\s/.test(text)) return null;

  const shorthand = /^([^/]+)\/([^/]+)$/.exec(text);
  if (shorthand && !text.includes(':') && !GITHUB_HOSTS.has(shorthand[1].toLowerCase())) {
    return repoRef(shorthand[1], shorthand[2], null);
  }

  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return null;
  }
  if (
    !['https:', 'http:'].includes(url.protocol) ||
    !GITHUB_HOSTS.has(url.hostname.toLowerCase())
  ) {
    return null;
  }
  if (url.username || url.password || url.port) return null;

  const parts = url.pathname.split('/').filter((p) => p.length > 0);
  if (parts.length === 2) return repoRef(parts[0], parts[1], null);
  if (parts.length >= 4 && parts[2] === 'tree') {
    let branch: string;
    try {
      branch = decodeURIComponent(parts.slice(3).join('/'));
    } catch {
      return null;
    }
    return repoRef(parts[0], parts[1], branch);
  }
  return null;
}

/** The `.one` or `.other` form of a counted i18n label ("1 módulo" / "3 módulos"). */
export function pluralKey(key: string, count: number): string {
  return `${key}.${count === 1 ? 'one' : 'other'}`;
}

/** True while the repository is queued or being read: its map is not ready yet. */
export function isIndexing(repo: Pick<CodeRepositoryResponse, 'status'>): boolean {
  return repo.status === 'PENDING' || repo.status === 'INDEXING';
}

/** True when any repository is still indexing (the list keeps polling). */
export function anyIndexing(repos: readonly Pick<CodeRepositoryResponse, 'status'>[]): boolean {
  return repos.some(isIndexing);
}

const STATUSES: readonly CodeRepositoryStatus[] = ['PENDING', 'INDEXING', 'READY', 'FAILED'];

/** The i18n key of a repository status; an unknown value reads as pending. */
export function statusKey(status: string | null | undefined): string {
  const known = STATUSES.find((s) => s === status) ?? 'PENDING';
  return `code.repo.status.${known}`;
}

/** Indexing progress as a whole percentage, or null while the module count is unknown. */
export function indexingProgress(
  repo: Pick<CodeRepositoryResponse, 'moduleCount' | 'modulesDone'>,
): number | null {
  if (!repo.moduleCount || repo.moduleCount <= 0) return null;
  const percent = Math.round((Math.max(0, repo.modulesDone) / repo.moduleCount) * 100);
  return Math.min(100, Math.max(0, percent));
}

/** The 7-character short form of a commit, or null. */
export function shortSha(sha: string | null | undefined): string | null {
  const clean = sha?.trim();
  return clean ? clean.slice(0, 7) : null;
}

/** Case- and accent-insensitive form used to compare technology names and filter modules. */
export function normalizeTerm(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '').trim().toLowerCase();
}

/** Appends the values not already present (compared normalized), keeping the first spelling. */
function union(base: readonly string[], extra: readonly string[]): string[] {
  const seen = new Set(base.map(normalizeTerm));
  const out = [...base];
  for (const value of extra) {
    const clean = value?.trim();
    if (!clean) continue;
    const key = normalizeTerm(clean);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
  }
  return out;
}

/** A repository overview for the detected-profile section. */
export interface RepositoryOverview {
  repository: string;
  text: string;
}

/** The technology detected across the ready repositories, and what each one does. */
export interface DetectedProfile {
  languages: string[];
  frameworks: string[];
  databases: string[];
  platforms: string[];
  overviews: RepositoryOverview[];
}

/** Merges the profiles of the READY repositories (the others are not trustworthy yet). */
export function aggregateProfile(
  repos: readonly Pick<CodeRepositoryResponse, 'status' | 'fullName' | 'profile'>[],
): DetectedProfile {
  const result: DetectedProfile = {
    languages: [],
    frameworks: [],
    databases: [],
    platforms: [],
    overviews: [],
  };
  for (const repo of repos) {
    if (repo.status !== 'READY' || !repo.profile) continue;
    const profile: Partial<CodeProfile> = repo.profile;
    result.languages = union(result.languages, profile.languages ?? []);
    result.frameworks = union(result.frameworks, profile.frameworks ?? []);
    result.databases = union(result.databases, profile.databases ?? []);
    result.platforms = union(result.platforms, profile.platforms ?? []);
    const overview = profile.overview?.trim();
    if (overview) result.overviews.push({ repository: repo.fullName, text: overview });
  }
  return result;
}

/** True when the detected profile names no technology at all. */
export function isProfileEmpty(profile: DetectedProfile): boolean {
  return (
    profile.languages.length +
      profile.frameworks.length +
      profile.databases.length +
      profile.platforms.length ===
    0
  );
}

/** The project's technical profile fields (workspace project). */
export interface ProjectStack {
  programmingLanguages: string[];
  frameworks: string[];
  databases: string[];
  clientPlatforms: string[];
}

/** What the detected profile would add to the project, per category. */
export interface ProfileAdditions {
  languages: string[];
  frameworks: string[];
  databases: string[];
  platforms: string[];
}

function missing(current: readonly string[] | null | undefined, detected: readonly string[]) {
  return union(current ?? [], detected).slice((current ?? []).length);
}

/**
 * The detected languages, frameworks, databases and platforms the project's profile does not list
 * yet (compared case- and accent-insensitively, so "postgresql" is not "new" next to "PostgreSQL").
 */
export function profileAdditions(
  project: Partial<ProjectStack> | null | undefined,
  detected: Pick<DetectedProfile, 'languages' | 'frameworks' | 'databases' | 'platforms'>,
): ProfileAdditions {
  return {
    languages: missing(project?.programmingLanguages, detected.languages),
    frameworks: missing(project?.frameworks, detected.frameworks),
    databases: missing(project?.databases, detected.databases),
    platforms: missing(project?.clientPlatforms, detected.platforms),
  };
}

/** How many items the additions carry. */
export function additionsCount(additions: ProfileAdditions): number {
  return (
    additions.languages.length +
    additions.frameworks.length +
    additions.databases.length +
    additions.platforms.length
  );
}

/** The project's profile with the additions appended; everything it already had is kept. */
export function mergeProfile(
  project: Partial<ProjectStack>,
  additions: ProfileAdditions,
): ProjectStack {
  return {
    programmingLanguages: union(project.programmingLanguages ?? [], additions.languages),
    frameworks: union(project.frameworks ?? [], additions.frameworks),
    databases: union(project.databases ?? [], additions.databases),
    clientPlatforms: union(project.clientPlatforms ?? [], additions.platforms),
  };
}

/** True when the value is one the additions would add (drives the "new" mark on a chip). */
export function isAddition(additions: readonly string[], value: string): boolean {
  const key = normalizeTerm(value);
  return additions.some((a) => normalizeTerm(a) === key);
}

/**
 * The modules matching the filter text (every word, in any field: name, path, summary,
 * capabilities, rules, endpoints, entities). A blank filter keeps them all.
 */
export function filterModules<T extends CodeModuleResponse>(
  modules: readonly T[],
  query: string | null | undefined,
): T[] {
  const words = normalizeTerm(query ?? '')
    .split(/\s+/)
    .filter((w) => w.length > 0);
  if (words.length === 0) return [...modules];
  return modules.filter((m) => {
    const haystack = normalizeTerm(
      [
        m.name,
        m.path,
        m.summary,
        ...(m.capabilities ?? []),
        ...(m.businessRules ?? []),
        ...(m.endpoints ?? []),
        ...(m.entities ?? []),
      ].join('\n'),
    );
    return words.every((w) => haystack.includes(w));
  });
}

/**
 * When a READY repository's modules must be (re)loaded: a key that changes with each finished
 * indexing. Null while the repository is not ready.
 */
export function modulesLoadKey(
  repo: Pick<CodeRepositoryResponse, 'status' | 'indexedAt' | 'commitSha'>,
): string | null {
  if (repo.status !== 'READY') return null;
  return `${repo.indexedAt ?? ''}|${repo.commitSha ?? ''}`;
}
