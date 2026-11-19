import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { DatePipe } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { BarList, BarListItem } from '../../../../shared/charts/bar-list';
import { ChartCard } from '../../../../shared/charts/chart-card';
import { formatDuration } from '../../data/quality';
import { QualityPostProcessing } from '../../data/quality.models';

/** How many meetings the list shows; the average and median still cover every measured one. */
const SHOWN = 8;

/** The time each meeting took to go from "recording ended" to "stories reviewed", longest first. */
@Component({
  selector: 'app-quality-post-processing-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BarList, ChartCard, TranslocoPipe],
  providers: [DatePipe],
  template: `
    <app-chart-card
      [title]="'quality.postProcessing.title' | transloco"
      [description]="'quality.postProcessing.description' | transloco"
    >
      @if (postProcessing().measured === 0) {
        <p
          class="py-8 text-center text-sm text-muted-foreground"
          data-testid="post-processing-empty"
        >
          {{ 'quality.postProcessing.empty' | transloco }}
        </p>
      } @else {
        <app-bar-list [items]="items()" data-testid="post-processing-list" />
      }
      @if (postProcessing().unmeasured > 0) {
        <p class="text-xs text-muted-foreground" data-testid="post-processing-unmeasured">
          {{ 'quality.postProcessing.unmeasured' | transloco: { n: postProcessing().unmeasured } }}
        </p>
      }
    </app-chart-card>
  `,
})
export class PostProcessingCard {
  readonly postProcessing = input.required<QualityPostProcessing>();

  private readonly transloco = inject(TranslocoService);
  private readonly datePipe = inject(DatePipe);
  private readonly lang = toSignal(this.transloco.langChanges$, {
    initialValue: this.transloco.getActiveLang(),
  });

  protected readonly items = computed<BarListItem[]>(() => {
    this.lang();
    return [...this.postProcessing().sessions]
      .sort((a, b) => b.seconds - a.seconds)
      .slice(0, SHOWN)
      .map((session) => ({
        key: session.sessionId,
        label: session.title,
        value: session.seconds,
        valueText: formatDuration(session.seconds),
        detail: `${this.transloco.translate('quality.purpose.' + session.purpose)} · ${
          this.datePipe.transform(session.endedAt, 'mediumDate') ?? ''
        }`,
        color: 'var(--chart-series-1)',
      }));
  });
}
