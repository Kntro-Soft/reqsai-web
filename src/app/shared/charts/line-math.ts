import { niceMax } from '../../features/workspace/data/overview';

/** Space around the plot, in px: room for the y labels on the left and the week labels underneath. */
export const MARGIN = { top: 12, right: 14, bottom: 28, left: 34 } as const;

export interface Plot {
  width: number;
  height: number;
  yMax: number;
  count: number;
}

export function plotOf(width: number, height: number, count: number, maxValue: number): Plot {
  return { width, height, count, yMax: niceMax(maxValue) };
}

export function xOf(plot: Plot, index: number): number {
  const inner = plot.width - MARGIN.left - MARGIN.right;
  return plot.count <= 1
    ? MARGIN.left + inner / 2
    : MARGIN.left + (index * inner) / (plot.count - 1);
}

export function yOf(plot: Plot, value: number): number {
  const inner = plot.height - MARGIN.top - MARGIN.bottom;
  return MARGIN.top + inner * (1 - value / plot.yMax);
}

/** Axis values: zero and the ceiling, plus the middle one when it is a whole number. */
export function ticksOf(yMax: number): number[] {
  return Number.isInteger(yMax / 2) ? [0, yMax / 2, yMax] : [0, yMax];
}

/** The data index nearest to a pointer at `px` (in plot coordinates), clamped to the series. */
export function nearestIndex(plot: Plot, px: number): number {
  const inner = plot.width - MARGIN.left - MARGIN.right;
  if (plot.count <= 1 || inner <= 0) return 0;
  const raw = Math.round(((px - MARGIN.left) / inner) * (plot.count - 1));
  return Math.min(Math.max(raw, 0), plot.count - 1);
}

/**
 * Which x labels to print so they never collide: every `step`-th one, counted back from the last so the
 * current week is always labelled.
 */
export function labelIndexes(count: number, width: number, minGap = 64): number[] {
  const inner = Math.max(width - MARGIN.left - MARGIN.right, 1);
  const fit = Math.max(Math.floor(inner / minGap), 1);
  const step = Math.max(Math.ceil(count / fit), 1);
  const indexes: number[] = [];
  for (let i = count - 1; i >= 0; i -= step) indexes.unshift(i);
  return indexes;
}

/** The SVG path of one series. */
export function pathOf(plot: Plot, values: readonly number[]): string {
  return values
    .map((v, i) => `${i === 0 ? 'M' : 'L'}${xOf(plot, i).toFixed(1)} ${yOf(plot, v).toFixed(1)}`)
    .join(' ');
}
