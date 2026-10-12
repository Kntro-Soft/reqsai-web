import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { provideIcons } from '@ng-icons/core';
import { lucideCircleAlert } from '@ng-icons/lucide';
import { TranslocoPipe } from '@jsverse/transloco';
import { RouterLink } from '@angular/router';
import { AuthStore } from '../../../../core/auth/auth.store';
import { TranslocoService } from '@jsverse/transloco';
import { HlmButton, HlmIcon, HlmSkeleton } from '../../../../shared/ui';
import { WorkspaceStore } from '../../../workspace/data/workspace.store';
import { QuotaBanner } from '../../components/quota-banner/quota-banner';
import { UsageBars } from '../../components/usage-bars/usage-bars';
import {
  audioMinutes,
  cachedShare,
  featureRows,
  meetingTime,
  projectRows,
} from '../../data/usage-insights';
import { BillingStore } from '../../data/billing.store';

/**
 * Organization usage page (Settings → Usage). Owner-only (enforced by the backend). Shows AI token
 * consumption against the plan's monthly allowance for the current billing period, with a progress
 * bar that turns amber/red as the quota fills.
 */
@Component({
  selector: 'app-usage',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    DecimalPipe,
    TranslocoPipe,
    RouterLink,
    HlmButton,
    HlmIcon,
    HlmSkeleton,
    QuotaBanner,
    UsageBars,
  ],
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
        <app-quota-banner
          [level]="u.warningLevel"
          [used]="u.tokensUsed"
          [limit]="u.tokensLimit"
          [resetsAt]="u.currentPeriodEnd"
          [canUpgrade]="true"
        />

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
          </div>
        </section>

        <!-- Meeting time left -->
        <section class="overflow-hidden rounded-2xl border border-border">
          <div class="flex flex-col gap-1 p-5" data-testid="usage-meeting-estimate">
            <h2 class="text-base font-semibold">{{ 'usage.meeting.title' | transloco }}</h2>
            <p class="text-2xl font-semibold tabular-nums">
              {{
                'usage.meeting.' + meeting().unit
                  | transloco: { count: (meeting().value | number: '1.0-1') }
              }}
            </p>
            <p class="text-sm text-muted-foreground">
              {{
                (u.meetingEstimate.measured ? 'usage.meeting.measured' : 'usage.meeting.estimated')
                  | transloco: { rate: (u.meetingEstimate.tokensPerMinute | number) }
              }}
            </p>
          </div>
        </section>

        <!-- Where the tokens went -->
        <section class="overflow-hidden rounded-2xl border border-border">
          <div class="flex flex-col gap-5 p-5">
            <h2 class="text-base font-semibold">{{ 'usage.breakdown.title' | transloco }}</h2>
            @if (featureBars().length === 0) {
              <p class="text-sm text-muted-foreground" data-testid="usage-breakdown-empty">
                {{ 'usage.breakdown.empty' | transloco }}
              </p>
            } @else {
              <div class="grid gap-8 md:grid-cols-2">
                <div class="flex flex-col gap-3">
                  <h3 class="text-sm font-medium text-muted-foreground">
                    {{ 'usage.breakdown.byFeature' | transloco }}
                  </h3>
                  <app-usage-bars
                    [rows]="featureBars()"
                    [label]="'usage.breakdown.byFeature' | transloco"
                  />
                </div>
                <div class="flex flex-col gap-3">
                  <h3 class="text-sm font-medium text-muted-foreground">
                    {{ 'usage.breakdown.byProject' | transloco }}
                  </h3>
                  @if (projectBars().length > 0) {
                    <app-usage-bars
                      [rows]="projectBars()"
                      [label]="'usage.breakdown.byProject' | transloco"
                    />
                  } @else {
                    <p class="text-sm text-muted-foreground">
                      {{ 'usage.breakdown.noProjects' | transloco }}
                    </p>
                  }
                </div>
              </div>
            }
            <ul class="flex flex-col gap-1 text-sm text-muted-foreground">
              @if (transcribedMinutes() > 0) {
                <li data-testid="usage-transcription">
                  {{ 'usage.breakdown.transcription' | transloco: { count: transcribedMinutes() } }}
                </li>
              }
              @if (cached() > 0) {
                <li>{{ 'usage.breakdown.cached' | transloco: { percent: cached() } }}</li>
              }
            </ul>
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
  private readonly workspace = inject(WorkspaceStore);
  private readonly transloco = inject(TranslocoService);

  protected readonly usage = this.store.usage;
  protected readonly usageState = this.store.usageState;

  protected readonly clampedPercentage = computed(() => {
    const pct = this.usage()?.usagePercentage ?? 0;
    return Math.min(100, Math.max(0, Math.round(pct)));
  });

  protected readonly meeting = computed(() =>
    meetingTime(this.usage()?.meetingEstimate.minutesLeft ?? 0),
  );

  protected readonly featureBars = computed(() => {
    const u = this.usage();
    if (!u) return [];
    return featureRows(u.breakdown.byFeature, u.tokensUsed, (feature) =>
      this.labelOrKey(`usage.features.${feature}`, feature),
    );
  });

  protected readonly projectBars = computed(() => {
    const u = this.usage();
    if (!u) return [];
    const names = new Map(this.workspace.projects().map((p) => [p.id, p.name]));
    return projectRows(
      u.breakdown.topProjects,
      u.tokensUsed,
      (id) => names.get(id) ?? null,
      this.transloco.translate('usage.breakdown.unknownProject'),
    );
  });

  protected readonly transcribedMinutes = computed(() =>
    audioMinutes(this.usage()?.breakdown.transcriptionSeconds ?? 0),
  );

  protected readonly cached = computed(() => cachedShare(this.usage()?.breakdown.byFeature ?? []));

  protected readonly percentageLabel = computed(() => `${this.clampedPercentage()}%`);

  protected readonly barColor = computed(() => {
    const pct = this.clampedPercentage();
    if (pct >= 90) return 'bg-destructive';
    if (pct >= 75) return 'bg-amber-500';
    return 'bg-primary';
  });

  constructor() {
    const orgId = this.auth.organizationId();
    if (orgId) {
      this.store.loadUsage(orgId);
      if (this.workspace.projects().length === 0) this.workspace.loadProjects(orgId);
    }
  }

  private labelOrKey(key: string, fallback: string): string {
    const text = this.transloco.translate(key);
    return text === key ? fallback : text;
  }
}
