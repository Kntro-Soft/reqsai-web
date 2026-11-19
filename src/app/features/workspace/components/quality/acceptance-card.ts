import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { ChartCard } from '../../../../shared/charts/chart-card';
import { ChartSegment } from '../../../../shared/charts/chart.models';
import { StackedBar } from '../../../../shared/charts/stacked-bar';
import { percentText } from '../../data/quality';
import { QualityAcceptance } from '../../data/quality.models';

/**
 * How the AI-generated stories decided in the period ended: accepted as proposed, accepted but rewritten, or
 * rejected, with the rule that tells the first two apart.
 */
@Component({
  selector: 'app-quality-acceptance-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ChartCard, StackedBar, TranslocoPipe],
  template: `
    <app-chart-card
      [title]="'quality.acceptance.title' | transloco"
      [description]="'quality.acceptance.description' | transloco: { n: threshold() }"
    >
      @if (acceptance().decided === 0) {
        <p class="py-8 text-center text-sm text-muted-foreground" data-testid="acceptance-empty">
          {{ 'quality.acceptance.empty' | transloco }}
        </p>
      } @else {
        <app-stacked-bar [segments]="segments()" data-testid="acceptance-bar" />
      }
      @if (acceptance().withoutBaseline > 0) {
        <p class="text-xs text-muted-foreground" data-testid="acceptance-excluded">
          {{ 'quality.acceptance.excluded' | transloco: { n: acceptance().withoutBaseline } }}
        </p>
      }
    </app-chart-card>
  `,
})
export class AcceptanceCard {
  readonly acceptance = input.required<QualityAcceptance>();

  private readonly transloco = inject(TranslocoService);
  private readonly lang = toSignal(this.transloco.langChanges$, {
    initialValue: this.transloco.getActiveLang(),
  });

  protected readonly threshold = computed(() => percentText(this.acceptance().similarityThreshold));
  protected readonly segments = computed<ChartSegment[]>(() => {
    this.lang();
    const a = this.acceptance();
    return [
      {
        key: 'kept',
        label: this.transloco.translate('quality.acceptance.kept'),
        value: a.acceptedAsGenerated,
        color: 'var(--chart-approved)',
      },
      {
        key: 'rewritten',
        label: this.transloco.translate('quality.acceptance.rewritten'),
        value: a.acceptedRewritten,
        color: 'var(--chart-draft)',
      },
      {
        key: 'rejected',
        label: this.transloco.translate('quality.acceptance.rejected'),
        value: a.rejected,
        color: 'var(--chart-rejected)',
      },
    ];
  });
}
