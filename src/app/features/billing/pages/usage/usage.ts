import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { provideIcons } from '@ng-icons/core';
import { lucideCircleAlert } from '@ng-icons/lucide';
import { TranslocoPipe } from '@jsverse/transloco';
import { RouterLink } from '@angular/router';
import { AuthStore } from '../../../../core/auth/auth.store';
import { HlmButton, HlmIcon, HlmSkeleton } from '../../../../shared/ui';
import { BillingStore } from '../../data/billing.store';

/**
 * Organization usage page (Settings → Usage). Owner-only (enforced by the backend). Shows AI token
 * consumption against the plan's monthly allowance for the current billing period, with a progress
 * bar that turns amber/red as the quota fills.
 */
@Component({
  selector: 'app-usage',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, DecimalPipe, TranslocoPipe, RouterLink, HlmButton, HlmIcon, HlmSkeleton],
  viewProviders: [provideIcons({ lucideCircleAlert })],
  template: `
    <div class="flex flex-col gap-6">
      @if (usageState() === 'loading') {
        <section
          class="overflow-hidden rounded-2xl border border-border"
          data-testid="usage-skeleton"
        >
          <div class="flex flex-col gap-4 p-5">
            <hlm-skeleton class="h-5 w-40" />
            <hlm-skeleton class="h-3 w-full rounded-full" />
            <hlm-skeleton class="h-3 w-56 max-w-full" />
          </div>
        </section>
      } @else if (usageState() === 'error') {
        <div
          class="flex items-start gap-3 rounded-2xl border border-destructive/40 bg-destructive/5 p-5 text-sm"
          role="alert"
        >
          <hlm-icon name="lucideCircleAlert" size="18px" class="mt-0.5 shrink-0 text-destructive" />
          <p class="text-muted-foreground">{{ 'usage.loadError' | transloco }}</p>
        </div>
      } @else if (usage(); as u) {
        <!-- Token quota -->
        <section class="overflow-hidden rounded-2xl border border-border">
          <div class="flex flex-col gap-4 p-5">
            <div class="flex flex-wrap items-baseline justify-between gap-2">
              <div class="flex flex-col gap-1">
                <h2 class="text-base font-semibold">{{ 'usage.tokensTitle' | transloco }}</h2>
                <p class="text-sm text-muted-foreground">
                  {{
                    'usage.period'
                      | transloco
                        : {
                            start: u.currentPeriodStart | date: 'mediumDate',
                            end: u.currentPeriodEnd | date: 'mediumDate',
                          }
                  }}
                </p>
              </div>
              <span class="text-sm font-medium">
                {{ u.tokensUsed | number }} / {{ u.tokensLimit | number }}
              </span>
            </div>

            <div class="h-2.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                class="h-full rounded-full transition-all"
                [class]="barColor()"
                [style.width.%]="clampedPercentage()"
              ></div>
            </div>

            <div class="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span class="text-muted-foreground">
                {{ 'usage.remaining' | transloco: { count: (u.tokensRemaining | number) } }}
              </span>
              <span class="font-medium">{{ percentageLabel() }}</span>
            </div>

            @if (clampedPercentage() >= 100) {
              <div
                class="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                role="alert"
              >
                <hlm-icon name="lucideCircleAlert" size="16px" class="mt-0.5 shrink-0" />
                <span>{{ 'usage.exhausted' | transloco }}</span>
              </div>
            }
          </div>
        </section>

        <!-- Plan summary -->
        <section class="overflow-hidden rounded-2xl border border-border">
          <div class="flex flex-wrap items-center justify-between gap-4 p-5">
            <div class="flex flex-col gap-1">
              <h2 class="text-base font-semibold">{{ 'usage.planTitle' | transloco }}</h2>
              <p class="text-sm text-muted-foreground">
                {{ 'billing.planName.' + u.planType | transloco }}
              </p>
            </div>
            <a hlmBtn size="sm" variant="outline" routerLink="/settings/billing">
              {{ 'usage.managePlan' | transloco }}
            </a>
          </div>
        </section>
      }
    </div>
  `,
})
export class Usage {
  private readonly auth = inject(AuthStore);
  private readonly store = inject(BillingStore);

  protected readonly usage = this.store.usage;
  protected readonly usageState = this.store.usageState;

  protected readonly clampedPercentage = computed(() => {
    const pct = this.usage()?.usagePercentage ?? 0;
    return Math.min(100, Math.max(0, Math.round(pct)));
  });

  protected readonly percentageLabel = computed(() => `${this.clampedPercentage()}%`);

  protected readonly barColor = computed(() => {
    const pct = this.clampedPercentage();
    if (pct >= 90) return 'bg-destructive';
    if (pct >= 75) return 'bg-amber-500';
    return 'bg-primary';
  });

  constructor() {
    const orgId = this.auth.organizationId();
    if (orgId) this.store.loadUsage(orgId);
  }
}
