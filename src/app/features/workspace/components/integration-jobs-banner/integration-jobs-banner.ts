import { ChangeDetectionStrategy, Component, effect, inject, input } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { IntegrationJobsStore } from '../../data/integration-jobs.store';
import {
  IntegrationJobResponse,
  jobLabelKey,
  jobProgressPercent,
} from '../../data/integrations.models';
import { ToastService } from '../../../../shared/toast/toast.service';
import { HlmSpinner } from '../../../../shared/ui';

/**
 * The user-facing outcome of a FAILED job. The backend's `message` may be a
 * machine-readable error code (translated via the shared `errors.<code>` table —
 * the same probe {@link messageForError} uses), an already-human sentence (shown
 * verbatim), or null (generic fallback). Pure and exported so it is unit-tested.
 */
export function jobFailureMessage(
  job: Pick<IntegrationJobResponse, 'message'>,
  transloco: TranslocoService,
): string {
  const message = job.message?.trim();
  if (message) {
    const byCode = transloco.translate(`errors.${message}`);
    if (byCode !== `errors.${message}`) return byCode;
    return message;
  }
  return transloco.translate('integrations.jobs.failed');
}

/**
 * Slim, non-blocking progress banner shown under the top bar on EVERY page while a
 * background Jira job (import / push-all) runs for the current project. It is the
 * single driver of the {@link IntegrationJobsStore}'s project context (recovery +
 * realtime subscription follow the URL), and it owns the terminal-state toasts —
 * success with the succeeded/failed summary, error via the job's `message` — so
 * they fire no matter which page the user is on. The banner dismisses itself when
 * no job is left running.
 */
@Component({
  selector: 'app-integration-jobs-banner',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslocoPipe, HlmSpinner],
  template: `
    @if (job(); as job) {
      <div
        role="status"
        data-testid="integration-jobs-banner"
        class="relative shrink-0 border-b border-border bg-secondary/30 px-4 md:px-6"
      >
        <div class="mx-auto flex h-9 w-full max-w-5xl items-center gap-2.5 text-xs">
          <hlm-spinner class="h-3.5 w-3.5 shrink-0" />
          <span class="truncate font-medium">{{ labelKey(job.jobType) | transloco }}</span>
          @if (job.total > 0) {
            <span
              class="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground"
              data-testid="integration-jobs-progress"
              >{{ job.processed }}/{{ job.total }}</span
            >
          }
        </div>
        <!-- Thin progress bar hugging the banner's bottom edge. -->
        <div
          class="absolute inset-x-0 bottom-0 h-0.5 overflow-hidden bg-border/60"
          aria-hidden="true"
        >
          @if (percent(job) !== null) {
            <div
              class="h-full rounded-r-full bg-primary transition-[width] duration-500 ease-out"
              [style.width.%]="percent(job)"
            ></div>
          } @else {
            <div class="job-indeterminate h-full w-1/3 rounded-full bg-primary"></div>
          }
        </div>
      </div>
    }
  `,
  styles: [
    `
      /* Indeterminate sweep while the backend hasn't counted the work (total = 0). */
      .job-indeterminate {
        animation: job-sweep 1.4s ease-in-out infinite;
      }
      @keyframes job-sweep {
        from {
          transform: translateX(-100%);
        }
        to {
          transform: translateX(400%);
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .job-indeterminate {
          animation: none;
          width: 100%;
          opacity: 0.5;
        }
      }
    `,
  ],
})
export class IntegrationJobsBanner {
  private readonly store = inject(IntegrationJobsStore);
  private readonly toast = inject(ToastService);
  private readonly transloco = inject(TranslocoService);

  /** The project whose jobs to surface, or null outside a project context. */
  readonly projectId = input<string | null>(null);

  protected readonly job = this.store.current;
  protected readonly labelKey = jobLabelKey;
  protected readonly percent = jobProgressPercent;

  constructor() {
    // The banner is mounted once in the shell, so it can drive the store's project
    // context from the URL-derived input: recovery + topic (re)subscription happen
    // here, on navigation, without every page having to care.
    effect(() => this.store.setProject(this.projectId()));
    this.store.completed$.pipe(takeUntilDestroyed()).subscribe((job) => this.notify(job));
  }

  private notify(job: IntegrationJobResponse): void {
    if (job.status === 'COMPLETED') {
      const key =
        job.jobType === 'IMPORT'
          ? 'integrations.jobs.completedImport'
          : 'integrations.jobs.completedPush';
      this.toast.success(
        this.transloco.translate(key, { succeeded: job.succeeded, failed: job.failed }),
      );
      return;
    }
    this.toast.error(jobFailureMessage(job, this.transloco));
  }
}
