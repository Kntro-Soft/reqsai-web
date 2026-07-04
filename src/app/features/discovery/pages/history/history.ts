import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { provideIcons } from '@ng-icons/core';
import { lucideArrowLeft, lucideTrash2 } from '@ng-icons/lucide';
import { AuthStore } from '../../../../core/auth/auth.store';
import { WorkspaceStore } from '../../../workspace/data/workspace.store';
import { ToastService } from '../../../../shared/toast/toast.service';
import { DiscoveryApiService } from '../../data/discovery-api.service';
import { DiscoverySessionResponse } from '../../data/discovery.models';
import { formatElapsed } from '../../components/session-bar/session-bar';
import { Modal } from '../../../../shared/components/modal/modal';
import { HlmButton, HlmIcon, HlmSpinner } from '../../../../shared/ui';

/**
 * Paginated session history: date, duration, status and — when the parallel
 * backend branch exposes them — per-session stats columns. A row opens that
 * session in the chat feed. Delete is behind a confirm modal and calls
 * DELETE session when supported (hidden on 404/405). No reset action anywhere.
 */
@Component({
  selector: 'app-discovery-history',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    DatePipe,
    TranslocoPipe,
    Modal,
    HlmButton,
    HlmIcon,
    HlmSpinner,
  ],
  viewProviders: [provideIcons({ lucideArrowLeft, lucideTrash2 })],
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
          <h1 class="text-2xl font-bold tracking-tight">{{ 'discovery.history.title' | transloco }}</h1>
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
                    <th class="px-4 py-2.5"></th>
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
                        <td class="px-4 py-3 tabular-nums">{{ session.storiesGeneratedCount ?? '—' }}</td>
                        <td class="px-4 py-3 tabular-nums">{{ session.storiesAcceptedCount ?? '—' }}</td>
                        <td class="px-4 py-3 tabular-nums">{{ session.pendingSuggestionsCount ?? '—' }}</td>
                        <td class="px-4 py-3 tabular-nums">{{ session.questionsCount ?? '—' }}</td>
                      }
                      <td class="px-4 py-3 text-right">
                        @if (canDelete()) {
                          <button
                            type="button"
                            (click)="askDelete(session, $event)"
                            class="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                            [attr.aria-label]="'discovery.history.delete' | transloco"
                            data-testid="history-delete"
                          >
                            <hlm-icon name="lucideTrash2" size="15px" />
                          </button>
                        }
                      </td>
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

    <app-modal [(open)]="deleteOpen">
      <span modalTitle>{{ 'discovery.history.deleteTitle' | transloco }}</span>
      <p>
        {{ 'discovery.history.deleteBody' | transloco }}
      </p>
      <div modalFooter>
        <button hlmBtn variant="outline" size="sm" type="button" (click)="deleteOpen.set(false)">
          {{ 'common.cancel' | transloco }}
        </button>
        <button
          hlmBtn
          variant="destructive"
          size="sm"
          type="button"
          [disabled]="deleting()"
          (click)="confirmDelete()"
          data-testid="history-delete-confirm"
        >
          @if (deleting()) {
            <hlm-spinner class="mr-1.5 h-4 w-4" />
          }
          {{ 'discovery.history.delete' | transloco }}
        </button>
      </div>
    </app-modal>
  `,
})
export class DiscoveryHistory implements OnInit {
  private readonly api = inject(DiscoveryApiService);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthStore);
  private readonly workspace = inject(WorkspaceStore);
  private readonly toast = inject(ToastService);
  private readonly transloco = inject(TranslocoService);

  readonly projectId = input.required<string>();

  protected readonly sessions = signal<DiscoverySessionResponse[]>([]);
  protected readonly state = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly loadingMore = signal(false);
  protected readonly hasNext = signal(false);
  private nextPage = 0;

  /** Delete is hidden once the endpoint answers 404/405 (not deployed / not allowed). */
  protected readonly deleteSupported = signal(true);

  protected readonly deleteOpen = signal(false);
  protected readonly deleting = signal(false);
  private readonly deleteTarget = signal<DiscoverySessionResponse | null>(null);

  /** Owner-only management gate (mirrors the workspace pages). */
  protected readonly canManage = computed(() => {
    const user = this.auth.user();
    if (!user) return false;
    const org = this.workspace.organizations().find((o) => o.id === this.auth.organizationId());
    return org?.ownerId === user.id;
  });
  protected readonly canDelete = computed(() => this.canManage() && this.deleteSupported());

  /** Show stats columns only when at least one session actually carries them. */
  protected readonly showStats = computed(() =>
    this.sessions().some((s) => s.storiesGeneratedCount != null),
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
        this.hasNext.set(
          result.page?.hasNext ?? result.page.number + 1 < result.page.totalPages,
        );
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

  protected askDelete(session: DiscoverySessionResponse, event: Event): void {
    event.stopPropagation();
    this.deleteTarget.set(session);
    this.deleteOpen.set(true);
  }

  protected confirmDelete(): void {
    const target = this.deleteTarget();
    if (!target || this.deleting()) return;
    this.deleting.set(true);
    this.api.deleteSession(this.projectId(), target.id).subscribe({
      next: () => {
        this.sessions.update((list) => list.filter((s) => s.id !== target.id));
        this.deleting.set(false);
        this.deleteOpen.set(false);
        this.toast.success(this.transloco.translate('discovery.history.deleted'));
      },
      error: (err: HttpErrorResponse) => {
        this.deleting.set(false);
        this.deleteOpen.set(false);
        if (err.status === 404 || err.status === 405 || err.status === 501) {
          // Endpoint not available in this deployment — hide the action from now on.
          this.deleteSupported.set(false);
          this.toast.info(this.transloco.translate('discovery.history.deleteUnsupported'));
          return;
        }
        this.toast.error(this.transloco.translate('discovery.history.deleteError'));
      },
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
