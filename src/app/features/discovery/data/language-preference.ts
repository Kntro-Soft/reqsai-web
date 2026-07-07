/**
 * Per-user meeting-language preference, persisted in localStorage per project
 * so it survives reloads and wins over the organization default. Pure helpers
 * so the precedence rule stays unit-testable.
 */

const KEY_PREFIX = 'reqsai.discovery.lang.';

/** The localStorage key holding the user's language override for one project. */
export function languageStorageKey(projectId: string): string {
  return `${KEY_PREFIX}${projectId}`;
}

/**
 * Resolves the meeting-language picker's initial value.
 * Precedence: stored per-project override > org default > `es-PE`.
 * Blank/whitespace values never win.
 */
export function resolveInitialLanguage(
  stored: string | null | undefined,
  orgDefault: string | null | undefined,
): string {
  const override = stored?.trim();
  if (override) return override;
  return orgDefault?.trim() || 'es-PE';
}
