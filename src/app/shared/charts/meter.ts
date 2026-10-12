import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/**
 * A single ratio against its limit. The unfilled track is a pale step of the fill's own colour, so the state
 * reads across the whole bar; `role="meter"` carries the same numbers for assistive technology.
 */
@Component({
  selector: 'app-meter',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col gap-1.5">
      <div class="flex items-baseline justify-between gap-3 text-sm">
        <span class="min-w-0">{{ label() }}</span>
        <span class="shrink-0 font-medium tabular-nums">{{ valueText() }}</span>
      </div>
      <div
        class="h-2 overflow-hidden rounded-full"
        role="meter"
        [attr.aria-label]="label()"
        [attr.aria-valuemin]="0"
        [attr.aria-valuemax]="max()"
        [attr.aria-valuenow]="clamped()"
        [attr.aria-valuetext]="valueText()"
        [style.background]="track()"
      >
        <div
          class="h-full rounded-full"
          [style.width.%]="percent()"
          [style.background]="color()"
        ></div>
      </div>
    </div>
  `,
})
export class Meter {
  readonly label = input.required<string>();
  readonly value = input.required<number>();
  readonly max = input.required<number>();
  /** What the reader sees at the right of the label, e.g. "3 / 4 · 75%". */
  readonly valueText = input.required<string>();
  readonly color = input('var(--chart-series-1)');

  protected readonly clamped = computed(() => Math.min(Math.max(this.value(), 0), this.max()));
  protected readonly percent = computed(() =>
    this.max() > 0 ? (this.clamped() / this.max()) * 100 : 0,
  );
  protected readonly track = computed(() => `color-mix(in srgb, ${this.color()} 18%, transparent)`);
}
