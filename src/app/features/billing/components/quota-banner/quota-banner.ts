import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { provideIcons } from '@ng-icons/core';
import { lucideCircleAlert, lucideTriangleAlert } from '@ng-icons/lucide';
import { TranslocoPipe } from '@jsverse/transloco';
import { HlmIcon } from '../../../../shared/ui';
import { percentOf } from '../../data/ai-quota';
import { QuotaLevel } from '../../data/billing.models';

/**
 * The notice for the monthly AI allowance at 80, 90 and 100 percent. Full size on the usage page,
 * `compact` (one line) where AI is used, such as the capture page. At the cap it says what stops and
 * what does not; the owner gets a link to upgrade, anyone else is told to ask the owner.
 */
@Component({
  selector: 'app-quota-banner',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, DecimalPipe, RouterLink, TranslocoPipe, HlmIcon],
  viewProviders: [provideIcons({ lucideCircleAlert, lucideTriangleAlert })],
  template: `
    @if (level() !== 'NONE') {
      <div
        class="flex items-start gap-3 rounded-xl border text-sm"
        [class]="
          (exhausted()
            ? 'border-destructive/40 bg-destructive/5'
            : 'border-amber-500/40 bg-amber-500/5') + (compact() ? ' px-3 py-2' : ' p-4')
        "
        [attr.role]="exhausted() ? 'alert' : 'status'"
        [attr.data-testid]="'quota-banner-' + level()"
      >
        <hlm-icon
          [name]="exhausted() ? 'lucideCircleAlert' : 'lucideTriangleAlert'"
          size="16px"
          class="mt-0.5 shrink-0"
          [class]="exhausted() ? 'text-destructive' : 'text-amber-600 dark:text-amber-400'"
        />
        <div class="flex min-w-0 flex-1 flex-col gap-1">
          <p class="font-medium text-foreground">
            @if (paused()) {
              {{ 'quota.pausedTitle' | transloco }}
            } @else if (exhausted()) {
              {{ 'quota.exhaustedTitle' | transloco }}
            } @else {
              {{ 'quota.warningTitle' | transloco: { percent: percent() } }}
            }
          </p>
          @if (!compact()) {
            <p class="text-muted-foreground">
              @if (exhausted()) {
                {{ 'quota.exhaustedBody' | transloco }}
                @if (resetsAt()) {
                  {{ 'quota.renews' | transloco: { date: (resetsAt() | date: 'mediumDate') } }}
                }
              } @else {
                {{
                  'quota.warningBody'
                    | transloco: { used: (used() | number), limit: (limit() | number) }
                }}
              }
            </p>
          } @else if (paused()) {
            <p class="text-muted-foreground">{{ 'quota.pausedBody' | transloco }}</p>
          } @else if (exhausted()) {
            <p class="text-muted-foreground">{{ 'quota.exhaustedShort' | transloco }}</p>
          }
        </div>
        @if (canUpgrade()) {
          <a
            routerLink="/settings/billing"
            class="shrink-0 rounded-md px-2 py-1 text-sm font-medium text-foreground underline underline-offset-4 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            data-testid="quota-upgrade"
          >
            {{ 'quota.upgrade' | transloco }}
          </a>
        } @else if (exhausted() && !compact()) {
          <span class="shrink-0 text-xs text-muted-foreground">{{
            'quota.askOwner' | transloco
          }}</span>
        }
      </div>
    }
  `,
})
export class QuotaBanner {
  readonly level = input.required<QuotaLevel>();
  readonly used = input<number | null>(null);
  readonly limit = input<number | null>(null);
  readonly resetsAt = input<string | null>(null);
  readonly compact = input(false);
  /** A live session's suggestions are paused (capture page). */
  readonly paused = input(false);
  /** Only the owner can open the billing page. */
  readonly canUpgrade = input(false);

  protected readonly exhausted = computed(() => this.level() === 'EXHAUSTED');
  protected readonly percent = computed(() => percentOf(this.level()));
}
