import { describe, expect, it } from 'vitest';
import { donutArcs } from './donut-math';

describe('donutArcs', () => {
  it('splits the circle in proportion and leaves a gap between neighbours', () => {
    const arcs = donutArcs([1, 1], 100, 2);
    expect(arcs).toEqual([
      { length: 48, offset: 1 },
      { length: 48, offset: 51 },
    ]);
  });

  it('gives a lone part the whole circle without a gap', () => {
    expect(donutArcs([5, 0], 100, 2)).toEqual([
      { length: 100, offset: 0 },
      { length: 0, offset: 100 },
    ]);
  });

  it('draws nothing when every part is empty', () => {
    expect(donutArcs([0, 0], 100, 2)).toEqual([
      { length: 0, offset: 0 },
      { length: 0, offset: 0 },
    ]);
  });
});
