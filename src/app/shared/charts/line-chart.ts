import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { LineSeries } from './chart.models';
import { MARGIN, labelIndexes, nearestIndex, pathOf, plotOf, ticksOf, xOf, yOf } from './line-math';

/**
 * Weekly lines. The svg is drawn at the width it is given (so type stays at its real size on a phone), the
 * crosshair snaps to the nearest week from the pointer or the arrow keys and one readout lists every series
 * there. A legend names each series with its total, and a button swaps the plot for the same numbers in a table.
 */
@Component({
  selector: 'app-line-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslocoPipe],
  template: `
    <div class="flex flex-col gap-3">
      <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        @if (series().length > 1) {
          <ul class="flex flex-wrap gap-x-4 gap-y-1 text-xs">
            @for (s of series(); track s.key) {
              <li class="flex items-center gap-1.5">
                <span
                  class="h-0.5 w-4 rounded-full"
                  [style.background]="s.color"
                  aria-hidden="true"
                ></span>
                <span>{{ s.label }}</span>
                <span class="tabular-nums text-muted-foreground">{{ totalOf(s) }}</span>
              </li>
            }
          </ul>
        } @else {
          <span></span>
        }
        <button
          type="button"
          class="rounded-md px-1.5 py-0.5 text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          [attr.aria-pressed]="tableMode()"
          (click)="tableMode.set(!tableMode())"
          data-testid="chart-table-toggle"
        >
          {{ (tableMode() ? 'charts.showChart' : 'charts.showTable') | transloco }}
        </button>
      </div>

      @if (tableMode()) {
        <div class="max-h-72 overflow-auto rounded-lg border border-border">
          <table class="w-full text-left text-sm" data-testid="chart-table">
            <caption class="sr-only">
              {{
                ariaLabel()
              }}
            </caption>
            <thead class="sticky top-0 bg-card text-xs text-muted-foreground">
              <tr>
                <th scope="col" class="px-3 py-2 font-medium">{{ 'charts.week' | transloco }}</th>
                @for (s of series(); track s.key) {
                  <th scope="col" class="px-3 py-2 text-right font-medium">{{ s.label }}</th>
                }
              </tr>
            </thead>
            <tbody>
              @for (label of labels(); track label; let i = $index) {
                <tr class="border-t border-border">
                  <th scope="row" class="px-3 py-1.5 font-normal">{{ weekLabel(label) }}</th>
                  @for (s of series(); track s.key) {
                    <td class="px-3 py-1.5 text-right tabular-nums">{{ s.values[i] }}</td>
                  }
                </tr>
              }
            </tbody>
          </table>
        </div>
      } @else {
        <div #host class="relative w-full min-w-0">
          <svg
            class="block max-w-full touch-pan-y select-none outline-offset-4"
            [attr.width]="width()"
            [attr.height]="height()"
            [attr.viewBox]="'0 0 ' + width() + ' ' + height()"
            role="img"
            tabindex="0"
            [attr.aria-label]="ariaLabel()"
            (pointermove)="onPointer($event)"
            (pointerleave)="active.set(null)"
            (focus)="onFocus()"
            (blur)="active.set(null)"
            (keydown)="onKey($event)"
            data-testid="line-chart"
          >
            @for (tick of ticks(); track tick) {
              <line
                [attr.x1]="margin.left"
                [attr.x2]="width() - margin.right"
                [attr.y1]="y(tick)"
                [attr.y2]="y(tick)"
                stroke="var(--chart-grid)"
                stroke-width="1"
              />
              <text
                [attr.x]="margin.left - 8"
                [attr.y]="y(tick)"
                text-anchor="end"
                dominant-baseline="middle"
                class="fill-muted-foreground text-[11px]"
              >
                {{ tick }}
              </text>
            }
            @for (i of labelAt(); track i) {
              <text
                [attr.x]="x(i)"
                [attr.y]="height() - 8"
                [attr.text-anchor]="anchorOf(i)"
                class="fill-muted-foreground text-[11px]"
              >
                {{ weekLabel(labels()[i]) }}
              </text>
            }
            @if (active() !== null) {
              <line
                [attr.x1]="x(active()!)"
                [attr.x2]="x(active()!)"
                [attr.y1]="margin.top"
                [attr.y2]="height() - margin.bottom"
                stroke="var(--muted-foreground)"
                stroke-opacity="0.5"
                stroke-width="1"
              />
            }
            @for (s of series(); track s.key) {
              <path
                [attr.d]="path(s)"
                fill="none"
                [attr.stroke]="s.color"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
              <circle
                [attr.cx]="x(active() ?? s.values.length - 1)"
                [attr.cy]="y(s.values[active() ?? s.values.length - 1] ?? 0)"
                r="4"
                [attr.fill]="s.color"
                stroke="var(--card)"
                stroke-width="2"
              />
            }
          </svg>

          @if (readout(); as r) {
            <div
              class="pointer-events-none absolute top-0 z-10 min-w-32 rounded-md border border-border bg-popover px-2.5 py-2 text-xs text-popover-foreground shadow-md"
              [style.left.px]="r.left"
              [style.transform]="r.flip ? 'translateX(-100%)' : 'none'"
              data-testid="line-readout"
            >
              <div class="mb-1 text-muted-foreground">{{ r.title }}</div>
              @for (row of r.rows; track row.key) {
                <div class="flex items-center gap-2">
                  <span
                    class="h-0.5 w-3 rounded-full"
                    [style.background]="row.color"
                    aria-hidden="true"
                  ></span>
                  <span class="text-sm font-semibold tabular-nums">{{ row.value }}</span>
                  <span class="text-muted-foreground">{{ row.label }}</span>
                </div>
              }
            </div>
          }
        </div>
      }
    </div>
  `,
})
export class LineChart {
  /** `YYYY-MM-DD` of each week's Monday, oldest first. */
  readonly labels = input.required<readonly string[]>();
  readonly series = input.required<readonly LineSeries[]>();
  readonly ariaLabel = input.required<string>();
  readonly height = input(208);

  private readonly transloco = inject(TranslocoService);
  private readonly lang = toSignal(this.transloco.langChanges$, {
    initialValue: this.transloco.getActiveLang(),
  });
  private readonly host = viewChild<ElementRef<HTMLElement>>('host');

  protected readonly margin = MARGIN;
  protected readonly width = signal(560);
  protected readonly active = signal<number | null>(null);
  protected readonly tableMode = signal(false);

  private readonly plot = computed(() =>
    plotOf(
      this.width(),
      this.height(),
      this.labels().length,
      Math.max(0, ...this.series().flatMap((s) => s.values)),
    ),
  );
  protected readonly ticks = computed(() => ticksOf(this.plot().yMax));
  protected readonly labelAt = computed(() => labelIndexes(this.labels().length, this.width()));

  private readonly formatter = computed(
    () => new Intl.DateTimeFormat(this.lang(), { day: 'numeric', month: 'short', timeZone: 'UTC' }),
  );

  protected readonly readout = computed(() => {
    const index = this.active();
    if (index === null) return null;
    const left = xOf(this.plot(), index);
    return {
      left,
      flip: left > this.width() * 0.6,
      title: this.transloco.translate('charts.weekOf', {
        date: this.weekLabel(this.labels()[index]),
      }),
      rows: this.series().map((s) => ({
        key: s.key,
        label: s.label,
        color: s.color,
        value: s.values[index] ?? 0,
      })),
    };
  });

  constructor() {
    // The plot div is re-created when the table toggle flips, so the observer follows the view child.
    effect((onCleanup) => {
      const el = this.host()?.nativeElement;
      if (!el || typeof ResizeObserver === 'undefined') return;
      const measure = (w: number) => {
        if (w > 0) this.width.set(Math.floor(w));
      };
      measure(el.clientWidth);
      const observer = new ResizeObserver((entries) => measure(entries[0]?.contentRect.width ?? 0));
      observer.observe(el);
      onCleanup(() => observer.disconnect());
    });
  }

  /** The outermost labels hang inward so they are never cut by the edge of the svg. */
  protected anchorOf(index: number): 'start' | 'middle' | 'end' {
    const last = this.labels().length - 1;
    if (last > 0 && index === last) return 'end';
    return 'middle';
  }

  protected x(index: number): number {
    return xOf(this.plot(), index);
  }

  protected y(value: number): number {
    return yOf(this.plot(), value);
  }

  protected path(series: LineSeries): string {
    return pathOf(this.plot(), series.values);
  }

  protected totalOf(series: LineSeries): number {
    return series.values.reduce((sum, v) => sum + v, 0);
  }

  protected weekLabel(iso: string): string {
    return this.formatter().format(new Date(`${iso}T00:00:00Z`));
  }

  protected onPointer(event: PointerEvent): void {
    const rect = (event.currentTarget as SVGElement).getBoundingClientRect();
    this.active.set(nearestIndex(this.plot(), event.clientX - rect.left));
  }

  protected onFocus(): void {
    if (this.active() === null) this.active.set(this.labels().length - 1);
  }

  protected onKey(event: KeyboardEvent): void {
    const last = this.labels().length - 1;
    const current = this.active() ?? last;
    if (event.key === 'ArrowLeft') this.active.set(Math.max(current - 1, 0));
    else if (event.key === 'ArrowRight') this.active.set(Math.min(current + 1, last));
    else if (event.key === 'Home') this.active.set(0);
    else if (event.key === 'End') this.active.set(last);
    else if (event.key === 'Escape') this.active.set(null);
    else return;
    event.preventDefault();
  }
}
