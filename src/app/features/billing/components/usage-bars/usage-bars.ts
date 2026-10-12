import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { BarRow } from '../../data/usage-insights';

/**
 * A part-to-whole list of horizontal bars: one row per entry with its label, its tokens and its share
 * of the total. A single hue (the brand colour) because the rows are one measure, not categories; the
 * label and figures are text, so the bar is decoration and the list reads the same without it.
 */
@Component({
  selector: 'app-usage-bars',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe],
  template: `
    <ul class="flex flex-col gap-3" [attr.aria-label]="label()" role="list">
      @for (row of rows(); track row.id) {
        <li class="flex flex-col gap-1.5" data-testid="usage-bar-row">
          <div class="flex items-baseline justify-between gap-3 text-sm">
            <span class="min-w-0 truncate font-medium" [title]="row.label">{{ row.label }}</span>
            <span class="shrink-0 text-muted-foreground tabular-nums">
              {{ row.tokens | number }}
              <span class="ml-1 text-xs">· {{ row.percent | number: '1.0-0' }}%</span>
            </span>
          </div>
          <div class="h-2 w-full overflow-hidden rounded-full bg-muted" aria-hidden="true">
            <div
              class="h-full rounded-full bg-foreground/70"
              [style.width.%]="row.percent < 1 ? 1 : row.percent"
            ></div>
          </div>
        </li>
      }
    </ul>
  `,
})
export class UsageBars {
  readonly rows = input.required<readonly BarRow[]>();
  /** Accessible name of the list. */
  readonly label = input.required<string>();
}
