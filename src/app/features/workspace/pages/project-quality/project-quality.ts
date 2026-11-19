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
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { KpiStrip } from '../../components/overview/kpi-strip';
import { OverviewError } from '../../components/overview/overview-error';
import { OverviewSkeleton } from '../../components/overview/overview-skeleton';
import { formatCount } from '../../components/overview/stat-trend';
import { AcceptanceCard } from '../../components/quality/acceptance-card';
import { PostProcessingCard } from '../../components/quality/post-processing-card';
import {
  DEFAULT_PERIOD_DAYS,
  PERIOD_PRESETS,
  Period,
  formatDuration,
  isValidPeriod,
  lastDays,
  percentText,
} from '../../data/quality';
import { QualityMetricsResponse } from '../../data/quality.models';
import { QualityApiService } from '../../data/quality-api.service';
import { StatTile } from '../../../../shared/charts/stat-tile';
import { HlmButton, HlmInput, HlmLabel } from '../../../../shared/ui';

type LoadState = 'loading' | 'ready' | 'error' | 'forbidden';

/**
 * Quality indicators of a project for the pilots: the share of AI stories accepted without major rewriting, the
 * time the review of a meeting takes after it ends, and the clarification meetings, for a period the lead picks
 * (the last 30 days by default). An indicator the server could not compute shows a dash with the reason, never a
 * zero; a period with nothing in it says so.
 */
@Component({
  selector: 'app-project-quality',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    TranslocoPipe,
    HlmButton,
    HlmInput,
    HlmLabel,
    KpiStrip,
    StatTile,
    OverviewSkeleton,
    OverviewError,
    AcceptanceCard,
    PostProcessingCard,
  ],
  template: `
    <div class="flex flex-col gap-6">
      <div>
        <h1 class="text-2xl font-bold tracking-tight">{{ 'quality.title' | transloco }}</h1>
        <p class="mt-1 text-sm text-muted-foreground">{{ 'quality.subtitle' | transloco }}</p>
      </div>

      <section
        class="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4"
        [attr.aria-label]="'quality.period.label' | transloco"
        data-testid="period"
      >
        <div class="flex flex-wrap items-center gap-2">
          @for (days of presets; track days) {
            <button
              hlmBtn
              size="sm"
              type="button"
              [variant]="!custom() && days === presetDays() ? 'default' : 'outline'"
              [attr.aria-pressed]="!custom() && days === presetDays()"
              (click)="pickPreset(days)"
              [attr.data-testid]="'period-' + days"
            >
              {{ 'quality.period.days' | transloco: { n: days } }}
            </button>
          }
          <button
            hlmBtn
            size="sm"
            type="button"
            [variant]="custom() ? 'default' : 'outline'"
            [attr.aria-pressed]="custom()"
            (click)="pickCustom()"
            data-testid="period-custom"
          >
            {{ 'quality.period.custom' | transloco }}
          </button>
          <span class="ml-auto text-xs text-muted-foreground" data-testid="period-range">
            {{ period().from | date: 'mediumDate' : 'UTC' }} –
            {{ period().to | date: 'mediumDate' : 'UTC' }}
          </span>
        </div>

        @if (custom()) {
          <form
            class="flex flex-wrap items-end gap-3"
            (submit)="$event.preventDefault(); applyCustom()"
            data-testid="period-form"
          >
            <div class="flex flex-col gap-1.5">
              <label hlmLabel for="quality-from">{{ 'quality.period.from' | transloco }}</label>
              <input
                hlmInput
                id="quality-from"
                type="date"
                [value]="customFrom()"
                (input)="customFrom.set($any($event.target).value)"
                data-testid="period-from"
              />
            </div>
            <div class="flex flex-col gap-1.5">
              <label hlmLabel for="quality-to">{{ 'quality.period.to' | transloco }}</label>
              <input
                hlmInput
                id="quality-to"
                type="date"
                [value]="customTo()"
                (input)="customTo.set($any($event.target).value)"
                data-testid="period-to"
              />
            </div>
            <button
              hlmBtn
              size="sm"
              type="submit"
              [disabled]="!customValid()"
              data-testid="period-apply"
            >
              {{ 'quality.period.apply' | transloco }}
            </button>
            @if (!customValid() && (customFrom() || customTo())) {
              <p
                class="basis-full text-xs text-destructive"
                role="alert"
                data-testid="period-invalid"
              >
                {{ 'quality.period.invalid' | transloco }}
              </p>
            }
          </form>
        }
      </section>

      @switch (state()) {
        @case ('loading') {
          <app-overview-skeleton />
        }
        @case ('error') {
          <app-overview-error (retry)="reload()">{{
            'quality.loadError' | transloco
          }}</app-overview-error>
        }
        @case ('forbidden') {
          <p class="rounded-2xl border border-border p-5 text-sm text-muted-foreground">
            {{ 'quality.forbidden' | transloco }}
          </p>
        }
        @default {
          @if (metrics(); as m) {
            @if (!m.hasData) {
              <section
                class="flex flex-col items-start gap-2 rounded-2xl border border-dashed border-border p-6"
                data-testid="quality-empty"
              >
                <h2 class="text-base font-semibold">{{ 'quality.empty.title' | transloco }}</h2>
                <p class="max-w-prose text-sm text-muted-foreground">
                  {{
                    'quality.empty.body'
                      | transloco
                        : {
                            from: (m.from | date: 'mediumDate' : 'UTC'),
                            to: (m.to | date: 'mediumDate' : 'UTC'),
                          }
                  }}
                </p>
              </section>
            } @else {
              <app-kpi-strip [label]="'quality.kpiAria' | transloco" data-testid="kpi-strip">
                @for (tile of tiles(); track tile.key) {
                  <app-stat-tile
                    [label]="tile.label"
                    [value]="tile.value"
                    [hint]="tile.hint"
                    [attr.data-testid]="'kpi-' + tile.key"
                  />
                }
              </app-kpi-strip>
              <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <app-quality-acceptance-card [acceptance]="m.acceptance" />
                <app-quality-post-processing-card [postProcessing]="m.postProcessing" />
              </div>
            }
          }
        }
      }
    </div>
  `,
})
export class ProjectQuality {
  private readonly api = inject(QualityApiService);
  private readonly transloco = inject(TranslocoService);
  private readonly lang = toSignal(this.transloco.langChanges$, {
    initialValue: this.transloco.getActiveLang(),
  });

  readonly projectId = input.required<string>();

  protected readonly presets = PERIOD_PRESETS;
  /** The quick period in use; the last 30 days until the lead picks another. */
  protected readonly presetDays = signal<number>(DEFAULT_PERIOD_DAYS);
  protected readonly custom = signal(false);
  protected readonly customFrom = signal('');
  protected readonly customTo = signal('');
  protected readonly period = signal<Period>(lastDays(DEFAULT_PERIOD_DAYS));
  protected readonly customValid = computed(() =>
    isValidPeriod(this.customFrom(), this.customTo()),
  );

  protected readonly state = signal<LoadState>('loading');
  protected readonly metrics = signal<QualityMetricsResponse | null>(null);
  private readonly attempt = signal(0);

  protected readonly tiles = computed(() => {
    const m = this.metrics();
    this.lang();
    if (!m) return [];
    const t = (key: string, params?: Record<string, unknown>) =>
      this.transloco.translate(key, params);
    const fmt = (n: number) => formatCount(n, this.transloco.getActiveLang());
    const { acceptance, postProcessing, clarification } = m;
    return [
      {
        key: 'acceptance',
        label: t('quality.kpi.acceptance'),
        value: acceptance.rate === null ? '—' : percentText(acceptance.rate),
        hint:
          acceptance.rate === null
            ? t('quality.kpi.acceptanceNone')
            : t('quality.kpi.acceptanceHint', {
                kept: fmt(acceptance.acceptedAsGenerated),
                decided: fmt(acceptance.decided),
              }),
      },
      {
        key: 'postProcessing',
        label: t('quality.kpi.postProcessing'),
        value:
          postProcessing.averageSeconds === null
            ? '—'
            : formatDuration(postProcessing.averageSeconds),
        hint:
          postProcessing.averageSeconds === null || postProcessing.medianSeconds === null
            ? t('quality.kpi.postProcessingNone')
            : t('quality.kpi.postProcessingHint', {
                median: formatDuration(postProcessing.medianSeconds),
                n: fmt(postProcessing.measured),
              }),
      },
      {
        key: 'clarification',
        label: t('quality.kpi.clarification'),
        value: fmt(clarification.meetings),
        hint:
          clarification.sessions === 0
            ? t('quality.kpi.clarificationNone')
            : t('quality.kpi.clarificationHint', {
                n: fmt(clarification.meetings),
                total: fmt(clarification.sessions),
              }),
      },
    ];
  });

  constructor() {
    effect((onCleanup) => {
      const projectId = this.projectId();
      const { from, to } = this.period();
      this.attempt();
      if (!projectId) return;
      this.state.set('loading');
      const sub = this.api.getQualityMetrics(projectId, from, to).subscribe({
        next: (metrics) => {
          this.metrics.set(metrics);
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

  protected pickPreset(days: number): void {
    this.custom.set(false);
    this.presetDays.set(days);
    this.period.set(lastDays(days));
  }

  protected pickCustom(): void {
    if (this.custom()) return;
    const { from, to } = this.period();
    this.customFrom.set(from);
    this.customTo.set(to);
    this.custom.set(true);
  }

  protected applyCustom(): void {
    if (!this.customValid()) return;
    this.period.set({ from: this.customFrom(), to: this.customTo() });
  }

  protected reload(): void {
    this.attempt.update((n) => n + 1);
  }
}
