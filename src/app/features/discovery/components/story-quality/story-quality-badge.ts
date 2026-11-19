import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { QualityLevel, clampScore, qualityLevel } from '../../data/story-quality';
import { StoryQualityResponse } from '../../data/story-quality.models';

const POPOVER_WIDTH = 304;
const POPOVER_HEIGHT = 300;
const GAP = 6;
const EDGE = 8;

const CHIP =
  'inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 font-medium tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring';

const TONE: Record<QualityLevel, string> = {
  GOOD: 'bg-verified-soft text-verified ring-1 ring-inset ring-verified-border',
  FAIR: 'bg-pending/10 text-pending ring-1 ring-inset ring-pending/30',
  POOR: 'bg-destructive/10 text-destructive ring-1 ring-inset ring-destructive/30',
};

const BAR: Record<QualityLevel, string> = {
  GOOD: 'bg-verified',
  FAIR: 'bg-pending',
  POOR: 'bg-destructive',
};

let nextId = 0;

/**
 * The quality of a story in a list (US68): its score as a percentage, coloured by level (good, fair or poor),
 * and, on hover or focus, how it fares on each characteristic and what was found. Without a quality (older
 * backends, realtime payloads) it shows a dash. The popover is positioned against the viewport so a table or
 * panel that scrolls never clips it.
 */
@Component({
  selector: 'app-story-quality-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslocoPipe],
  template: `
    @let q = quality();
    @if (q) {
      @let level = levelOf();
      <span
        [class]="chipClass()"
        tabindex="0"
        role="img"
        [attr.aria-label]="ariaLabel()"
        [attr.aria-describedby]="open() ? popoverId : null"
        [attr.data-level]="level"
        data-testid="story-quality-badge"
        (mouseenter)="show($event)"
        (mouseleave)="hide()"
        (focus)="show($event)"
        (blur)="hide()"
        (keydown.escape)="hide()"
      >
        <span aria-hidden="true">{{ score() }}%</span>
        @if (showLevel()) {
          <span aria-hidden="true" class="font-normal opacity-90">
            · {{ 'storyQuality.badge.' + level | transloco }}
          </span>
        }
      </span>
      @if (open()) {
        <div
          [id]="popoverId"
          role="tooltip"
          class="pointer-events-none fixed z-50 rounded-xl border border-border bg-card p-3 text-left text-xs text-card-foreground shadow-lg"
          [style.width.px]="width"
          [style.left.px]="left()"
          [style.top.px]="top()"
          [style.bottom.px]="bottom()"
          data-testid="story-quality-popover"
        >
          <div class="mb-2 flex items-baseline justify-between gap-2">
            <span class="font-semibold">{{ 'storyQuality.hoverTitle' | transloco }}</span>
            <span class="font-semibold tabular-nums" [class]="levelText()">
              {{ score() }}/100 · {{ 'storyQuality.badge.' + level | transloco }}
            </span>
          </div>
          <ul class="space-y-2">
            @for (finding of q.characteristics; track finding.characteristic) {
              <li data-testid="story-quality-popover-row">
                <div class="flex items-center justify-between gap-2">
                  <span class="font-medium">{{
                    'storyQuality.characteristic.' + finding.characteristic | transloco
                  }}</span>
                  <span class="tabular-nums text-muted-foreground">{{ finding.score }}/100</span>
                </div>
                <div class="mt-1 h-1 overflow-hidden rounded-full bg-secondary" aria-hidden="true">
                  <div
                    class="h-full rounded-full"
                    [class]="barClass(finding.score)"
                    [style.width.%]="finding.score"
                  ></div>
                </div>
                @if (!finding.met) {
                  <p class="mt-1 leading-snug text-muted-foreground">{{ finding.observation }}</p>
                }
              </li>
            }
          </ul>
          <p class="mt-2.5 border-t border-border pt-2 text-muted-foreground">
            {{ 'storyQuality.hoverOpen' | transloco }}
          </p>
        </div>
      }
    } @else {
      <span
        class="text-xs text-muted-foreground"
        [attr.title]="'storyQuality.notEvaluated' | transloco"
        data-testid="story-quality-none"
        >—</span
      >
    }
  `,
})
export class StoryQualityBadge {
  readonly quality = input<StoryQualityResponse | null | undefined>(null);
  /** Also writes the level (good, fair, poor) next to the percentage. */
  readonly showLevel = input(false);

  private readonly transloco = inject(TranslocoService);
  protected readonly popoverId = `story-quality-popover-${nextId++}`;
  protected readonly width = POPOVER_WIDTH;
  protected readonly open = signal(false);
  protected readonly left = signal(0);
  protected readonly top = signal<number | null>(null);
  protected readonly bottom = signal<number | null>(null);

  protected readonly score = computed(() => clampScore(this.quality()?.score ?? 0));
  protected readonly levelOf = computed(() => qualityLevel(this.score()));
  protected readonly chipClass = computed(() => `${CHIP} text-xs ${TONE[this.levelOf()]}`);
  protected readonly levelText = computed(
    () =>
      ({ GOOD: 'text-verified', FAIR: 'text-pending', POOR: 'text-destructive' })[this.levelOf()],
  );

  protected ariaLabel(): string {
    return this.transloco.translate('storyQuality.badgeAria', {
      score: this.score(),
      level: this.transloco.translate(`storyQuality.badge.${this.levelOf()}`),
    });
  }

  protected barClass(score: number): string {
    return BAR[qualityLevel(score)];
  }

  protected show(event: Event): void {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const maxLeft = Math.max(EDGE, window.innerWidth - POPOVER_WIDTH - EDGE);
    this.left.set(Math.min(Math.max(EDGE, rect.left), maxLeft));
    if (rect.bottom + GAP + POPOVER_HEIGHT > window.innerHeight && rect.top > POPOVER_HEIGHT / 2) {
      this.top.set(null);
      this.bottom.set(window.innerHeight - rect.top + GAP);
    } else {
      this.bottom.set(null);
      this.top.set(rect.bottom + GAP);
    }
    this.open.set(true);
  }

  protected hide(): void {
    this.open.set(false);
  }
}
