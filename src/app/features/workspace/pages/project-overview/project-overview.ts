import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { provideIcons } from '@ng-icons/core';
import { lucideFlaskConical } from '@ng-icons/lucide';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { AuthStore } from '../../../../core/auth/auth.store';
import { PermissionsStore } from '../../../../core/authz/permissions.store';
import { WorkspaceApiService } from '../../data/workspace-api.service';
import { ProjectResponse } from '../../data/workspace.models';
import { OverviewApiService } from '../../data/overview-api.service';
import { ProjectOverviewResponse } from '../../data/overview.models';
import { percent, trendOf } from '../../data/overview';
import { NavIcon } from '../../../../shared/components/nav-icon/nav-icon';
import { DemoBadge } from '../../../../shared/components/demo-badge/demo-badge';
import { ChartCard } from '../../../../shared/charts/chart-card';
import { Meter } from '../../../../shared/charts/meter';
import { StatTile } from '../../../../shared/charts/stat-tile';
import { HlmButton } from '../../../../shared/ui';
import { StoryStatusBadge } from '../../../discovery/components/story-badges/story-badges';
import { DemoRestore } from '../../components/demo-restore/demo-restore';
import { AssistanceCard } from '../../components/overview/assistance-card';
import { KpiStrip } from '../../components/overview/kpi-strip';
import { OverviewError } from '../../components/overview/overview-error';
import { OverviewSkeleton } from '../../components/overview/overview-skeleton';
import { PriorityCard } from '../../components/overview/priority-card';
import { formatCount, statTrend } from '../../components/overview/stat-trend';
import { StoryStatusCard } from '../../components/overview/story-status-card';
import { WeeklyActivityCard } from '../../components/overview/weekly-activity-card';
import { HlmIcon } from '../../../../shared/ui';

type LoadState = 'loading' | 'ready' | 'error' | 'forbidden';

/**
 * Project landing page: shortcuts into the project's sections, then the project's figures: KPIs, the
 * backlog by status and priority, weekly activity, how the copilot's proposals fared, requirement coverage,
 * the project's context (glossary, constraints, documents, code) and what happened last.
 *
 * Every section comes from one read-only endpoint that already leaves out what the caller's project
 * permissions do not allow, so a section the server did not send is simply not drawn.
 *
 * The organization's demo project carries a "Demo" badge and a banner explaining its sample data, with
 * the "restore sample data" action for callers who may change the project.
 */
@Component({
  selector: 'app-project-overview',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    DatePipe,
    NavIcon,
    DemoBadge,
    DemoRestore,
    HlmIcon,
    HlmButton,
    TranslocoPipe,
    ChartCard,
    Meter,
    StatTile,
    KpiStrip,
    StoryStatusBadge,
    OverviewSkeleton,
    OverviewError,
    StoryStatusCard,
    PriorityCard,
    AssistanceCard,
    WeeklyActivityCard,
  ],
  viewProviders: [provideIcons({ lucideFlaskConical })],
  template: `
    <div class="flex flex-col gap-6">
      <div>
        <div class="flex flex-wrap items-center gap-2">
          <h1 class="text-2xl font-bold tracking-tight">
            {{ project()?.name ?? ('nav.projectFallback' | transloco) }}
          </h1>
          @if (isDemo()) {
            <app-demo-badge />
          }
        </div>
        <p class="mt-1 text-sm text-muted-foreground">{{ 'overview.subtitle' | transloco }}</p>
      </div>

      @if (isDemo()) {
        <section
          class="flex flex-col gap-4 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 sm:flex-row sm:items-center sm:justify-between"
          data-testid="demo-banner"
        >
          <div class="flex items-start gap-3">
            <span
              class="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400"
            >
              <hlm-icon name="lucideFlaskConical" size="18px" />
            </span>
            <div class="flex flex-col gap-0.5">
              <p class="text-sm font-medium">{{ 'demo.bannerTitle' | transloco }}</p>
              <p class="text-sm text-muted-foreground">{{ 'demo.bannerBody' | transloco }}</p>
            </div>
          </div>
          @if (canRestoreDemo()) {
            <app-demo-restore
              class="shrink-0"
              [projectId]="projectId()"
              (restored)="project.set($event)"
            />
          }
        </section>
      }

      <nav
        class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
        [attr.aria-label]="'overview.shortcuts' | transloco"
      >
        @for (item of links(); track item) {
          <a
            [routerLink]="['/projects', projectId(), item]"
            class="group flex items-center gap-3 rounded-xl border border-border bg-card px-3.5 py-3 transition-colors hover:border-primary/40 hover:bg-accent/40"
          >
            <span
              class="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"
            >
              <app-nav-icon [name]="item" [size]="17" />
            </span>
            <span class="text-sm font-medium">{{ 'nav.' + item | transloco }}</span>
          </a>
        }
      </nav>

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
            @if (isEmpty()) {
              <section
                class="flex flex-col items-start gap-3 rounded-2xl border border-dashed border-border p-6"
                data-testid="overview-empty"
              >
                <h2 class="text-base font-semibold">{{ 'overview.empty.title' | transloco }}</h2>
                <p class="max-w-prose text-sm text-muted-foreground">
                  {{ 'overview.empty.body' | transloco }}
                </p>
                @if (links().includes('sessions')) {
                  <a hlmBtn size="sm" [routerLink]="['/projects', projectId(), 'sessions']">
                    {{ 'overview.empty.cta' | transloco }}
                  </a>
                }
              </section>
            } @else {
              @if (tiles().length > 0) {
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
              }
            }

            <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
              @if (!isEmpty()) {
                @if (o.backlog || o.discovery) {
                  <app-weekly-activity-card
                    class="lg:col-span-2"
                    [stories]="o.backlog?.createdByWeek ?? null"
                    [sessions]="o.discovery?.createdByWeek ?? null"
                    [weeks]="o.weeks"
                  />
                }
                @if (o.backlog; as backlog) {
                  <app-story-status-card [byStatus]="backlog.byStatus" />
                  <app-priority-card [byPriority]="backlog.byPriority" />
                }
                @if (o.discovery; as discovery) {
                  <app-assistance-card [assistance]="discovery.assistance" />
                }
                @if (o.backlog; as backlog) {
                  <app-chart-card
                    [title]="'overview.coverage.title' | transloco"
                    [description]="
                      'overview.coverage.description' | transloco: { n: backlog.coverage.live }
                    "
                  >
                    @if (backlog.coverage.live === 0) {
                      <p class="py-8 text-center text-sm text-muted-foreground">
                        {{ 'overview.empty.coverage' | transloco }}
                      </p>
                    } @else {
                      <div class="flex flex-col gap-4" data-testid="coverage">
                        <app-meter
                          [label]="'overview.coverage.criteria' | transloco"
                          [value]="backlog.coverage.withAcceptanceCriteria"
                          [max]="backlog.coverage.live"
                          [valueText]="
                            meterText(
                              backlog.coverage.withAcceptanceCriteria,
                              backlog.coverage.live
                            )
                          "
                        />
                        <app-meter
                          [label]="'overview.coverage.origin' | transloco"
                          [value]="backlog.coverage.withOrigin"
                          [max]="backlog.coverage.live"
                          [valueText]="
                            meterText(backlog.coverage.withOrigin, backlog.coverage.live)
                          "
                        />
                        @if ((o.code?.repositories ?? 0) > 0 || backlog.coverage.linkedToCode > 0) {
                          <app-meter
                            [label]="'overview.coverage.code' | transloco"
                            [value]="backlog.coverage.linkedToCode"
                            [max]="backlog.coverage.live"
                            [valueText]="
                              meterText(backlog.coverage.linkedToCode, backlog.coverage.live)
                            "
                          />
                        }
                      </div>
                    }
                  </app-chart-card>
                }
              }

              @if (contextRows().length > 0) {
                <app-chart-card
                  class="lg:col-span-2"
                  [title]="'overview.context.title' | transloco"
                  [description]="'overview.context.description' | transloco"
                >
                  <ul
                    class="grid gap-x-8 divide-y divide-border sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-4"
                    data-testid="context"
                  >
                    @for (row of contextRows(); track row.seg) {
                      <li>
                        <a
                          [routerLink]="row.link"
                          class="flex items-center gap-3 py-2.5 text-sm transition-colors hover:text-primary sm:flex-col sm:items-start sm:gap-1.5 sm:rounded-lg sm:border sm:border-border sm:p-3 sm:hover:border-primary/40"
                        >
                          <app-nav-icon
                            [name]="row.seg"
                            [size]="16"
                            class="text-muted-foreground"
                          />
                          <span class="flex-1 font-medium">{{ 'nav.' + row.seg | transloco }}</span>
                          <span class="text-muted-foreground">{{ row.text }}</span>
                        </a>
                      </li>
                    }
                  </ul>
                </app-chart-card>
              }

              @if (!isEmpty() && recentHasRows()) {
                <app-chart-card class="lg:col-span-2" [title]="'overview.recent.title' | transloco">
                  <div class="grid gap-6 md:grid-cols-2" data-testid="recent">
                    @if (o.discovery; as discovery) {
                      <div class="min-w-0">
                        <h3 class="mb-2 text-xs font-medium text-muted-foreground">
                          {{ 'overview.recent.sessions' | transloco }}
                        </h3>
                        @if (discovery.recent.length === 0) {
                          <p class="text-sm text-muted-foreground">
                            {{ 'overview.empty.recent' | transloco }}
                          </p>
                        }
                        <ul class="flex flex-col divide-y divide-border">
                          @for (s of discovery.recent; track s.id) {
                            <li class="flex items-center justify-between gap-3 py-2 text-sm">
                              <a
                                [routerLink]="['/projects', projectId(), 'sessions', 'history']"
                                class="min-w-0 truncate font-medium hover:text-primary hover:underline"
                                >{{ s.title }}</a
                              >
                              <span class="shrink-0 text-xs text-muted-foreground"
                                >{{ 'discovery.status.' + s.status | transloco }} ·
                                {{ s.createdAt | date: 'mediumDate' }}</span
                              >
                            </li>
                          }
                        </ul>
                      </div>
                    }
                    @if (o.backlog; as backlog) {
                      <div class="min-w-0">
                        <h3 class="mb-2 text-xs font-medium text-muted-foreground">
                          {{ 'overview.recent.stories' | transloco }}
                        </h3>
                        @if (backlog.recent.length === 0) {
                          <p class="text-sm text-muted-foreground">
                            {{ 'overview.empty.recent' | transloco }}
                          </p>
                        }
                        <ul class="flex flex-col divide-y divide-border">
                          @for (s of backlog.recent; track s.id) {
                            <li class="flex items-center justify-between gap-3 py-2 text-sm">
                              <a
                                [routerLink]="['/projects', projectId(), 'stories', s.id]"
                                class="min-w-0 truncate font-medium hover:text-primary hover:underline"
                                >{{ s.title }}</a
                              >
                              <app-story-status-badge class="shrink-0" [status]="s.status" />
                            </li>
                          }
                        </ul>
                      </div>
                    }
                  </div>
                </app-chart-card>
              }
            </div>
          }
        }
      }
    </div>
  `,
})
export class ProjectOverview {
  private readonly store = inject(AuthStore);
  private readonly permissions = inject(PermissionsStore);
  private readonly api = inject(WorkspaceApiService);
  private readonly overviewApi = inject(OverviewApiService);
  private readonly transloco = inject(TranslocoService);
  private readonly lang = toSignal(this.transloco.langChanges$, {
    initialValue: this.transloco.getActiveLang(),
  });

  readonly projectId = input.required<string>();
  protected readonly project = signal<ProjectResponse | null>(null);
  protected readonly isDemo = computed(() => this.project()?.demo === true);

  protected readonly state = signal<LoadState>('loading');
  protected readonly overview = signal<ProjectOverviewResponse | null>(null);
  private readonly attempt = signal(0);

  /** Restoring the sample data rewrites the project, so it takes the project-settings permission. */
  protected readonly canRestoreDemo = computed(
    () => this.permissions.isOrgOwnerOrAdmin() || this.permissions.has('PROJECT_UPDATE'),
  );

  /**
   * Quick-link cards, filtered to the sections the caller can actually open — a member
   * without a section's read permission shouldn't be offered a card that dead-ends in a
   * "no access" toast. Owner/admin bypass.
   * `settings` shows when any settings sub-page is reachable; the settings landing guard
   * then routes to the first accessible one.
   */
  protected readonly links = computed(() => {
    const can = (p: string) => this.permissions.isOrgOwnerOrAdmin() || this.permissions.has(p);
    const canMembers = can('MEMBER_READ');
    const canRoles = can('ROLE_READ');
    const canSettings = can('PROJECT_UPDATE') || canMembers || canRoles || can('PROJECT_DELETE');
    return [
      can('SESSION_READ') && 'sessions',
      can('STORY_READ') && 'stories',
      canMembers && 'members',
      canSettings && 'settings',
    ].filter((x): x is string => Boolean(x));
  });

  /** A project with no stories and no sessions has nothing to chart: say what to do instead of drawing zeros. */
  protected readonly isEmpty = computed(() => {
    const o = this.overview();
    if (!o) return false;
    return (o.backlog?.total ?? 0) === 0 && (o.discovery?.sessions ?? 0) === 0;
  });

  protected readonly tiles = computed(() => {
    const o = this.overview();
    this.lang();
    if (!o) return [];
    const t = (key: string, params?: Record<string, unknown>) =>
      this.transloco.translate(key, params);
    const fmt = (n: number) => formatCount(n, this.transloco.getActiveLang());
    const out: {
      key: string;
      label: string;
      value: string;
      hint: string;
      trend: ReturnType<typeof statTrend>;
    }[] = [];

    const backlog = o.backlog;
    if (backlog) {
      out.push({
        key: 'stories',
        label: t('overview.kpi.stories'),
        value: fmt(backlog.coverage.live),
        hint: t('overview.kpi.storiesHint', {
          approved: fmt(backlog.byStatus['APPROVED'] ?? 0),
          drafts: fmt(backlog.byStatus['DRAFT'] ?? 0),
        }),
        trend: statTrend(trendOf(backlog.createdByWeek), t),
      });
      out.push({
        key: 'points',
        label: t('overview.kpi.points'),
        value: fmt(backlog.storyPoints.total),
        hint:
          backlog.storyPoints.unestimated > 0
            ? t('overview.kpi.pointsHintUnestimated', { n: fmt(backlog.storyPoints.unestimated) })
            : t('overview.kpi.pointsHintApproved', { n: fmt(backlog.storyPoints.approved) }),
        trend: null,
      });
    }
    const discovery = o.discovery;
    if (discovery) {
      out.push({
        key: 'sessions',
        label: t('overview.kpi.sessions'),
        value: fmt(discovery.sessions),
        hint: t('overview.kpi.sessionsHint', { n: fmt(discovery.byStatus['COMPLETED'] ?? 0) }),
        trend: statTrend(trendOf(discovery.createdByWeek), t),
      });
      const a = discovery.assistance;
      out.push({
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
      });
    }
    return out;
  });

  /** Links to the pages behind the project's context, only for the figures the caller may read. */
  protected readonly contextRows = computed(() => {
    const o = this.overview();
    this.lang();
    if (!o) return [];
    const pid = this.projectId();
    const t = (key: string, params?: Record<string, unknown>) =>
      this.transloco.translate(key, params);
    const rows: { seg: string; link: string[]; text: string }[] = [];
    const k = o.knowledge;
    if (k?.glossaryTerms != null) {
      rows.push({
        seg: 'glossary',
        link: ['/projects', pid, 'glossary'],
        text: t('overview.context.glossary', { n: k.glossaryTerms }),
      });
    }
    if (k?.constraints != null) {
      rows.push({
        seg: 'constraints',
        link: ['/projects', pid, 'constraints'],
        text: t('overview.context.constraints', { n: k.constraints }),
      });
    }
    if (k?.documents != null) {
      rows.push({
        seg: 'documents',
        link: ['/projects', pid, 'documents'],
        text: t('overview.context.documents', { n: k.documents }),
      });
    }
    if (o.code) {
      rows.push({
        seg: 'code',
        link: ['/projects', pid, 'code'],
        text:
          o.code.repositories === 0
            ? t('overview.context.codeNone')
            : t('overview.context.code', { repos: o.code.repositories, modules: o.code.modules }),
      });
    }
    return rows;
  });

  protected readonly recentHasRows = computed(() => {
    const o = this.overview();
    return (o?.backlog?.recent.length ?? 0) + (o?.discovery?.recent.length ?? 0) > 0;
  });

  constructor() {
    effect(() => {
      const orgId = this.store.organizationId();
      const projectId = this.projectId();
      if (!orgId || !projectId) return;
      this.api.getProject(orgId, projectId).subscribe({
        next: (project) => this.project.set(project),
      });
    });

    effect((onCleanup) => {
      const projectId = this.projectId();
      this.attempt();
      if (!projectId) return;
      this.state.set('loading');
      const sub = this.overviewApi.getProjectOverview(projectId).subscribe({
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
  }

  protected reload(): void {
    this.attempt.update((n) => n + 1);
  }

  protected meterText(part: number, whole: number): string {
    return `${part} / ${whole} · ${percent(part, whole)}%`;
  }
}
