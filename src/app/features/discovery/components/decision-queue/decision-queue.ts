import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  model,
  output,
  signal,
  untracked,
  viewChild,
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
import { EvidenceSegment } from '../../data/evidence';
import { dragOutcome, stackLayers } from '../../data/feed';
import { SuggestionCard } from '../suggestion-card/suggestion-card';
import { HlmIcon } from '../../../../shared/ui';

/** Per-depth down/right offset (px) of each decorative deck edge behind the card. */
const STACK_OFFSET_PX = 6;
/** Per-depth scale reduction of each deck edge (deeper edges sit slightly smaller). */
const STACK_SCALE_STEP = 0.025;
/** Per-depth opacity reduction of each deck edge (deeper edges fade back). */
const STACK_FADE_STEP = 0.22;

/** Max rotation (deg) applied to the card at a full-width drag, for the Tinder tilt. */
const DRAG_MAX_ROTATE_DEG = 8;
/** How far off-screen the committed card flings, as a fraction of its own width. */
const EXIT_TRANSLATE_FRACTION = 1.2;
/** Exit fling duration (ms) — MUST match the `.card-exiting` CSS transition. */
const EXIT_DURATION_MS = 200;
/** Horizontal delta (px) past which a gesture is treated as a swipe (not a page scroll). */
const DRAG_HORIZONTAL_LOCK_PX = 8;

/**
 * The decision queue: pending AI suggestions as a non-modal review tray docked
 * to the top of the feed column (never over the session controls or the side
 * panel). A tray header names it ("AI suggestions to review") and carries the
 * "n of m" counter with prev/next; a horizontal drag on the card's top handle
 * also browses. The user can minimize it to a compact badge that expands on
 * click; new suggestions only bump the count and never change that state. While a decision is in flight the card stays visible
 * with a spinner and disabled actions, and leaves only once the store confirms
 * the resolution.
 */
@Component({
  selector: 'app-decision-queue',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SuggestionCard, HlmIcon, TranslocoPipe],
  viewProviders: [
    provideIcons({ lucideChevronLeft, lucideChevronRight, lucideMinus, lucideSparkles, lucideX }),
  ],
  host: { class: 'contents' },
  template: `
    @if (store.queue().length > 0) {
      <!-- Anchored to the feed column (the page wraps the feed in a relative box), so the
           tray never covers the session bar, the header actions or the side panel; the
           bottom inset (sm+) keeps the live edge (latest lines + AI status) in view below it. -->
      <div
        class="pointer-events-none absolute inset-x-2 bottom-2 top-2 z-20 flex flex-col items-center sm:inset-x-4 sm:bottom-[9.5rem]"
        data-testid="decision-queue"
      >
        @if (collapsed()) {
          <button
            type="button"
            (click)="collapsed.set(false)"
            class="queue-badge pointer-events-auto inline-flex items-center gap-2 rounded-full border border-ai-border bg-card py-1.5 pl-2 pr-3.5 text-sm font-medium text-foreground shadow-lg transition-colors hover:bg-accent"
            [attr.aria-label]="'discovery.queue.expand' | transloco"
            data-testid="queue-badge"
          >
            <span class="grid h-6 w-6 place-items-center rounded-full bg-ai-soft text-ai">
              <hlm-icon name="lucideSparkles" size="14px" aria-hidden="true" />
            </span>
            @for (count of [store.queue().length]; track count) {
              <span
                class="queue-count grid h-5 min-w-5 place-items-center rounded-full bg-ai px-1.5 text-[11px] font-bold leading-none text-card tabular-nums"
                data-testid="queue-badge-count"
                >{{ count }}</span
              >
            }
            {{ 'discovery.queue.pendingBadgeLabel' | transloco }}
          </button>
        } @else {
          <!-- The tray is its own surface (frosted, AI-violet edge) so the transcript
               scrolling underneath never bleeds through between header and card. -->
          <!-- Keyboard: ←/→ browse, Esc minimizes (ignored while typing in a field). After
               a decision, focus returns here instead of falling to the page body. -->
          <section
            #tray
            tabindex="-1"
            (keydown)="onTrayKeydown($event)"
            class="queue-card pointer-events-auto flex max-h-full min-h-0 w-full max-w-2xl flex-col rounded-[1.375rem] border border-ai-border/70 bg-background/85 p-2 shadow-xl outline-none backdrop-blur-md focus-visible:ring-2 focus-visible:ring-ring"
            [attr.aria-label]="'discovery.queue.title' | transloco"
            [attr.aria-keyshortcuts]="'ArrowLeft ArrowRight Escape'"
          >
            <!-- Tray header: what this is (AI, awaiting review), where you are, how to
                 move, and how to get it out of the way. -->
            <div class="mb-2.5 flex items-center gap-1 rounded-full py-0.5 pl-2.5 pr-0.5">
              <hlm-icon name="lucideSparkles" size="15px" class="text-ai" aria-hidden="true" />
              <span class="ml-1 min-w-0 truncate text-xs font-semibold text-foreground">
                <span class="sm:hidden">{{ 'discovery.queue.titleShort' | transloco }}</span>
                <span class="hidden sm:inline">{{ 'discovery.queue.title' | transloco }}</span>
              </span>
              <span class="ml-auto flex shrink-0 items-center">
                @if (store.queue().length > 1) {
                  <button
                    type="button"
                    (click)="prev()"
                    [disabled]="safeIndex() === 0"
                    class="queue-nav grid h-8 w-8 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-35"
                    [attr.aria-label]="'discovery.queue.prev' | transloco"
                    data-testid="queue-prev"
                  >
                    <hlm-icon name="lucideChevronLeft" size="16px" />
                  </button>
                }
                <span
                  class="queue-counter min-w-[3.25rem] text-center text-xs font-medium tabular-nums text-muted-foreground"
                  aria-live="polite"
                  data-testid="queue-counter"
                >
                  {{
                    'discovery.queue.counter'
                      | transloco: { n: safeIndex() + 1, m: store.queue().length }
                  }}
                </span>
                @if (store.queue().length > 1) {
                  <button
                    type="button"
                    (click)="next()"
                    [disabled]="safeIndex() >= store.queue().length - 1"
                    class="queue-nav grid h-8 w-8 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-35"
                    [attr.aria-label]="'discovery.queue.next' | transloco"
                    data-testid="queue-next"
                  >
                    <hlm-icon name="lucideChevronRight" size="16px" />
                  </button>
                }
                <span class="mx-1 h-4 w-px bg-border" aria-hidden="true"></span>
                <button
                  type="button"
                  (click)="collapsed.set(true)"
                  class="inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  [attr.aria-label]="'discovery.queue.minimize' | transloco"
                  [title]="'discovery.queue.minimize' | transloco"
                  data-testid="queue-collapse"
                >
                  <hlm-icon name="lucideMinus" size="15px" />
                  <span class="hidden sm:inline">{{ 'discovery.queue.minimize' | transloco }}</span>
                </button>
              </span>
            </div>

            <!-- The stacked "deck": decorative card edges behind the active card,
                 one per remaining pending suggestion (capped), conveying depth.
                 Purely visual — aria-hidden, no pointer events. -->
            <div class="deck relative flex min-h-0 flex-col">
              @for (layer of stackLayers(); track layer) {
                <div
                  aria-hidden="true"
                  class="deck-layer absolute inset-x-0 top-0 h-full rounded-2xl border border-border bg-card shadow-sm"
                  [style.transform]="layerTransform(layer)"
                  [style.opacity]="layerOpacity(layer)"
                  [style.zIndex]="layer"
                  data-testid="queue-stack-layer"
                ></div>
              }

              <!-- Keyed by id so navigating the carousel remounts the card, replaying
                   the subtle entrance animation for each new suggestion shown. -->
              @for (suggestion of currentAsList(); track suggestion.id) {
                <div
                  class="card-swap relative z-10 flex min-h-0 flex-col"
                  [class.card-dragging]="dragging()"
                  [class.card-exiting]="exiting() !== null"
                  [style.transform]="cardTransform()"
                  [style.opacity]="cardOpacity()"
                  (transitionend)="onCardTransitionEnd($event)"
                  data-testid="queue-card"
                >
                  <!-- Drag handle straddling the card's top edge: swiping it browses the
                       deck without ever competing with the card's own buttons/inputs.
                       Pointer Events (with capture) drive it identically on mouse and
                       touch; touch-action pan-y keeps vertical page scroll working. -->
                  @if (store.queue().length > 1) {
                    <div
                      class="queue-drag absolute inset-x-0 -top-3 z-30 flex h-6 cursor-grab touch-pan-y items-center justify-center"
                      [class.cursor-grabbing]="dragging()"
                      role="button"
                      tabindex="-1"
                      [attr.aria-label]="'discovery.queue.dragHint' | transloco"
                      (pointerdown)="onDragStart($event)"
                      (pointermove)="onDragMove($event)"
                      (pointerup)="onDragEnd($event)"
                      (pointercancel)="onDragCancel($event)"
                      data-testid="queue-drag"
                    >
                      <span
                        class="h-1.5 w-10 rounded-full border border-border bg-card"
                        aria-hidden="true"
                      ></span>
                    </div>
                  }
                  <app-suggestion-card
                    [suggestion]="suggestion"
                    [targetStory]="targetStory(suggestion)"
                    [canDecide]="canDecide()"
                    [busy]="store.deciding().includes(suggestion.id)"
                    [evidenceSegment]="store.evidenceSegment(suggestion)"
                    (accept)="decideAccept.emit({ suggestion, body: $event })"
                    (dismiss)="decideDismiss.emit(suggestion)"
                    (openTarget)="openTarget.emit($event)"
                    (showEvidence)="showEvidence.emit($event)"
                  />
                </div>
              }
            </div>
          </section>
        }
      </div>

      <style>
        @media (prefers-reduced-motion: reduce) {
          /* No spring/fling/enter under reduced motion: the card snaps instantly. */
          .card-swap {
            animation: none;
            transition: none;
          }
        }
        @media (prefers-reduced-motion: no-preference) {
          .queue-card {
            animation: queue-in 160ms ease-out;
          }
          /* One-shot bump of the minimized count each time a suggestion arrives
             (the count is keyed, so a new value remounts and replays it). */
          .queue-count {
            animation: queue-count-bump 420ms cubic-bezier(0.16, 1, 0.3, 1);
          }
          /* Enter: the incoming card eases in from a gentle scale + fade rather
             than popping. Replayed on each swap via the keyed @for remount. */
          .card-swap {
            animation: card-swap-in 160ms ease-out;
          }
          /* Resting card: a drag under the commit threshold springs back to
             center (transform 0, no rotation) with a short ease-out. */
          .card-swap {
            transition:
              transform 150ms ease-out,
              opacity 150ms ease-out;
          }
          /* While the pointer holds the card it follows the finger instantly. */
          .card-swap.card-dragging {
            transition: none;
          }
          /* Commit: the outgoing card flings fully off-screen (±120% width) with
             its tilt while fading out, over ~200ms, before the swap happens. */
          .card-swap.card-exiting {
            transition:
              transform 200ms ease-out,
              opacity 200ms ease-out;
          }
        }
        @keyframes card-swap-in {
          from {
            opacity: 0;
            transform: scale(0.96);
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
        @keyframes queue-count-bump {
          0% {
            transform: scale(1);
          }
          40% {
            transform: scale(1.25);
          }
          100% {
            transform: scale(1);
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
  /** Asks the page to scroll the feed to the transcript bubble a suggestion's evidence quotes. */
  readonly showEvidence = output<EvidenceSegment>();

  /** Minimized to the badge. Two-way bound so the page can fold it (e.g. focus moved under it). */
  readonly collapsed = model(false);

  private readonly tray = viewChild<ElementRef<HTMLElement>>('tray');

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

  // ---- Tinder-style drag-to-navigate ----

  /** True while a pointer is dragging the active card (suppresses the snap transition). */
  protected readonly dragging = signal(false);
  /** Live horizontal drag delta (px): negative = left/next, positive = right/prev. */
  private readonly dragX = signal(0);
  /**
   * A committed swipe that is flinging off-screen but has not yet swapped the
   * current suggestion. Non-null only during the ~200ms exit animation; carries
   * the outcome to apply and the card width, so the transform can fling to a
   * fixed fraction of the card width regardless of the drag's end position.
   */
  protected readonly exiting = signal<{ outcome: 'next' | 'prev'; width: number } | null>(null);
  /** Guards the exit swap so a transitionend + fallback timeout can't both fire it. */
  private exitDone = false;
  /** The pending drag gesture's mutable state, or null when idle. */
  private drag: {
    pointerId: number;
    startX: number;
    startY: number;
    width: number;
    /** True once the movement is clearly horizontal — from then on it's a swipe. */
    horizontal: boolean;
    target: HTMLElement;
  } | null = null;

  /**
   * The active card's transform. Three phases: while exiting, fling fully
   * off-screen (±120% of the card width) keeping the tilt; while dragging, follow
   * the pointer with a proportional Tinder tilt; otherwise rest at center.
   */
  protected readonly cardTransform = computed(() => {
    const exit = this.exiting();
    if (exit) {
      const sign = exit.outcome === 'next' ? -1 : 1;
      const offset = sign * exit.width * EXIT_TRANSLATE_FRACTION;
      return `translateX(${offset}px) rotate(${sign * DRAG_MAX_ROTATE_DEG}deg)`;
    }
    const dx = this.dragX();
    if (dx === 0) return '';
    if (this.prefersReducedMotion()) return `translateX(${dx}px)`;
    const width = this.drag?.width || 1;
    const rotate = Math.max(-DRAG_MAX_ROTATE_DEG, Math.min(DRAG_MAX_ROTATE_DEG, (dx / width) * 20));
    return `translateX(${dx}px) rotate(${rotate}deg)`;
  });

  /** The card fades to 0 as it flings out on commit; otherwise fully opaque. */
  protected readonly cardOpacity = computed(() => (this.exiting() ? 0 : 1));

  private prefersReducedMotion(): boolean {
    return (
      typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
    );
  }

  protected onDragStart(event: PointerEvent): void {
    // A lone card has nowhere to navigate — ignore drags entirely.
    if (this.store.queue().length <= 1) return;
    // Ignore a new grab while the previous card is still flinging off-screen, so a
    // fast repeated swipe can't desync the exit animation from the current card.
    if (this.exiting()) return;
    const target = event.currentTarget as HTMLElement;
    this.drag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      width: target.getBoundingClientRect().width,
      horizontal: false,
      target,
    };
    target.setPointerCapture(event.pointerId);
  }

  protected onDragMove(event: PointerEvent): void {
    const drag = this.drag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    // Lock the gesture to horizontal once it clearly moves sideways; until then a
    // vertical drag is left alone so the page can still scroll (touch-action: pan-y).
    if (!drag.horizontal) {
      if (Math.abs(dy) > Math.abs(dx)) return;
      if (Math.abs(dx) < DRAG_HORIZONTAL_LOCK_PX) return;
      drag.horizontal = true;
      this.dragging.set(true);
    }
    // Now committed to a horizontal swipe: take over from page scroll and follow.
    event.preventDefault();
    this.dragX.set(dx);
  }

  protected onDragEnd(event: PointerEvent): void {
    const drag = this.drag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    const dx = this.dragX();
    const width = drag.width;
    const outcome = dragOutcome(dx, width, this.safeIndex(), this.store.queue().length);
    this.releaseDrag(drag, event.pointerId);

    // Below the threshold: spring the card back to center (the resting `.card-swap`
    // transition eases translate + rotation back to 0).
    if (outcome === 'snap') {
      this.dragX.set(0);
      return;
    }
    // Under reduced motion there is no fling — swap to the target card instantly.
    if (this.prefersReducedMotion()) {
      this.dragX.set(0);
      this.navigate(outcome);
      return;
    }
    // Commit: hand off to the exit animation. The card keeps its current drag delta
    // as the transition's start point, then `.card-exiting` flings it fully
    // off-screen; only once that finishes do we swap the current suggestion.
    this.beginExit(outcome, width);
  }

  /**
   * Starts the off-screen fling for a committed swipe. Clearing `dragX` lets the
   * exit transform (computed from {@link exiting}) take over from the drag delta,
   * so the card animates from where the finger left it out to ±120% width. A
   * fallback timeout matching the CSS duration guarantees the swap even if the
   * `transitionend` event never fires.
   */
  private beginExit(outcome: 'next' | 'prev', width: number): void {
    this.exitDone = false;
    this.exiting.set({ outcome, width });
    this.dragX.set(0);
    setTimeout(() => this.finishExit(), EXIT_DURATION_MS + 30);
  }

  /**
   * Fires when the outgoing card's exit transition ends. Swaps to the target card
   * and clears the exit state; the keyed `@for` then remounts the new card, which
   * plays the enter animation. Guarded so it runs once per exit even though both
   * `transitionend` (possibly per-property) and the fallback timeout call it.
   */
  protected onCardTransitionEnd(event: TransitionEvent): void {
    // Only the exiting card's transform transition should trigger the swap — ignore
    // the enter animation, opacity, and any child transitions bubbling up.
    if (event.target !== event.currentTarget || event.propertyName !== 'transform') return;
    this.finishExit();
  }

  /** Applies the committed navigation and resets the exit state (idempotent). */
  private finishExit(): void {
    const exit = this.exiting();
    if (!exit || this.exitDone) return;
    this.exitDone = true;
    this.exiting.set(null);
    this.navigate(exit.outcome);
  }

  protected onDragCancel(event: PointerEvent): void {
    const drag = this.drag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    this.releaseDrag(drag, event.pointerId);
    this.dragX.set(0);
  }

  private releaseDrag(drag: NonNullable<DecisionQueue['drag']>, pointerId: number): void {
    if (drag.target.hasPointerCapture(pointerId)) {
      drag.target.releasePointerCapture(pointerId);
    }
    this.dragging.set(false);
    this.drag = null;
  }

  constructor() {
    // Minimizing is exclusively the user's action (the minimize button): adding
    // suggestions never changes the collapsed/expanded state. We only reset back
    // to expanded once the queue empties, so it opens expanded next time.
    effect(() => {
      if (this.store.queue().length === 0) this.collapsed.set(false);
    });
    // A decided card leaves the DOM with the focused button in it, dropping focus to the
    // page body. Bring it back to the tray so keyboard review can carry on.
    let previousLength = 0;
    effect(() => {
      const length = this.store.queue().length;
      const shrank = length < previousLength;
      previousLength = length;
      if (!shrank || length === 0 || untracked(() => this.collapsed())) return;
      setTimeout(() => {
        const active = document.activeElement;
        if (!active || active === document.body) this.tray()?.nativeElement.focus();
      });
    });
  }

  /** ←/→ browse the deck and Esc minimizes — unless the key belongs to a field being edited. */
  protected onTrayKeydown(event: KeyboardEvent): void {
    const target = event.target as HTMLElement | null;
    if (target?.closest('input, textarea, select, [contenteditable="true"], [role="listbox"]'))
      return;
    if (event.key === 'Escape') {
      event.preventDefault();
      this.collapsed.set(true);
    } else if (event.key === 'ArrowLeft' && this.safeIndex() > 0) {
      event.preventDefault();
      this.prev();
    } else if (event.key === 'ArrowRight' && this.safeIndex() < this.store.queue().length - 1) {
      event.preventDefault();
      this.next();
    }
  }

  /** Applies a committed drag outcome as a carousel navigation. */
  private navigate(outcome: 'next' | 'prev'): void {
    if (outcome === 'next') this.next();
    else this.prev();
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
