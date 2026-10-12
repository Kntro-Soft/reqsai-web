import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { ChartCard } from '../../../../shared/charts/chart-card';
import { LineSeries } from '../../../../shared/charts/chart.models';
import { LineChart } from '../../../../shared/charts/line-chart';
import { isSilent } from '../../data/overview';
import { WeekCount } from '../../data/overview.models';

/**
 * Sessions and stories created per week. Either series may be missing (the caller may read only one of
 * them); with no activity at all it says so instead of drawing a flat line.
 */
@Component({
  selector: 'app-weekly-activity-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ChartCard, LineChart, TranslocoPipe],
  template: `
    <app-chart-card
      [title]="'overview.activity.title' | transloco"
      [description]="'overview.activity.description' | transloco: { n: weeks() }"
    >
      @if (silent()) {
        <p class="py-8 text-center text-sm text-muted-foreground" data-testid="activity-empty">
          {{ 'overview.empty.activity' | transloco: { n: weeks() } }}
        </p>
      } @else {
        <app-line-chart
          [labels]="labels()"
          [series]="series()"
          [ariaLabel]="'overview.activity.aria' | transloco: { n: weeks() }"
        />
      }
    </app-chart-card>
  `,
})
export class WeeklyActivityCard {
  readonly stories = input<readonly WeekCount[] | null>(null);
  readonly sessions = input<readonly WeekCount[] | null>(null);
  readonly weeks = input.required<number>();

  private readonly transloco = inject(TranslocoService);
  private readonly lang = toSignal(this.transloco.langChanges$, {
    initialValue: this.transloco.getActiveLang(),
  });

  protected readonly silent = computed(() => isSilent(this.stories() ?? [], this.sessions() ?? []));
  protected readonly labels = computed(() =>
    (this.stories() ?? this.sessions() ?? []).map((w) => w.weekStart),
  );
  protected readonly series = computed<LineSeries[]>(() => {
    this.lang();
    const out: LineSeries[] = [];
    const stories = this.stories();
    const sessions = this.sessions();
    if (stories) {
      out.push({
        key: 'stories',
        label: this.transloco.translate('overview.activity.stories'),
        color: 'var(--chart-series-1)',
        values: stories.map((w) => w.count),
      });
    }
    if (sessions) {
      out.push({
        key: 'sessions',
        label: this.transloco.translate('overview.activity.sessions'),
        color: 'var(--chart-series-2)',
        values: sessions.map((w) => w.count),
      });
    }
    return out;
  });
}
