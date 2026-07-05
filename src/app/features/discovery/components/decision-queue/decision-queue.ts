import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { provideIcons } from '@ng-icons/core';
import {
  lucideChevronLeft,
  lucideChevronRight,
  lucideMinus,
  lucideSparkles,
  lucideX,
} from '@ng-icons/lucide';
import {
  AcceptSuggestionRequest,
  DisplayStory,
  SuggestionResponse,
} from '../../data/discovery.models';
import { DiscoveryChatStore } from '../../data/discovery-chat.store';
import { stackLayers } from '../../data/feed';
import { SuggestionCard } from '../suggestion-card/suggestion-card';
import { HlmIcon } from '../../../../shared/ui';

/** Above this many pending cards the queue collapses into a compact badge. */
const COLLAPSE_THRESHOLD = 3;

/** Per-depth down/right offset (px) of each decorative deck edge behind the card. */
const STACK_OFFSET_PX = 6;
/** Per-depth scale reduction of each deck edge (deeper edges sit slightly smaller). */
const STACK_SCALE_STEP = 0.025;
/** Per-depth opacity reduction of each deck edge (deeper edges fade back). */
const STACK_FADE_STEP = 0.22;

/**
 * The decision queue: pending AI suggestions as floating, non-modal cards
 * anchored top-center over the feed. One card at a time with prev/next arrows
 * and an "n of m" counter; when more than three are pending it collapses to a
 * compact badge that expands on click. While a decision is in flight the card
 * stays visible with a spinner and disabled actions, and leaves only once the
 * store confirms the resolution.
 */
@Component({
  selector: 'app-decision-queue',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SuggestionCard, HlmIcon, TranslocoPipe],
  viewProviders: [
    provideIcons({ lucideChevronLeft, lucideChevronRight, lucideMinus, lucideSparkles, lucideX }),
  ],
  template: `
    @if (store.queue().length > 0) {
      <div
        class="pointer-events-none fixed left-1/2 top-16 z-30 w-[min(44rem,calc(100vw-2rem))] -translate-x-1/2"
        data-testid="decision-queue"
      >
        @if (collapsed()) {
          <div class="flex justify-center">
            <button
              type="button"
              (click)="collapsed.set(false)"
              class="queue-badge pointer-events-auto inline-flex items-center gap-2 rounded-full border border-primary bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-xl shadow-primary/25 transition-transform hover:scale-[1.03]"
              data-testid="queue-badge"
            >
              <hlm-icon name="lucideSparkles" size="15px" />
              <span
                class="grid h-5 min-w-5 place-items-center rounded-full bg-primary-foreground px-1.5 text-[11px] font-bold leading-none text-primary"
                data-testid="queue-badge-count"
                >{{ store.queue().length }}</span
              >
              {{ 'discovery.queue.pendingBadgeLabel' | transloco }}
            </button>
          </div>
        } @else {
          <div class="queue-card pointer-events-auto relative">
            <!-- Top bar: just a clear minimize control (the counter now lives in
                 the folded-corner tab on the card itself). -->
            <div class="mb-1.5 flex items-center justify-end px-1">
              <button
                type="button"
                (click)="collapsed.set(true)"
                class="inline-flex h-9 items-center gap-1.5 rounded-full border border-border bg-card px-3 text-xs font-medium text-muted-foreground shadow-sm transition-colors hover:bg-accent hover:text-foreground"
                [attr.aria-label]="'discovery.queue.minimize' | transloco"
                [title]="'discovery.queue.minimize' | transloco"
                data-testid="queue-collapse"
              >
                <hlm-icon name="lucideMinus" size="16px" />
                {{ 'discovery.queue.minimize' | transloco }}
              </button>
            </div>

            <!-- Big, RED navigation arrows anchored at the vertical center sides. -->
            @if (store.queue().length > 1) {
              <button
                type="button"
                (click)="prev()"
                [disabled]="safeIndex() === 0"
                class="queue-nav absolute -left-5 top-1/2 z-20 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full border border-primary bg-primary text-primary-foreground shadow-lg shadow-primary/30 transition-transform hover:scale-110 disabled:pointer-events-none disabled:opacity-30"
                [attr.aria-label]="'discovery.queue.prev' | transloco"
                data-testid="queue-prev"
              >
                <hlm-icon name="lucideChevronLeft" size="24px" />
              </button>
              <button
                type="button"
                (click)="next()"
                [disabled]="safeIndex() >= store.queue().length - 1"
                class="queue-nav absolute -right-5 top-1/2 z-20 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full border border-primary bg-primary text-primary-foreground shadow-lg shadow-primary/30 transition-transform hover:scale-110 disabled:pointer-events-none disabled:opacity-30"
                [attr.aria-label]="'discovery.queue.next' | transloco"
                data-testid="queue-next"
              >
                <hlm-icon name="lucideChevronRight" size="24px" />
              </button>
            }

            <!-- The stacked "deck": decorative card edges behind the active card,
                 one per remaining pending suggestion (capped), conveying depth.
                 Purely visual — aria-hidden, no pointer events. -->
            <div class="deck relative">
              @for (layer of stackLayers(); track layer) {
                <div
                  aria-hidden="true"
                  class="deck-layer absolute inset-x-0 top-0 h-full rounded-xl border border-border bg-card shadow-md"
                  [style.transform]="layerTransform(layer)"
                  [style.opacity]="layerOpacity(layer)"
                  [style.zIndex]="layer"
                  data-testid="queue-stack-layer"
                ></div>
              }

              <!-- Keyed by id so navigating the carousel remounts the card, replaying
                   the subtle entrance animation for each new suggestion shown. -->
              @for (suggestion of currentAsList(); track suggestion.id) {
                <div class="card-swap relative z-10">
                  <!-- Folded-corner tab: the "n de m" counter, clearly detached
                       from the card body in the top-left corner. -->
                  <span
                    class="queue-tab absolute -left-1.5 -top-2.5 z-20 inline-flex items-center rounded-md rounded-bl-sm bg-primary px-2.5 py-1 text-[11px] font-bold leading-none text-primary-foreground shadow-md shadow-primary/30"
                    data-testid="queue-counter"
                  >
                    {{
                      'discovery.queue.counter'
                        | transloco: { n: safeIndex() + 1, m: store.queue().length }
                    }}
                  </span>
                  <app-suggestion-card
                    [suggestion]="suggestion"
                    [targetStory]="targetStory(suggestion)"
                    [canDecide]="canDecide()"
                    [busy]="store.deciding().includes(suggestion.id)"
                    (accept)="decideAccept.emit({ suggestion, body: $event })"
                    (dismiss)="decideDismiss.emit(suggestion)"
                    (openTarget)="openTarget.emit($event)"
                  />
                </div>
              }
            </div>
          </div>
        }
      </div>

      <style>
        /* Folded-corner "dog-ear" behind the counter tab, for the tucked look. */
        .queue-tab::before {
          content: '';
          position: absolute;
          left: 0;
          top: 100%;
          border-width: 0 5px 5px 0;
          border-style: solid;
          border-color: transparent
            color-mix(in srgb, var(--primary) 55%, black) transparent transparent;
        }
        @media (prefers-reduced-motion: reduce) {
          .queue-nav {
            transition: none;
          }
          .queue-nav:hover {
            transform: translateY(-50%);
          }
          /* The deck is a static offset stack — nothing to animate. */
          .card-swap {
            animation: none;
          }
        }
        @media (prefers-reduced-motion: no-preference) {
          .queue-card {
            animation: queue-in 160ms ease-out;
          }
          .queue-badge {
            animation: queue-badge-pulse 1.8s ease-in-out infinite;
          }
          .card-swap {
            animation: card-swap-in 140ms ease-out;
          }
        }
        @keyframes card-swap-in {
          from {
            opacity: 0.35;
            transform: scale(0.985);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
        @keyframes queue-in {
          from {
            opacity: 0;
            transform: translateY(-8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes queue-badge-pulse {
          0%,
          100% {
            box-shadow: 0 10px 25px -5px var(--tw-shadow-color, rgba(0, 0, 0, 0.25));
          }
          50% {
            box-shadow:
              0 10px 25px -5px var(--tw-shadow-color, rgba(0, 0, 0, 0.25)),
              0 0 0 6px color-mix(in srgb, var(--primary) 22%, transparent);
          }
        }
      </style>
    }
  `,
})
export class DecisionQueue {
  protected readonly store = inject(DiscoveryChatStore);

  /** False renders read-only cards (viewer without decide rights). */
  readonly canDecide = input(true);
  readonly decideAccept = output<{
    suggestion: SuggestionResponse;
    body: AcceptSuggestionRequest;
  }>();
  readonly decideDismiss = output<SuggestionResponse>();
  readonly openTarget = output<string>();

  protected readonly collapsed = signal(false);

  protected readonly safeIndex = computed(() => {
    const length = this.store.queue().length;
    if (length === 0) return 0;
    return Math.min(this.store.queueIndex(), length - 1);
  });

  /** The current suggestion as a 0-or-1 element list, so a keyed @for can remount it on change. */
  protected readonly currentAsList = computed(() => {
    const current = this.store.currentSuggestion();
    return current ? [current] : [];
  });

  /**
   * The decorative deck edges to render behind the active card, as 1-based depth
   * indices `[1, 2, …]` (deepest last). Derived from the queue length by the pure
   * {@link stackLayers} helper: one edge per remaining pending card, capped, and
   * empty when a single suggestion (or none) remains.
   */
  protected readonly stackLayers = computed(() =>
    Array.from({ length: stackLayers(this.store.queue().length) }, (_, i) => i + 1),
  );

  /** Progressive down/right offset + slight scale-down for a deck edge at `depth`. */
  protected layerTransform(depth: number): string {
    const shift = depth * STACK_OFFSET_PX;
    const scale = 1 - depth * STACK_SCALE_STEP;
    return `translate(${shift}px, ${shift}px) scale(${scale})`;
  }

  /** Deeper edges fade out, so the stack reads as receding behind the card. */
  protected layerOpacity(depth: number): number {
    return Math.max(0, 1 - depth * STACK_FADE_STEP);
  }

  constructor() {
    // Auto-collapse when the queue grows beyond the threshold (but never
    // re-expand on its own — that is the user's call).
    let previousLength = 0;
    effect(() => {
      const length = this.store.queue().length;
      if (length > COLLAPSE_THRESHOLD && previousLength <= COLLAPSE_THRESHOLD) {
        this.collapsed.set(true);
      }
      if (length === 0) this.collapsed.set(false);
      previousLength = length;
    });
  }

  protected prev(): void {
    this.store.setQueueIndex(this.safeIndex() - 1);
  }

  protected next(): void {
    this.store.setQueueIndex(this.safeIndex() + 1);
  }

  protected targetStory(suggestion: SuggestionResponse): DisplayStory | undefined {
    return suggestion.targetStoryId ? this.store.findStory(suggestion.targetStoryId) : undefined;
  }
}
