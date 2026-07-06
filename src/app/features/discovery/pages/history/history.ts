import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { provideIcons } from '@ng-icons/core';
import { lucideArrowLeft } from '@ng-icons/lucide';
import { DiscoveryApiService } from '../../data/discovery-api.service';
import { DiscoverySessionResponse } from '../../data/discovery.models';
import { formatElapsed } from '../../components/session-bar/session-bar';
import { HlmButton, HlmIcon, HlmSpinner } from '../../../../shared/ui';

/**
 * Paginated session history: date, duration, status and — when the parallel
 * backend branch exposes them — per-session stats columns (rendered only when
 * present). A row opens that session in the chat feed. Sessions are permanent,
 * immutable history: there is no delete or reset action anywhere.
 */
@Component({
  selector: 'app-discovery-history',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, DatePipe, TranslocoPipe, HlmButton, HlmIcon, HlmSpinner],
  viewProviders: [provideIcons({ lucideArrowLeft })],
  template: `
    <div class="flex flex-col gap-5">
      <div class="flex flex-col gap-2">
        <a
          [routerLink]="['..']"
          class="flex w-fit items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          data-testid="history-back"
        >
          <hlm-icon name="lucideArrowLeft" size="15px" />
          {{ 'discovery.history.back' | transloco }}
        </a>
        <div>
          <h1 class="text-2xl font-bold tracking-tight">
            {{ 'discovery.history.title' | transloco }}
          </h1>
          <p class="mt-1 text-sm text-muted-foreground">
            {{ 'discovery.history.subtitle' | transloco }}
          </p>
        </div>
      </div>

      @switch (state()) {
        @case ('loading') {
          <div class="flex justify-center py-10"><hlm-spinner class="h-6 w-6" /></div>
        }
        @case ('error') {
          <p class="text-sm text-destructive">{{ 'discovery.history.loadError' | transloco }}</p>
        }
        @default {
          @if (sessions().length === 0) {
            <div
              class="rounded-2xl border border-dashed border-border p-12 text-center"
              data-testid="history-empty"
            >
              <p class="text-sm font-medium">{{ 'discovery.history.emptyTitle' | transloco }}</p>
              <p class="mt-1 text-sm text-muted-foreground">
                {{ 'discovery.history.emptyBody' | transloco }}
              </p>
            </div>
          } @else {
            <div class="overflow-x-auto rounded-2xl border border-border">
              <table class="w-full text-sm">
                <thead class="border-b border-border bg-secondary/40 text-left">
                  <tr class="text-xs font-medium text-muted-foreground">
                    <th class="px-4 py-2.5">{{ 'discovery.history.colDate' | transloco }}</th>
                    <th class="px-4 py-2.5">{{ 'discovery.history.colDuration' | transloco }}</th>
                    <th class="px-4 py-2.5">{{ 'discovery.history.colStatus' | transloco }}</th>
                    @if (showStats()) {
                      <th class="px-4 py-2.5">{{ 'discovery.history.colStories' | transloco }}</th>
                      <th class="px-4 py-2.5">{{ 'discovery.history.colAccepted' | transloco }}</th>
                      <th class="px-4 py-2.5">{{ 'discovery.history.colPending' | transloco }}</th>
                      <th class="px-4 py-2.5">{{ 'discovery.history.colQuestions' | transloco }}</th>
                    }
                  </tr>
                </thead>
                <tbody>
                  @for (session of sessions(); track session.id) {
                    <tr
                      class="cursor-pointer border-b border-border transition-colors last:border-0 hover:bg-accent/40"
                      (click)="open(session)"
                      data-testid="history-row"
                    >
                      <td class="px-4 py-3">
                        {{ session.startedAt ?? session.createdAt | date: 'medium' }}
                      </td>
                      <td class="px-4 py-3 font-mono tabular-nums text-muted-foreground">
                        {{ duration(session) }}
                      </td>
                      <td class="px-4 py-3">
                        <span
                          class="rounded-full px-2 py-0.5 text-[11px] font-medium"
                          [class]="statusClass(session.status)"
                        >
                          {{ 'discovery.status.' + session.status | transloco }}
                        </span>
                      </td>
                      @if (showStats()) {
                        <td class="px-4 py-3 tabular-nums">
                          {{ session.storiesGeneratedCount ?? '—' }}
                        </td>
                        <td class="px-4 py-3 tabular-nums">
                          {{ session.storiesAcceptedCount ?? '—' }}
                        </td>
                        <td class="px-4 py-3 tabular-nums">
                          {{ session.pendingSuggestionsCount ?? '—' }}
                        </td>
                        <td class="px-4 py-3 tabular-nums">{{ session.questionsCount ?? '—' }}</td>
                      }
                    </tr>
                  }
                </tbody>
              </table>
            </div>

            @if (hasNext()) {
              <div class="flex justify-center">
                <button
                  hlmBtn
                  variant="outline"
                  size="sm"
                  type="button"
                  [disabled]="loadingMore()"
                  (click)="loadMore()"
                  data-testid="history-more"
                >
                  @if (loadingMore()) {
                    <hlm-spinner class="mr-1.5 h-4 w-4" />
                  }
                  {{ 'discovery.history.loadMore' | transloco }}
                </button>
              </div>
            }
          }
        }
      }
    </div>
  `,
})
export class DiscoveryHistory implements OnInit {
  private readonly api = inject(DiscoveryApiService);
  private readonly router = inject(Router);

  readonly projectId = input.required<string>();

  protected readonly sessions = signal<DiscoverySessionResponse[]>([]);
  protected readonly state = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly loadingMore = signal(false);
  protected readonly hasNext = signal(false);
  private nextPage = 0;

  /** Show stats columns only when at least one session actually carries them. */
  protected readonly showStats = computed(() =>
    this.sessions().some((s) => s.storiesGeneratedCount !== null && s.storiesGeneratedCount !== undefined),
  );

  ngOnInit(): void {
    this.load(0);
  }

  private load(page: number): void {
    if (page === 0) this.state.set('loading');
    this.api.listSessions(this.projectId(), page, 20).subscribe({
      next: (result) => {
        this.sessions.update((list) =>
          page === 0 ? result.content : [...list, ...result.content],
        );
        this.hasNext.set(result.page?.hasNext ?? result.page.number + 1 < result.page.totalPages);
        this.nextPage = page + 1;
        this.state.set('ready');
        this.loadingMore.set(false);
      },
      error: () => {
        this.state.set('error');
        this.loadingMore.set(false);
      },
    });
  }

  protected loadMore(): void {
    if (this.loadingMore()) return;
    this.loadingMore.set(true);
    this.load(this.nextPage);
  }

  protected open(session: DiscoverySessionResponse): void {
    void this.router.navigate(['/projects', this.projectId(), 'sessions'], {
      queryParams: { session: session.id },
    });
  }

  protected duration(session: DiscoverySessionResponse): string {
    return session.audioDurationMs > 0 ? formatElapsed(session.audioDurationMs) : '—';
  }

  protected statusClass(status: string): string {
    const classes: Record<string, string> = {
      RECORDING: 'bg-emerald-500/15 text-emerald-500',
      PAUSED: 'bg-amber-500/15 text-amber-600',
      PROCESSING: 'bg-primary/15 text-primary',
      COMPLETED: 'bg-emerald-500/15 text-emerald-500',
      FAILED: 'bg-destructive/15 text-destructive',
    };
    return classes[status] ?? 'bg-secondary text-muted-foreground';
  }
}
