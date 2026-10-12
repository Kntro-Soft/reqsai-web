import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { ChartLegend } from './chart-legend';
import { ChartSegment } from './chart.models';
import { donutArcs } from './donut-math';

const SIZE = 148;
const THICKNESS = 16;
const RADIUS = (SIZE - THICKNESS) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * A donut for a handful of parts of one whole, with the headline figure in the hole and the legend (counts and
 * shares) beside it, which doubles as the text alternative.
 */
@Component({
  selector: 'app-donut',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ChartLegend],
  template: `
    <div class="flex flex-wrap items-center gap-x-6 gap-y-4">
      <div class="relative shrink-0" [style.width.px]="size" [style.height.px]="size">
        <svg
          [attr.viewBox]="'0 0 ' + size + ' ' + size"
          [attr.width]="size"
          [attr.height]="size"
          role="img"
          [attr.aria-label]="summary()"
        >
          <circle
            [attr.cx]="size / 2"
            [attr.cy]="size / 2"
            [attr.r]="radius"
            fill="none"
            stroke="var(--chart-grid)"
            [attr.stroke-width]="thickness"
          />
          @for (arc of arcs(); track arc.key) {
            @if (arc.length > 0) {
              <circle
                [attr.cx]="size / 2"
                [attr.cy]="size / 2"
                [attr.r]="radius"
                fill="none"
                [attr.stroke]="arc.color"
                [attr.stroke-width]="thickness"
                [attr.stroke-dasharray]="arc.length + ' ' + (circumference - arc.length)"
                [attr.stroke-dashoffset]="-arc.offset"
                [attr.transform]="'rotate(-90 ' + size / 2 + ' ' + size / 2 + ')'"
              >
                <title>{{ arc.label }}: {{ arc.value }}</title>
              </circle>
            }
          }
        </svg>
        <div
          class="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center"
        >
          <span class="text-2xl font-semibold tracking-tight">{{ centerValue() }}</span>
          <span class="max-w-20 text-[11px] leading-tight text-muted-foreground">{{
            centerLabel()
          }}</span>
        </div>
      </div>
      <div class="min-w-40 flex-1">
        <app-chart-legend [segments]="segments()" />
      </div>
    </div>
  `,
})
export class Donut {
  readonly segments = input.required<readonly ChartSegment[]>();
  readonly centerValue = input.required<string>();
  readonly centerLabel = input<string>('');

  protected readonly size = SIZE;
  protected readonly thickness = THICKNESS;
  protected readonly radius = RADIUS;
  protected readonly circumference = CIRCUMFERENCE;

  protected readonly arcs = computed(() => {
    const parts = this.segments();
    const arcs = donutArcs(
      parts.map((p) => p.value),
      CIRCUMFERENCE,
      2,
    );
    return parts.map((p, i) => ({ ...p, ...arcs[i] }));
  });

  protected readonly summary = computed(
    () =>
      `${this.centerValue()} ${this.centerLabel()}: ` +
      this.segments()
        .map((s) => `${s.label} ${s.value}`)
        .join(', '),
  );
}
