import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * The row of headline figures at the top of a dashboard: one bordered surface split by hairlines, so the
 * tiles read as a single instrument panel. A last tile left alone on a two-column row spans the row.
 */
@Component({
  selector: 'app-kpi-strip',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    role: 'group',
    class:
      'grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-flow-col sm:auto-cols-fr [&>:last-child:nth-child(odd)]:col-span-2 sm:[&>:last-child:nth-child(odd)]:col-span-1',
    '[attr.aria-label]': 'label()',
  },
  template: `<ng-content />`,
})
export class KpiStrip {
  readonly label = input.required<string>();
}
