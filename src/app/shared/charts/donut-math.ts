export interface DonutArc {
  /** Painted length along the circle. */
  length: number;
  /** Distance from the start of the circle to where the arc begins. */
  offset: number;
}

/**
 * Lays the parts of a donut out along a circle of the given circumference, leaving `gap` of surface between
 * neighbours. A lone part gets no gap; a part with no value gets no arc.
 */
export function donutArcs(
  values: readonly number[],
  circumference: number,
  gap: number,
): DonutArc[] {
  const total = values.reduce((sum, v) => sum + Math.max(v, 0), 0);
  if (total <= 0) return values.map(() => ({ length: 0, offset: 0 }));
  const drawn = values.filter((v) => v > 0).length;
  const spacing = drawn > 1 ? gap : 0;
  let offset = 0;
  return values.map((v) => {
    if (v <= 0) return { length: 0, offset };
    const share = (v / total) * circumference;
    const arc = { length: Math.max(share - spacing, 0.5), offset: offset + spacing / 2 };
    offset += share;
    return arc;
  });
}
