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
import { lucideChevronLeft, lucideChevronRight, lucideSparkles, lucideX } from '@ng-icons/lucide';
import {
  AcceptSuggestionRequest,
  DisplayStory,
  SuggestionResponse,
} from '../../data/discovery.models';
import { DiscoveryChatStore } from '../../data/discovery-chat.store';
import { SuggestionCard } from '../suggestion-card/suggestion-card';
import { HlmIcon } from '../../../../shared/ui';

/** Above this many pending cards the queue collapses into a compact badge. */
const COLLAPSE_THRESHOLD = 3;

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
  viewProviders: [provideIcons({ lucideChevronLeft, lucideChevronRight, lucideSparkles, lucideX })],
  template: `
    @if (store.queue().length > 0) {
      <div
        class="pointer-events-none fixed left-1/2 top-20 z-30 w-[min(36rem,calc(100vw-2rem))] -translate-x-1/2"
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
          <div class="queue-card pointer-events-auto">
            <div class="mb-1.5 flex items-center justify-between px-1">
              <span class="text-xs font-medium text-muted-foreground">
                {{
                  'discovery.queue.counter'
                    | transloco: { n: safeIndex() + 1, m: store.queue().length }
                }}
              </span>
              <div class="flex items-center gap-1">
                @if (store.queue().length > 1) {
                  <button
                    type="button"
                    (click)="prev()"
                    [disabled]="safeIndex() === 0"
                    class="grid h-7 w-7 place-items-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
                    [attr.aria-label]="'discovery.queue.prev' | transloco"
                    data-testid="queue-prev"
                  >
                    <hlm-icon name="lucideChevronLeft" size="15px" />
                  </button>
                  <button
                    type="button"
                    (click)="next()"
                    [disabled]="safeIndex() >= store.queue().length - 1"
                    class="grid h-7 w-7 place-items-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
                    [attr.aria-label]="'discovery.queue.next' | transloco"
                    data-testid="queue-next"
                  >
                    <hlm-icon name="lucideChevronRight" size="15px" />
                  </button>
                }
                <button
                  type="button"
                  (click)="collapsed.set(true)"
                  class="grid h-7 w-7 place-items-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:text-foreground"
                  [attr.aria-label]="'discovery.queue.collapse' | transloco"
                  data-testid="queue-collapse"
                >
                  <hlm-icon name="lucideX" size="15px" />
                </button>
              </div>
            </div>

            <!-- Keyed by id so navigating the carousel remounts the card, replaying
                 the subtle entrance animation for each new suggestion shown. -->
            @for (suggestion of currentAsList(); track suggestion.id) {
              <div class="card-swap">
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
        }
      </div>

      <style>
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
