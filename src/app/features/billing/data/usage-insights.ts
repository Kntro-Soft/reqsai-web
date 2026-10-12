import { FeatureUsage, ProjectUsage } from './billing.models';

/** One bar of a part-to-whole list: `percent` is the row's share of the period's tokens (0-100). */
export interface BarRow {
  id: string;
  label: string;
  tokens: number;
  percent: number;
}

function shareOf(tokens: number, total: number): number {
  return total > 0 ? Math.min(100, (tokens / total) * 100) : 0;
}

/** Features that used tokens, largest first, each with its share of the period's total. */
export function featureRows(
  features: readonly FeatureUsage[],
  total: number,
  labelOf: (feature: string) => string,
): BarRow[] {
  return features
    .filter((f) => f.tokens > 0)
    .map((f) => ({
      id: f.feature,
      label: labelOf(f.feature),
      tokens: f.tokens,
      percent: shareOf(f.tokens, total),
    }))
    .sort((a, b) => b.tokens - a.tokens);
}

/** Projects that used tokens, largest first; a project we cannot name gets `unknownLabel`. */
export function projectRows(
  projects: readonly ProjectUsage[],
  total: number,
  nameOf: (projectId: string) => string | null,
  unknownLabel: string,
): BarRow[] {
  return projects
    .filter((p) => p.tokens > 0)
    .map((p) => ({
      id: p.projectId,
      label: nameOf(p.projectId) ?? unknownLabel,
      tokens: p.tokens,
      percent: shareOf(p.tokens, total),
    }))
    .sort((a, b) => b.tokens - a.tokens);
}

/** Meeting time left as a figure and unit: minutes up to two hours, then hours with one decimal. */
export function meetingTime(minutes: number): { unit: 'minutes' | 'hours'; value: number } {
  const safe = Math.max(0, Math.floor(minutes));
  if (safe < 120) return { unit: 'minutes', value: safe };
  return { unit: 'hours', value: Math.round((safe / 60) * 10) / 10 };
}

/** Share (0-100) of the input the provider served from its cache, which counts half in the quota. */
export function cachedShare(features: readonly FeatureUsage[]): number {
  const input = features.reduce((sum, f) => sum + f.inputTokens, 0);
  const cached = features.reduce((sum, f) => sum + f.cachedInputTokens, 0);
  return input > 0 ? Math.round((cached / input) * 100) : 0;
}

/** Transcribed audio as whole minutes, rounded up so a short clip never reads as zero. */
export function audioMinutes(seconds: number): number {
  return seconds > 0 ? Math.ceil(seconds / 60) : 0;
}
