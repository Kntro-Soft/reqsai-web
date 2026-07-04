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
 * compact badge that expands on click. Decisions animate the card out.
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
              class="pointer-events-auto inline-flex items-center gap-2 rounded-full border border-primary/40 bg-card px-3.5 py-1.5 text-sm font-medium text-primary shadow-lg transition-colors hover:bg-primary/10"
              data-testid="queue-badge"
            >
              <hlm-icon name="lucideSparkles" size="14px" />
              {{ 'discovery.queue.pendingBadge' | transloco: { count: store.queue().length } }}
            </button>
          </div>
        } @else {
          <div class="queue-card pointer-events-auto" [class.queue-card-leaving]="leaving()">
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

            @if (store.currentSuggestion(); as suggestion) {
              <app-suggestion-card
                [suggestion]="suggestion"
                [targetStory]="targetStory(suggestion)"
                [canDecide]="canDecide()"
                (accept)="onAccept(suggestion, $event)"
                (dismiss)="onDismiss(suggestion)"
                (openTarget)="openTarget.emit($event)"
              />
            }
          </div>
        }
      </div>

      <style>
        @media (prefers-reduced-motion: no-preference) {
          .queue-card {
            animation: queue-in 160ms ease-out;
          }
          .queue-card-leaving {
            animation: queue-out 160ms ease-in forwards;
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
        @keyframes queue-out {
          from {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
          to {
            opacity: 0;
            transform: translateY(-10px) scale(0.97);
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
  protected readonly leaving = signal(false);

  protected readonly safeIndex = computed(() => {
    const length = this.store.queue().length;
    if (length === 0) return 0;
    return Math.min(this.store.queueIndex(), length - 1);
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

  protected onAccept(suggestion: SuggestionResponse, body: AcceptSuggestionRequest): void {
    this.animateOut(() => this.decideAccept.emit({ suggestion, body }));
  }

  protected onDismiss(suggestion: SuggestionResponse): void {
    this.animateOut(() => this.decideDismiss.emit(suggestion));
  }

  /** Plays the short leave animation, then hands the decision to the page. */
  private animateOut(done: () => void): void {
    if (this.leaving()) return;
    this.leaving.set(true);
    setTimeout(() => {
      this.leaving.set(false);
      done();
    }, 160);
  }
}
