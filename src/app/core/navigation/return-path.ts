/**
 * Coming back from a third-party consent screen (GitHub App install, Atlassian OAuth) to the page
 * that started it. The page is kept in sessionStorage across the full-page redirect, and only an
 * in-app path is ever followed, so a value planted in storage cannot send the user to another site.
 */

/**
 * An in-app path to return to: it must start with a single `/` (no `//host`, no backslashes and
 * no scheme), or it is ignored.
 */
export function safeReturnPath(value: string | null | undefined): string | null {
  const path = value?.trim();
  if (!path || !path.startsWith('/') || path.startsWith('//') || path.includes('\\')) return null;
  return /^\/[^:]*$/.test(path.split('?')[0]) ? path : null;
}

/** Remembers `path` under `key` for the callback; without storage the callback uses its fallback. */
export function rememberReturnPath(key: string, path: string): void {
  try {
    sessionStorage.setItem(key, path);
  } catch {
    // Private mode or storage disabled: the callback falls back to its default page.
  }
}

/** The remembered path, once (it is cleared), when it is a safe in-app path; else `fallback`. */
export function takeReturnPath(key: string, fallback: string): string {
  try {
    const saved = safeReturnPath(sessionStorage.getItem(key));
    sessionStorage.removeItem(key);
    return saved ?? fallback;
  } catch {
    return fallback;
  }
}
