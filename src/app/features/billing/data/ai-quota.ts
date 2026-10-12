import { HttpErrorResponse } from '@angular/common/http';
import { QuotaLevel } from './billing.models';

const ORDER: readonly QuotaLevel[] = ['NONE', 'WARNING_80', 'WARNING_90', 'EXHAUSTED'];

/** Percentage of the allowance at which each level starts. */
const THRESHOLD: Record<QuotaLevel, number> = {
  NONE: 0,
  WARNING_80: 80,
  WARNING_90: 90,
  EXHAUSTED: 100,
};

/** The highest warning step `used` has reached against `limit` (the backend's own rule). */
export function levelOf(used: number, limit: number): QuotaLevel {
  if (limit <= 0) return 'NONE';
  let reached: QuotaLevel = 'NONE';
  for (const level of ORDER) {
    if (level !== 'NONE' && used * 100 >= limit * THRESHOLD[level]) reached = level;
  }
  return reached;
}

/** Whether `level` is `from` or worse. */
export function atLeast(level: QuotaLevel, from: QuotaLevel): boolean {
  return ORDER.indexOf(level) >= ORDER.indexOf(from);
}

/** Percentage a level starts at, for the "you have used N %" copy. */
export function percentOf(level: QuotaLevel): number {
  return THRESHOLD[level];
}

/** What the API says about a refused AI request (`AI_QUOTA_EXCEEDED`, HTTP 402). */
export interface AiQuotaError {
  plan: string | null;
  limit: number | null;
  used: number | null;
  resetsAt: string | null;
}

/** The allowance details of a 402 `AI_QUOTA_EXCEEDED` response, or null for any other error. */
export function aiQuotaError(err: unknown): AiQuotaError | null {
  if (!(err instanceof HttpErrorResponse) || err.status !== 402) return null;
  const body = err.error as Record<string, unknown> | null;
  if (body?.['code'] !== 'AI_QUOTA_EXCEEDED') return null;
  const num = (v: unknown) => (typeof v === 'number' ? v : null);
  const str = (v: unknown) => (typeof v === 'string' ? v : null);
  return {
    plan: str(body['plan']),
    limit: num(body['limit']),
    used: num(body['used']),
    resetsAt: str(body['resetsAt']),
  };
}

/** A `TOKEN_QUOTA_WARNING` message pushed on `/topic/organizations/{id}/usage`. */
export interface QuotaWarningMessage {
  type: 'TOKEN_QUOTA_WARNING';
  level: QuotaLevel;
  percent: number;
  tokensUsed: number;
  tokensLimit: number;
}

export function isQuotaWarning(value: unknown): value is QuotaWarningMessage {
  const v = value as Partial<QuotaWarningMessage> | null;
  return (
    !!v &&
    v.type === 'TOKEN_QUOTA_WARNING' &&
    typeof v.level === 'string' &&
    ORDER.includes(v.level) &&
    typeof v.tokensUsed === 'number' &&
    typeof v.tokensLimit === 'number'
  );
}
