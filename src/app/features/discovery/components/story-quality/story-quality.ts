import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { provideIcons } from '@ng-icons/core';
import { lucideCircleAlert, lucideCircleCheckBig, lucideRefreshCw } from '@ng-icons/lucide';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { DiscoveryApiService } from '../../data/discovery-api.service';
import { problemCode } from '../../data/duplicate-error';
import {
  QualityLevel,
  clampScore,
  qualityLevel,
  ringOffset,
  unmetFindings,
} from '../../data/story-quality';
import { StoryQualityResponse } from '../../data/story-quality.models';
import { HasPermission } from '../../../../shared/directives/has-permission';
import { ToastService } from '../../../../shared/toast/toast.service';
import { messageForError } from '../../../../core/errors/error-message';
import { HlmButton, HlmIcon, HlmSkeleton, HlmSpinner } from '../../../../shared/ui';

/** Radius of the score ring, in the 100x100 viewBox of its SVG. */
const RING_RADIUS = 42;

/**
 * The quality of a story (US68): an overall score from 0 to 100, each evaluated characteristic
 * (ambiguity, atomicity, verifiability, completeness) with what was observed and, when it falls short, how
 * to fix it. Opening a story that was never evaluated evaluates it; members with STORY_WRITE can
 * re-evaluate on demand. The backend refreshes an existing assessment when the story or its criteria are
 * edited, so the page only asks it again when `refreshKey` changes.
 */
@Component({
  selector: 'app-story-quality',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, HasPermission, TranslocoPipe, HlmButton, HlmIcon, HlmSkeleton, HlmSpinner],
  viewProviders: [provideIcons({ lucideCircleAlert, lucideCircleCheckBig, lucideRefreshCw })],
  template: `
    <section
      class="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5"
      data-testid="story-quality"
    >
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div class="min-w-0">
          <h2 class="text-base font-semibold">{{ 'storyQuality.title' | transloco }}</h2>
          <p class="mt-0.5 text-xs text-muted-foreground">{{ 'storyQuality.hint' | transloco }}</p>
        </div>
        <button
          *appHasPermission="'STORY_WRITE'"
          hlmBtn
          size="sm"
          variant="outline"
          type="button"
          (click)="evaluate()"
          [disabled]="evaluating() || state() === 'loading'"
          data-testid="story-quality-reevaluate"
        >
          @if (evaluating()) {
            <hlm-spinner class="h-4 w-4" />
          } @else {
            <hlm-icon name="lucideRefreshCw" size="14px" />
          }
          {{ 'storyQuality.reevaluate' | transloco }}
        </button>
      </div>

      @if (state() === 'loading') {
        <div class="flex items-center gap-4" data-testid="story-quality-loading">
          <hlm-skeleton class="h-24 w-24 shrink-0 rounded-full" />
          <div class="flex flex-1 flex-col gap-2">
            <hlm-skeleton class="h-4 w-2/3 rounded-md" />
            <hlm-skeleton class="h-4 w-1/2 rounded-md" />
          </div>
        </div>
      } @else if (state() === 'error') {
        <div class="flex flex-wrap items-center gap-3" role="alert">
          <p class="text-sm text-destructive" data-testid="story-quality-error">
            {{ 'storyQuality.loadError' | transloco }}
          </p>
          <button hlmBtn size="sm" variant="outline" type="button" (click)="reload()">
            {{ 'discovery.retry' | transloco }}
          </button>
        </div>
      } @else if (quality(); as q) {
        @let level = levelOf(q.score);
        @let pending = unmet(q);
        <div class="flex flex-col gap-5">
          <div class="flex flex-wrap items-center gap-5">
            <div
              class="relative h-24 w-24 shrink-0"
              role="img"
              [attr.aria-label]="'storyQuality.scoreLabel' | transloco: { score: q.score }"
              data-testid="story-quality-score"
              [attr.data-level]="level"
            >
              <svg viewBox="0 0 100 100" class="h-full w-full -rotate-90" aria-hidden="true">
                <circle
                  cx="50"
                  cy="50"
                  [attr.r]="radius"
                  fill="none"
                  stroke-width="9"
                  class="stroke-muted"
                />
                <circle
                  cx="50"
                  cy="50"
                  [attr.r]="radius"
                  fill="none"
                  stroke-width="9"
                  stroke-linecap="round"
                  [attr.stroke-dasharray]="circumference"
                  [attr.stroke-dashoffset]="offset(q.score)"
                  [class]="ringClass(level)"
                />
              </svg>
              <div class="absolute inset-0 grid place-items-center text-center">
                <div>
                  <span
                    class="block text-2xl font-bold leading-none tabular-nums"
                    data-testid="story-quality-value"
                    >{{ score(q.score) }}</span
                  >
                  <span class="block text-[11px] text-muted-foreground">/ 100</span>
                </div>
              </div>
            </div>
            <div class="min-w-0 flex-1">
              <p class="text-base font-semibold" [class]="levelTextClass(level)">
                {{ 'storyQuality.level.' + level | transloco }}
              </p>
              <p class="mt-0.5 text-sm text-muted-foreground" data-testid="story-quality-summary">
                @if (pending.length === 0) {
                  {{ 'storyQuality.summary.allMet' | transloco }}
                } @else {
                  {{
                    'storyQuality.summary.unmet'
                      | transloco: { count: pending.length, total: q.characteristics.length }
                  }}
                }
              </p>
              <p class="mt-1 text-xs text-muted-foreground">
                {{
                  'storyQuality.evaluatedAt' | transloco: { when: (q.evaluatedAt | date: 'short') }
                }}
              </p>
            </div>
          </div>

          <ul class="grid gap-3 lg:grid-cols-2">
            @for (finding of q.characteristics; track finding.characteristic) {
              <li
                class="flex flex-col gap-2 rounded-xl border px-3.5 py-3"
                [class]="finding.met ? 'border-border' : 'border-pending-border bg-pending-soft'"
                [attr.data-characteristic]="finding.characteristic"
                [attr.data-met]="finding.met"
                data-testid="story-quality-finding"
              >
                <div class="flex items-center gap-2">
                  <hlm-icon
                    [name]="finding.met ? 'lucideCircleCheckBig' : 'lucideCircleAlert'"
                    size="16px"
                    class="shrink-0"
                    [class.text-verified]="finding.met"
                    [class.text-pending]="!finding.met"
                    aria-hidden="true"
                  />
                  <h3 class="text-sm font-semibold">
                    {{ 'storyQuality.characteristic.' + finding.characteristic | transloco }}
                  </h3>
                  <span
                    class="ml-auto rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums"
                    [class]="
                      finding.met ? 'bg-verified-soft text-verified' : 'bg-background text-pending'
                    "
                  >
                    {{ finding.score }}/100
                  </span>
                </div>
                <div
                  class="h-1.5 overflow-hidden rounded-full bg-muted"
                  role="presentation"
                  aria-hidden="true"
                >
                  <div
                    class="h-full rounded-full"
                    [class]="barClass(finding.score)"
                    [style.width.%]="score(finding.score)"
                  ></div>
                </div>
                <p class="text-sm text-foreground" data-testid="story-quality-observation">
                  {{ finding.observation }}
                </p>
                @if (finding.suggestion) {
                  <p class="text-sm text-muted-foreground" data-testid="story-quality-suggestion">
                    <span class="font-medium text-foreground"
                      >{{ 'storyQuality.fix' | transloco }}:</span
                    >
                    {{ finding.suggestion }}
                  </p>
                }
              </li>
            }
          </ul>
        </div>
      } @else {
        <div class="flex flex-wrap items-center gap-3" data-testid="story-quality-empty">
          <p class="text-sm text-muted-foreground">{{ 'storyQuality.empty' | transloco }}</p>
        </div>
      }
    </section>
  `,
})
export class StoryQuality {
  private readonly api = inject(DiscoveryApiService);
  private readonly transloco = inject(TranslocoService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  readonly projectId = input.required<string>();
  readonly storyId = input.required<string>();
  /** Changes whenever the story or its criteria were saved, so the assessment is read again. */
  readonly refreshKey = input(0);

  protected readonly state = signal<'loading' | 'ready' | 'empty' | 'error'>('loading');
  protected readonly quality = signal<StoryQualityResponse | null>(null);
  /** True while an evaluation requested by the analyst (or the first open) is running. */
  protected readonly evaluating = signal(false);

  protected readonly radius = RING_RADIUS;
  protected readonly circumference = 2 * Math.PI * RING_RADIUS;

  /** Only the latest request may write the state, so a slow answer never overwrites a newer one. */
  private requestId = 0;
  private destroyed = false;

  constructor() {
    this.destroyRef.onDestroy(() => (this.destroyed = true));
    // Reads the stored assessment on open and again whenever the parent reports a save.
    effect(() => {
      this.projectId();
      this.storyId();
      this.refreshKey();
      untracked(() => this.load());
    });
  }

  protected reload(): void {
    this.load();
  }

  /** Re-evaluates on demand and replaces the shown assessment. */
  protected evaluate(): void {
    if (this.evaluating()) return;
    this.evaluating.set(true);
    const request = ++this.requestId;
    this.api.evaluateStoryQuality(this.projectId(), this.storyId()).subscribe({
      next: (result) => {
        if (this.stale(request)) return;
        this.evaluating.set(false);
        this.quality.set(result);
        this.state.set('ready');
        this.toast.success(this.transloco.translate('storyQuality.reevaluated'));
      },
      error: (err: unknown) => {
        if (this.stale(request)) return;
        this.evaluating.set(false);
        this.toast.error(messageForError(err, this.transloco));
      },
    });
  }

  /** Reads the stored assessment; a story that was never evaluated is evaluated for the first time. */
  private load(): void {
    const request = ++this.requestId;
    this.evaluating.set(false);
    if (this.quality() === null) this.state.set('loading');
    this.api.getStoryQuality(this.projectId(), this.storyId()).subscribe({
      next: (result) => {
        if (this.stale(request)) return;
        this.quality.set(result);
        this.state.set('ready');
      },
      error: (err: unknown) => {
        if (this.stale(request)) return;
        if (
          err instanceof HttpErrorResponse &&
          problemCode(err) === 'STORY_QUALITY_NOT_EVALUATED'
        ) {
          this.firstEvaluation();
        } else {
          this.state.set('error');
        }
      },
    });
  }

  /**
   * The story has no assessment yet: evaluates it so the analyst sees the score on opening. A member
   * who cannot evaluate (no STORY_WRITE) gets the 403 and an empty state instead.
   */
  private firstEvaluation(): void {
    this.evaluating.set(true);
    const request = ++this.requestId;
    this.api.evaluateStoryQuality(this.projectId(), this.storyId()).subscribe({
      next: (result) => {
        if (this.stale(request)) return;
        this.evaluating.set(false);
        this.quality.set(result);
        this.state.set('ready');
      },
      error: (err: unknown) => {
        if (this.stale(request)) return;
        this.evaluating.set(false);
        this.state.set(err instanceof HttpErrorResponse && err.status === 403 ? 'empty' : 'error');
      },
    });
  }

  private stale(request: number): boolean {
    return this.destroyed || request !== this.requestId;
  }

  protected score(value: number): number {
    return clampScore(value);
  }

  protected levelOf(value: number): QualityLevel {
    return qualityLevel(value);
  }

  protected unmet(q: StoryQualityResponse) {
    return unmetFindings(q);
  }

  protected offset(value: number): number {
    return ringOffset(value, RING_RADIUS);
  }

  protected ringClass(level: QualityLevel): string {
    return { GOOD: 'stroke-verified', FAIR: 'stroke-pending', POOR: 'stroke-destructive' }[level];
  }

  protected levelTextClass(level: QualityLevel): string {
    return { GOOD: 'text-verified', FAIR: 'text-pending', POOR: 'text-destructive' }[level];
  }

  protected barClass(value: number): string {
    return { GOOD: 'bg-verified', FAIR: 'bg-pending', POOR: 'bg-destructive' }[qualityLevel(value)];
  }
}
