import { StatTrend } from '../../../../shared/charts/chart.models';
import { Trend } from '../../data/overview';

export type Translate = (key: string, params?: Record<string, unknown>) => string;

/**
 * The line under a KPI comparing the latest weeks with the ones before. More activity is good news; less is
 * only information (a quiet month is not a failure), so only growth is tinted.
 */
export function statTrend(trend: Trend | null, translate: Translate): StatTrend | null {
  if (!trend) return null;
  return {
    direction: trend.direction,
    tone: trend.direction === 'up' ? 'good' : 'neutral',
    text: translate(`overview.trend.${trend.direction}`, { n: Math.abs(trend.delta) }),
  };
}

export function formatCount(value: number, locale: string): string {
  return value.toLocaleString(locale);
}
