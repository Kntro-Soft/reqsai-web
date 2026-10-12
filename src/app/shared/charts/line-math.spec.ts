import { describe, expect, it } from 'vitest';
import { MARGIN, labelIndexes, nearestIndex, pathOf, plotOf, ticksOf, xOf, yOf } from './line-math';

describe('line chart math', () => {
  const plot = plotOf(400, 200, 5, 10);

  it('puts the first point at the left edge of the plot and the last at the right', () => {
    expect(xOf(plot, 0)).toBe(MARGIN.left);
    expect(xOf(plot, 4)).toBe(400 - MARGIN.right);
  });

  it('puts zero on the baseline and the ceiling on the top edge', () => {
    expect(yOf(plot, 0)).toBe(200 - MARGIN.bottom);
    expect(yOf(plot, plot.yMax)).toBe(MARGIN.top);
  });

  it('centers a lone point', () => {
    expect(xOf(plotOf(400, 200, 1, 3), 0)).toBe(
      MARGIN.left + (400 - MARGIN.left - MARGIN.right) / 2,
    );
  });

  it('keeps axis ticks whole numbers', () => {
    expect(ticksOf(4)).toEqual([0, 2, 4]);
    expect(ticksOf(5)).toEqual([0, 5]);
  });

  it('finds the nearest data index and clamps outside the plot', () => {
    expect(nearestIndex(plot, xOf(plot, 2) + 3)).toBe(2);
    expect(nearestIndex(plot, -50)).toBe(0);
    expect(nearestIndex(plot, 9999)).toBe(4);
  });

  it('always labels the last week and never packs labels closer than the gap', () => {
    const indexes = labelIndexes(12, 340);
    expect(indexes.at(-1)).toBe(11);
    const wide = labelIndexes(12, 900);
    expect(wide).toHaveLength(12);
    expect(labelIndexes(12, 340).length).toBeLessThan(12);
  });

  it('draws a path through every point', () => {
    const path = pathOf(plotOf(300, 150, 3, 4), [0, 4, 2]);
    expect(path.startsWith('M')).toBe(true);
    expect(path.match(/L/g)).toHaveLength(2);
  });
});
