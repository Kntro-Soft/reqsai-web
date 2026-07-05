import { HttpErrorResponse } from '@angular/common/http';

/**
 * RFC 9457 ProblemDetail body shape the backend returns on errors. Every field
 * is optional here because we only ever read a couple defensively.
 */
interface ProblemDetail {
  code?: string;
  detail?: string;
  status?: number;
}

/** Reads the backend `code` from an HttpErrorResponse ProblemDetail body, if present. */
export function problemCode(error: unknown): string | null {
  if (!(error instanceof HttpErrorResponse)) return null;
  const body = error.error as ProblemDetail | null;
  return typeof body?.code === 'string' ? body.code : null;
}

/** True when the error is a 409 Conflict. */
export function isConflict(error: unknown): boolean {
  return error instanceof HttpErrorResponse && error.status === 409;
}

/**
 * Parses the near-duplicate similarity out of a DUPLICATE_USER_STORY 409. The
 * backend embeds it in the ProblemDetail `detail` as a 0..1 value formatted with
 * two decimals, e.g. "A near-duplicate user story already exists (similarity
 * 0.87)". Returns the similarity as a whole percentage (0..100), or null when the
 * error is not a duplicate conflict or carries no parseable score.
 */
export function duplicateStorySimilarityPercent(error: unknown): number | null {
  if (!isConflict(error)) return null;
  const body = (error as HttpErrorResponse).error as ProblemDetail | null;
  const detail = typeof body?.detail === 'string' ? body.detail : '';
  const match = /similarity\s+([0-9]*\.?[0-9]+)/i.exec(detail);
  if (!match) return null;
  const value = Number.parseFloat(match[1]);
  if (Number.isNaN(value)) return null;
  return Math.round(value * 100);
}
