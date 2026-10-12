import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { AuthStore } from '../../../../core/auth/auth.store';
import { PermissionsStore } from '../../../../core/authz/permissions.store';
import { BillingStore } from '../../../billing/data/billing.store';
import { OverviewApiService } from '../../data/overview-api.service';
import { OrganizationOverviewResponse } from '../../data/overview.models';
import { percent, trendOf } from '../../data/overview';
import { BarList, BarListItem } from '../../../../shared/charts/bar-list';
import { ChartCard } from '../../../../shared/charts/chart-card';
import { Meter } from '../../../../shared/charts/meter';
import { StatTile } from '../../../../shared/charts/stat-tile';
import { HlmButton, HlmSkeleton } from '../../../../shared/ui';
import { AssistanceCard } from '../../components/overview/assistance-card';
import { KpiStrip } from '../../components/overview/kpi-strip';
import { OverviewError } from '../../components/overview/overview-error';
import { OverviewSkeleton } from '../../components/overview/overview-skeleton';
import { PriorityCard } from '../../components/overview/priority-card';
import { formatCount, statTrend } from '../../components/overview/stat-trend';
import { StoryStatusCard } from '../../components/overview/story-status-card';
import { WeeklyActivityCard } from '../../components/overview/weekly-activity-card';

type LoadState = 'loading' | 'ready' | 'error' | 'forbidden';

/**
 * Organization landing page: the figures of every project the caller can reach, added up. KPIs, weekly
 * activity, the backlog by status and priority, how the copilot's proposals fared, the busiest projects
 * and, for the owner, the AI token consumption against the plan. Owners and admins also see the headcount.
 * Only aggregates are shown here; the project pages hold the detail.
 */
@Component({
  selector: 'app-org-overview',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    TranslocoPipe,
    BarList,
    ChartCard,
    Meter,
    StatTile,
    KpiStrip,
    HlmButton,
    HlmSkeleton,
    OverviewSkeleton,
    OverviewError,
    StoryStatusCard,
    PriorityCard,
    AssistanceCard,
    WeeklyActivityCard,
  ],
  template: `
    <div class="flex flex-col gap-6">
      <div>
        <h1 class="text-2xl font-bold tracking-tight">{{ 'nav.overview' | transloco }}</h1>
        <p class="mt-1 text-sm text-muted-foreground">{{ 'overview.org.subtitle' | transloco }}</p>
      </div>

      @switch (state()) {
        @case ('loading') {
          <app-overview-skeleton />
        }
        @case ('error') {
          <app-overview-error (retry)="reload()">{{
            'overview.loadError' | transloco
          }}</app-overview-error>
        }
        @case ('forbidden') {
          <p class="rounded-2xl border border-border p-5 text-sm text-muted-foreground">
            {{ 'overview.forbidden' | transloco }}
          </p>
        }
        @default {
          @if (overview(); as o) {
            @if (o.projects === 0) {
              <section
                class="flex flex-col items-start gap-3 rounded-2xl border border-dashed border-border p-6"
                data-testid="overview-empty"
              >
                <h2 class="text-base font-semibold">{{ 'overview.empty.orgTitle' | transloco }}</h2>
                <p class="max-w-prose text-sm text-muted-foreground">
                  {{ 'overview.empty.orgBody' | transloco }}
                </p>
                <a hlmBtn size="sm" routerLink="/projects">{{
                  'overview.empty.orgCta' | transloco
                }}</a>
              </section>
            } @else {
              <app-kpi-strip [label]="'overview.kpiAria' | transloco" data-testid="kpi-strip">
                @for (tile of tiles(); track tile.key) {
                  <app-stat-tile
                    [label]="tile.label"
                    [value]="tile.value"
                    [hint]="tile.hint"
                    [trend]="tile.trend"
                  />
                }
              </app-kpi-strip>

              <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <app-weekly-activity-card
                  class="lg:col-span-2"
                  [stories]="o.backlog.createdByWeek"
                  [sessions]="o.discovery.createdByWeek"
                  [weeks]="o.weeks"
                />
                <app-story-status-card [byStatus]="o.backlog.byStatus" />
                <app-chart-card
                  [title]="'overview.org.topProjects.title' | transloco"
                  [description]="'overview.org.topProjects.description' | transloco"
                >
                  @if (topProjects().length === 0) {
                    <p class="py-8 text-center text-sm text-muted-foreground">
                      {{ 'overview.empty.recent' | transloco }}
                    </p>
                  } @else {
                    <app-bar-list [items]="topProjects()" data-testid="top-projects" />
                  }
                </app-chart-card>
                <app-assistance-card [assistance]="o.discovery.assistance" />
                <app-priority-card [byPriority]="o.backlog.byPriority" />

                @if (isOwner()) {
                  <app-chart-card
                    class="lg:col-span-2"
                    [title]="'overview.org.tokens.title' | transloco"
                    [description]="'overview.org.tokens.description' | transloco"
                  >
                    @if (usageState() === 'loading') {
                      <hlm-skeleton class="h-8 w-full" />
                    } @else if (usageState() === 'error') {
                      <p class="text-sm text-muted-foreground">
                        {{ 'usage.loadError' | transloco }}
                      </p>
                    } @else if (usage(); as u) {
                      <div class="flex flex-col gap-3" data-testid="tokens">
                        <app-meter
                          [label]="'billing.planName.' + u.planType | transloco"
                          [value]="u.tokensUsed"
                          [max]="u.tokensLimit"
                          [valueText]="tokensText()"
                          [color]="tokensColor()"
                        />
                        <a
                          class="self-start text-sm font-medium text-primary underline-offset-4 hover:underline"
                          routerLink="/settings/usage"
                          >{{ 'overview.org.tokens.manage' | transloco }}</a
                        >
                      </div>
                    }
                  </app-chart-card>
                }
              </div>
            }
          }
        }
      }
    </div>
  `,
})
export class OrgOverview {
  private readonly auth = inject(AuthStore);
  private readonly permissions = inject(PermissionsStore);
  private readonly api = inject(OverviewApiService);
  private readonly billing = inject(BillingStore);
  private readonly transloco = inject(TranslocoService);
  private readonly lang = toSignal(this.transloco.langChanges$, {
    initialValue: this.transloco.getActiveLang(),
  });

  protected readonly state = signal<LoadState>('loading');
  protected readonly overview = signal<OrganizationOverviewResponse | null>(null);
  private readonly attempt = signal(0);

  /** AI token consumption is the owner's to see (the usage endpoint is owner-only). */
  protected readonly isOwner = this.permissions.isOrgOwner;
  protected readonly usage = this.billing.usage;
  protected readonly usageState = this.billing.usageState;

  protected readonly tokensColor = computed(() => {
    const pct = this.usage()?.usagePercentage ?? 0;
    if (pct >= 90) return 'var(--chart-priority-critical)';
    if (pct >= 75) return 'var(--chart-draft)';
    return 'var(--chart-series-1)';
  });
  protected readonly tokensText = computed(() => {
    const u = this.usage();
    this.lang();
    if (!u) return '';
    const locale = this.transloco.getActiveLang();
    return this.transloco.translate('overview.org.tokens.used', {
      used: formatCount(u.tokensUsed, locale),
      limit: formatCount(u.tokensLimit, locale),
      pct: percent(u.tokensUsed, u.tokensLimit),
    });
  });

  protected readonly tiles = computed(() => {
    const o = this.overview();
    this.lang();
    if (!o) return [];
    const t = (key: string, params?: Record<string, unknown>) =>
      this.transloco.translate(key, params);
    const fmt = (n: number) => formatCount(n, this.transloco.getActiveLang());
    const a = o.discovery.assistance;
    const out: {
      key: string;
      label: string;
      value: string;
      hint: string;
      trend: ReturnType<typeof statTrend>;
    }[] = [
      {
        key: 'projects',
        label: t('overview.kpi.projects'),
        value: fmt(o.projects),
        hint: '',
        trend: null,
      },
      {
        key: 'stories',
        label: t('overview.kpi.stories'),
        value: fmt(o.backlog.coverage.live),
        hint: t('overview.kpi.storiesHint', {
          approved: fmt(o.backlog.byStatus['APPROVED'] ?? 0),
          drafts: fmt(o.backlog.byStatus['DRAFT'] ?? 0),
        }),
        trend: statTrend(trendOf(o.backlog.createdByWeek), t),
      },
      {
        key: 'sessions',
        label: t('overview.kpi.sessions'),
        value: fmt(o.discovery.sessions),
        hint: t('overview.kpi.sessionsHint', { n: fmt(o.discovery.byStatus['COMPLETED'] ?? 0) }),
        trend: statTrend(trendOf(o.discovery.createdByWeek), t),
      },
      {
        key: 'ai',
        label: t('overview.kpi.aiRate'),
        value: a.acceptanceRate === null ? '—' : `${Math.round(a.acceptanceRate * 100)}%`,
        hint:
          a.acceptanceRate === null
            ? t('overview.kpi.aiRateNone')
            : t('overview.kpi.aiRateHint', {
                accepted: fmt(a.accepted),
                decided: fmt(a.accepted + a.dismissed),
              }),
        trend: null,
      },
    ];
    if (o.members) {
      out.push({
        key: 'members',
        label: t('overview.kpi.members'),
        value: fmt(o.members.active),
        hint: t('overview.kpi.membersHint', {
          admins: fmt(o.members.byRole['ADMIN'] ?? 0),
          pending: fmt(o.members.pending),
        }),
        trend: null,
      });
    }
    return out;
  });

  protected readonly topProjects = computed<BarListItem[]>(() => {
    const o = this.overview();
    this.lang();
    if (!o) return [];
    return o.topProjects.map((p) => ({
      key: p.projectId,
      label: p.name,
      value: p.stories + p.sessions,
      detail: this.transloco.translate('overview.org.topProjects.detail', {
        stories: p.stories,
        sessions: p.sessions,
      }),
      color: 'var(--chart-series-1)',
      link: ['/projects', p.projectId, 'overview'],
    }));
  });

  constructor() {
    effect((onCleanup) => {
      const orgId = this.auth.organizationId();
      this.attempt();
      if (!orgId) return;
      this.state.set('loading');
      const sub = this.api.getOrganizationOverview(orgId).subscribe({
        next: (overview) => {
          this.overview.set(overview);
          this.state.set('ready');
        },
        error: (err: unknown) =>
          this.state.set(
            err instanceof HttpErrorResponse && err.status === 403 ? 'forbidden' : 'error',
          ),
      });
      onCleanup(() => sub.unsubscribe());
    });

    effect(() => {
      const orgId = this.auth.organizationId();
      if (orgId && this.isOwner()) this.billing.loadUsage(orgId);
    });
  }

  protected reload(): void {
    this.attempt.update((n) => n + 1);
  }
}
