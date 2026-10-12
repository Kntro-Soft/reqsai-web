import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { ChartSegment } from './chart.models';

/**
 * The legend of a part-to-whole chart. It is also the chart's text alternative: every part with its count and
 * share, so identity never rests on colour and nothing needs a tooltip to be read.
 */
@Component({
  selector: 'app-chart-legend',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ul class="grid gap-1.5 text-sm">
      @for (row of rows(); track row.key) {
        <li class="flex items-center gap-2">
          <span
            class="size-2.5 shrink-0 rounded-sm"
            [style.background]="row.color"
            aria-hidden="true"
          ></span>
          <span class="min-w-0 flex-1 truncate" [class.text-muted-foreground]="row.value === 0">{{
            row.label
          }}</span>
          <span class="font-medium tabular-nums">{{ row.value }}</span>
          <span class="w-10 text-right text-xs tabular-nums text-muted-foreground"
            >{{ row.percent }}%</span
          >
        </li>
      }
    </ul>
  `,
})
export class ChartLegend {
  readonly segments = input.required<readonly ChartSegment[]>();

  protected readonly rows = computed(() => {
    const total = this.segments().reduce((sum, s) => sum + s.value, 0);
    return this.segments().map((s) => ({
      ...s,
      percent: total > 0 ? Math.round((s.value / total) * 100) : 0,
    }));
  });
}
