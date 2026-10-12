import { ChangeDetectionStrategy, Component, input } from '@angular/core';

let nextId = 0;

/**
 * Frame of one dashboard chart: a heading that names it, an optional line saying what is plotted, and a slot
 * for an action (e.g. the table toggle). The section is labelled by its heading for assistive technology.
 */
@Component({
  selector: 'app-chart-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-w-0' },
  template: `
    <section
      class="flex h-full min-w-0 flex-col gap-4 rounded-2xl border border-border bg-card p-5"
      [attr.aria-labelledby]="headingId"
    >
      <header class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <h2 [id]="headingId" class="text-sm font-semibold">{{ title() }}</h2>
          @if (description()) {
            <p class="mt-0.5 text-xs text-muted-foreground">{{ description() }}</p>
          }
        </div>
        <ng-content select="[chartAction]" />
      </header>
      <ng-content />
    </section>
  `,
})
export class ChartCard {
  readonly title = input.required<string>();
  readonly description = input<string>('');
  protected readonly headingId = `chart-card-${nextId++}`;
}
