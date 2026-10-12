import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';

export interface BarListItem {
  key: string;
  label: string;
  value: number;
  /** Text shown at the tip of the bar when it differs from the bare number (e.g. "5 · 3"). */
  valueText?: string;
  /** A second line under the label (e.g. "5 stories · 3 sessions"). */
  detail?: string;
  color: string;
  /** Router commands; when set the label is a link. */
  link?: readonly string[];
}

/**
 * Horizontal bars for comparing magnitudes: label and value on one line, the bar below. Every value is text
 * in the list, so the bars are decoration over a readable list.
 */
@Component({
  selector: 'app-bar-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    <ul class="flex flex-col gap-3">
      @for (item of items(); track item.key) {
        <li class="flex min-w-0 flex-col gap-1.5">
          <div class="flex items-baseline justify-between gap-3 text-sm">
            @if (item.link; as link) {
              <a
                [routerLink]="link"
                class="min-w-0 truncate font-medium hover:text-primary hover:underline"
                >{{ item.label }}</a
              >
            } @else {
              <span class="min-w-0 truncate" [class.text-muted-foreground]="item.value === 0">{{
                item.label
              }}</span>
            }
            <span class="shrink-0 font-medium tabular-nums">{{
              item.valueText ?? item.value
            }}</span>
          </div>
          @if (item.detail) {
            <span class="-mt-1 truncate text-xs text-muted-foreground">{{ item.detail }}</span>
          }
          <div class="h-2 rounded-sm bg-muted" aria-hidden="true">
            <div
              class="h-full rounded-sm"
              [style.width.%]="widthOf(item.value)"
              [style.min-width.px]="item.value > 0 ? 3 : 0"
              [style.background]="item.color"
            ></div>
          </div>
        </li>
      }
    </ul>
  `,
})
export class BarList {
  readonly items = input.required<readonly BarListItem[]>();
  private readonly max = computed(() => Math.max(1, ...this.items().map((i) => i.value)));

  protected widthOf(value: number): number {
    return (value / this.max()) * 100;
  }
}
