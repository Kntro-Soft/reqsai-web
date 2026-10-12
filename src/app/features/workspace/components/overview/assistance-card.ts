import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { ChartCard } from '../../../../shared/charts/chart-card';
import { ChartSegment } from '../../../../shared/charts/chart.models';
import { Donut } from '../../../../shared/charts/donut';
import { DiscoveryOverview } from '../../data/overview.models';

/**
 * What analysts did with the copilot's story proposals: accepted, dismissed or still waiting, with the
 * acceptance rate of the decided ones in the hole of the donut.
 */
@Component({
  selector: 'app-assistance-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ChartCard, Donut, TranslocoPipe],
  template: `
    <app-chart-card
      [title]="'overview.assistance.title' | transloco"
      [description]="'overview.assistance.description' | transloco"
    >
      @if (empty()) {
        <p class="py-8 text-center text-sm text-muted-foreground" data-testid="assistance-empty">
          {{ 'overview.empty.assistance' | transloco }}
        </p>
      } @else {
        <app-donut
          [segments]="segments()"
          [centerValue]="centerValue()"
          [centerLabel]="
            (rate() === null ? 'overview.assistance.centerNone' : 'overview.assistance.center')
              | transloco
          "
        />
        @if (assistance().questions > 0) {
          <p class="text-xs text-muted-foreground">
            {{ 'overview.assistance.questions' | transloco: { n: assistance().questions } }}
          </p>
        }
      }
    </app-chart-card>
  `,
})
export class AssistanceCard {
  readonly assistance = input.required<DiscoveryOverview['assistance']>();

  private readonly transloco = inject(TranslocoService);
  private readonly lang = toSignal(this.transloco.langChanges$, {
    initialValue: this.transloco.getActiveLang(),
  });

  protected readonly rate = computed(() => this.assistance().acceptanceRate);
  protected readonly empty = computed(() => {
    const a = this.assistance();
    return a.accepted + a.dismissed + a.pending + a.questions === 0;
  });
  protected readonly centerValue = computed(() => {
    const rate = this.rate();
    return rate === null ? '—' : `${Math.round(rate * 100)}%`;
  });
  protected readonly segments = computed<ChartSegment[]>(() => {
    this.lang();
    const a = this.assistance();
    return [
      {
        key: 'accepted',
        label: this.transloco.translate('overview.assistance.accepted'),
        value: a.accepted,
        color: 'var(--chart-approved)',
      },
      {
        key: 'dismissed',
        label: this.transloco.translate('overview.assistance.dismissed'),
        value: a.dismissed,
        color: 'var(--chart-rejected)',
      },
      {
        key: 'pending',
        label: this.transloco.translate('overview.assistance.pending'),
        value: a.pending,
        color: 'var(--chart-draft)',
      },
    ];
  });
}
