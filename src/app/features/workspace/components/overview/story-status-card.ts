import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { ChartCard } from '../../../../shared/charts/chart-card';
import { ChartSegment } from '../../../../shared/charts/chart.models';
import { StackedBar } from '../../../../shared/charts/stacked-bar';
import { STORY_STATUS_ORDER } from '../../data/overview';

const COLORS: Record<string, string> = {
  DRAFT: 'var(--chart-draft)',
  APPROVED: 'var(--chart-approved)',
  EXPORTED: 'var(--chart-exported)',
  MERGED: 'var(--chart-merged)',
  REJECTED: 'var(--chart-rejected)',
};

/** The backlog split by review status, in workflow order (rejected last), with the legend as its text. */
@Component({
  selector: 'app-story-status-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ChartCard, StackedBar, TranslocoPipe],
  template: `
    <app-chart-card
      [title]="'overview.stories.title' | transloco"
      [description]="'overview.stories.description' | transloco"
    >
      @if (total() === 0) {
        <p class="py-8 text-center text-sm text-muted-foreground" data-testid="stories-empty">
          {{ 'overview.empty.stories' | transloco }}
        </p>
      } @else {
        <app-stacked-bar [segments]="segments()" />
      }
    </app-chart-card>
  `,
})
export class StoryStatusCard {
  readonly byStatus = input.required<Record<string, number>>();

  private readonly transloco = inject(TranslocoService);
  private readonly lang = toSignal(this.transloco.langChanges$, {
    initialValue: this.transloco.getActiveLang(),
  });

  protected readonly total = computed(() =>
    Object.values(this.byStatus()).reduce((sum, n) => sum + n, 0),
  );
  protected readonly segments = computed<ChartSegment[]>(() => {
    this.lang();
    return STORY_STATUS_ORDER.map((status) => ({
      key: status,
      label: this.transloco.translate(`stories.status.${status}`),
      value: this.byStatus()[status] ?? 0,
      color: COLORS[status],
    }));
  });
}
