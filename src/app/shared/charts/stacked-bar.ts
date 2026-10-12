import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { ChartLegend } from './chart-legend';
import { ChartSegment } from './chart.models';

/**
 * A part-to-whole bar: one thin row split into its parts, 2px of surface between neighbours, with the legend
 * (count and share per part) underneath. Parts with no value keep their legend row but take no width.
 */
@Component({
  selector: 'app-stacked-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ChartLegend],
  template: `
    <div class="flex flex-col gap-4">
      <div class="flex h-3.5 gap-0.5" role="img" [attr.aria-label]="summary()">
        @for (part of drawn(); track part.key) {
          <span
            class="chart-tip block h-full min-w-1 flex-1 rounded-sm"
            [style.flex-grow]="part.value"
            [style.flex-basis]="'0'"
            [style.background]="part.color"
            [attr.data-tip]="part.label + ': ' + part.value"
          ></span>
        }
      </div>
      <app-chart-legend [segments]="segments()" />
    </div>
  `,
})
export class StackedBar {
  readonly segments = input.required<readonly ChartSegment[]>();

  protected readonly drawn = computed(() => this.segments().filter((s) => s.value > 0));
  protected readonly summary = computed(() =>
    this.segments()
      .map((s) => `${s.label}: ${s.value}`)
      .join(', '),
  );
}
