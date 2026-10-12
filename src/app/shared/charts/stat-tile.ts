import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { provideIcons } from '@ng-icons/core';
import { lucideArrowDownRight, lucideArrowRight, lucideArrowUpRight } from '@ng-icons/lucide';
import { HlmIcon } from '../ui';
import { StatTrend } from './chart.models';

const TREND_ICON = {
  up: 'lucideArrowUpRight',
  down: 'lucideArrowDownRight',
  flat: 'lucideArrowRight',
} as const;

const TREND_TONE = {
  good: 'text-verified',
  bad: 'text-priority-critical',
  neutral: 'text-muted-foreground',
} as const;

/**
 * One headline figure: what it is, its value, a line of context and, when there is a comparison, a trend whose
 * arrow and signed text say the direction (the colour only says whether it is good news).
 */
@Component({
  selector: 'app-stat-tile',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [HlmIcon],
  viewProviders: [provideIcons({ lucideArrowUpRight, lucideArrowDownRight, lucideArrowRight })],
  host: { class: 'flex min-w-0 flex-col gap-1 bg-card p-4' },
  template: `
    <span class="text-xs font-medium text-muted-foreground">{{ label() }}</span>
    <span class="text-2xl font-semibold tracking-tight" data-testid="stat-value">{{
      value()
    }}</span>
    @if (hint()) {
      <span class="text-xs text-muted-foreground">{{ hint() }}</span>
    }
    @if (trend(); as t) {
      <span
        class="inline-flex items-center gap-1 text-xs font-medium"
        [class]="toneClass()"
        data-testid="stat-trend"
      >
        <hlm-icon [name]="icon()" size="13px" aria-hidden="true" />
        {{ t.text }}
      </span>
    }
  `,
})
export class StatTile {
  readonly label = input.required<string>();
  readonly value = input.required<string>();
  readonly hint = input<string>('');
  readonly trend = input<StatTrend | null>(null);

  protected readonly icon = computed(() => TREND_ICON[this.trend()?.direction ?? 'flat']);
  protected readonly toneClass = computed(() => TREND_TONE[this.trend()?.tone ?? 'neutral']);
}
