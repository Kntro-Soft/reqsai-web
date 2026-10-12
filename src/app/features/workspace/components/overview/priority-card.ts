import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { BarList, BarListItem } from '../../../../shared/charts/bar-list';
import { ChartCard } from '../../../../shared/charts/chart-card';
import { PRIORITY_ORDER } from '../../data/overview';

const COLORS: Record<string, string> = {
  CRITICAL: 'var(--chart-priority-critical)',
  HIGH: 'var(--chart-priority-high)',
  MEDIUM: 'var(--chart-priority-medium)',
  LOW: 'var(--chart-priority-low)',
};

/** Stories per priority, most urgent first; red is kept for the critical row only, as in the priority chip. */
@Component({
  selector: 'app-priority-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BarList, ChartCard, TranslocoPipe],
  template: `
    <app-chart-card
      [title]="'overview.priority.title' | transloco"
      [description]="'overview.priority.description' | transloco"
    >
      @if (total() === 0) {
        <p class="py-8 text-center text-sm text-muted-foreground">
          {{ 'overview.empty.stories' | transloco }}
        </p>
      } @else {
        <app-bar-list [items]="items()" />
      }
    </app-chart-card>
  `,
})
export class PriorityCard {
  readonly byPriority = input.required<Record<string, number>>();

  private readonly transloco = inject(TranslocoService);
  private readonly lang = toSignal(this.transloco.langChanges$, {
    initialValue: this.transloco.getActiveLang(),
  });

  protected readonly total = computed(() =>
    Object.values(this.byPriority()).reduce((sum, n) => sum + n, 0),
  );
  protected readonly items = computed<BarListItem[]>(() => {
    this.lang();
    return PRIORITY_ORDER.map((priority) => ({
      key: priority,
      label: this.transloco.translate(`stories.priority.${priority}`),
      value: this.byPriority()[priority] ?? 0,
      color: COLORS[priority],
    }));
  });
}
