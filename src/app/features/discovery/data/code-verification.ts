import {
  CodeReference,
  CodeVerdict,
  CodeVerifyState,
  SuggestionCodeInsight,
} from './codebase.models';
import { SuggestionResponse } from './discovery.models';

/**
 * Pure rules of the deep verification of a suggestion against the pure source code: the state the
 * card shows, how a realtime update or a failed request changes a suggestion, and how a reference
 * with lines is written and linked. Kept free of Angular so they are unit-testable.
 */

/**
 * How long the card waits for the verdict before offering a retry. The API gives a verification at
 * most 25 seconds; past this the update was lost (a dropped socket, a restart).
 */
export const VERIFY_TIMEOUT_MS = 35_000;

/** What the card shows for the code: a banner per outcome. */
export type CodeBannerKind = 'exists' | 'conflicts' | 'notFound' | 'unsure';

const BANNER_BY_VERDICT: Record<CodeVerdict, CodeBannerKind> = {
  ALREADY_EXISTS: 'exists',
  CONFLICTS_WITH_CODE: 'conflicts',
  NOT_FOUND: 'notFound',
  UNSURE: 'unsure',
};

/**
 * The banner the code insight deserves: the deep verdict when there is one, else the quick
 * finding. Null when the code was checked and said nothing worth a banner.
 */
export function codeBannerKind(
  code: SuggestionCodeInsight | null | undefined,
): CodeBannerKind | null {
  if (!code) return null;
  if (code.verdict && BANNER_BY_VERDICT[code.verdict]) return BANNER_BY_VERDICT[code.verdict];
  if (code.finding === 'ALREADY_EXISTS') return 'exists';
  if (code.finding === 'CONFLICTS_WITH_CODE') return 'conflicts';
  return null;
}

/** The deep verification state of a suggestion; null when the analyst never asked. */
export function verifyStateOf(
  suggestion: Pick<SuggestionResponse, 'code'>,
): CodeVerifyState | null {
  const state = suggestion.code?.verifyState;
  return state === 'VERIFYING' || state === 'VERIFIED' || state === 'FAILED' ? state : null;
}

export function isVerifying(suggestion: Pick<SuggestionResponse, 'code'>): boolean {
  return verifyStateOf(suggestion) === 'VERIFYING';
}

function baseCode(suggestion: Pick<SuggestionResponse, 'code'>): SuggestionCodeInsight {
  return suggestion.code ?? { finding: null, note: null, references: [] };
}

/** The suggestion while its verification runs: what the quick pass said stays until the verdict. */
export function startVerifying(suggestion: SuggestionResponse): SuggestionResponse {
  return {
    ...suggestion,
    code: { ...baseCode(suggestion), verifyState: 'VERIFYING', verifyError: null },
  };
}

/** The suggestion after the request or the verification failed: a retry is offered. */
export function failVerification(
  suggestion: SuggestionResponse,
  error: string | null = null,
): SuggestionResponse {
  return {
    ...suggestion,
    code: { ...baseCode(suggestion), verifyState: 'FAILED', verifyError: error },
  };
}

/** The suggestion with the code insight a realtime update carries. */
export function withCodeUpdate(
  suggestion: SuggestionResponse,
  code: SuggestionCodeInsight | null,
): SuggestionResponse {
  return code ? { ...suggestion, code } : suggestion;
}

/** Replaces the entry `id` with `change(entry)`, keeping the others (and the array when nothing matches). */
export function updateSuggestion<T extends { id: string }>(
  list: readonly T[],
  id: string,
  change: (entry: T) => T,
): T[] {
  return list.some((s) => s.id === id) ? list.map((s) => (s.id === id ? change(s) : s)) : [...list];
}

/** Whether the reference points at lines of a file (a deep search), not at a module. */
export function hasLines(ref: Pick<CodeReference, 'file' | 'lineStart'>): boolean {
  return !!ref.file && typeof ref.lineStart === 'number' && ref.lineStart > 0;
}

/** `path:lineStart-lineEnd` (`path:line` for one line) of a reference with lines; null for a module. */
export function lineReferenceLabel(ref: CodeReference): string | null {
  if (!hasLines(ref)) return null;
  const start = ref.lineStart as number;
  const end = typeof ref.lineEnd === 'number' && ref.lineEnd > start ? ref.lineEnd : null;
  return `${ref.file}:${start}${end ? `-${end}` : ''}`;
}

/** Whether the url is safe to open from a chip: only the code host over http(s). */
export function safeReferenceUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.href : null;
  } catch {
    return null;
  }
}
