import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { OverlayModule } from '@angular/cdk/overlay';
import { TranslocoPipe } from '@jsverse/transloco';
import { Avatar } from '../../../../shared/components/avatar/avatar';
import { BELOW_START } from '../../../../shared/components/popover/popover-positions';
import { SessionParticipant } from '../../data/discovery.models';

/** Delay before closing on mouse-out, so moving from the trigger into the panel doesn't flicker-close it. */
const HOVER_CLOSE_DELAY_MS = 200;

/**
 * Live presence roster for a discovery session: an overlapping stack of participant avatars with a
 * "+N" overflow bubble and a live-pulse count. Purely presentational — it renders whatever
 * {@link participants} the store feeds it (the store already scopes presence to the live session).
 *
 * Clicking (or, on desktop, hovering) the pill opens a small popover listing every participant by
 * name — the stack alone only names people via native title tooltips, which doesn't scale past a
 * couple of avatars and doesn't work at all on touch. The popover is the one place that always shows
 * the full roster regardless of how many are collapsed into the "+N" bubble.
 *
 * Avatars carry the participant name as a native tooltip too (via {@link Avatar}); new joiners
 * fade/scale in through a CSS entrance animation keyed by user id, so the stack feels alive without
 * reshuffling.
 */
@Component({
  selector: 'app-active-participants',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Avatar, OverlayModule, TranslocoPipe],
  host: { class: 'inline-flex' },
  styles: `
    @keyframes participant-in {
      from {
        opacity: 0;
        transform: scale(0.6);
      }
      to {
        opacity: 1;
        transform: scale(1);
      }
    }
    .participant-chip {
      animation: participant-in 220ms cubic-bezier(0.22, 1, 0.36, 1);
    }
    @media (prefers-reduced-motion: reduce) {
      .participant-chip {
        animation: none;
      }
    }
  `,
  template: `
    @if (count() > 0) {
      <div
        cdkOverlayOrigin
        #origin="cdkOverlayOrigin"
        role="button"
        tabindex="0"
        class="inline-flex cursor-pointer items-center gap-2 rounded-full border border-border bg-card/70 py-1 pr-2.5 pl-2.5 backdrop-blur"
        data-testid="active-participants"
        [attr.aria-label]="'discovery.presence.viewing' | transloco: { count: count() }"
        aria-haspopup="dialog"
        [attr.aria-expanded]="open()"
        (click)="toggle()"
        (keydown.enter)="toggle()"
        (keydown.space)="toggle(); $event.preventDefault()"
        (mouseenter)="onMouseEnter()"
        (mouseleave)="onMouseLeave()"
      >
        <!-- Live pulse -->
        <span class="relative flex h-2 w-2 shrink-0" aria-hidden="true">
          <span
            class="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60 motion-reduce:animate-none"
          ></span>
          <span class="relative inline-flex h-2 w-2 rounded-full bg-emerald-500"></span>
        </span>

        <!-- Avatar stack -->
        <div class="flex items-center -space-x-2">
          @for (participant of visible(); track participant.userId) {
            <span
              class="participant-chip rounded-full ring-2 ring-card transition-transform hover:z-10 hover:-translate-y-0.5"
            >
              <app-avatar
                [name]="participant.displayName"
                [seed]="participant.userId"
                [imageUrl]="participant.avatarUrl"
                [size]="size()"
              />
            </span>
          }
          @if (overflow() > 0) {
            <span
              class="inline-grid place-items-center rounded-full bg-muted font-semibold text-muted-foreground ring-2 ring-card"
              [style.width.px]="size()"
              [style.height.px]="size()"
              [style.fontSize.px]="size() * 0.36"
            >
              +{{ overflow() }}
            </span>
          }
        </div>

        <!-- Count label (hidden on very small screens) -->
        <span class="hidden whitespace-nowrap text-xs font-medium text-muted-foreground sm:inline">
          {{ 'discovery.presence.viewing' | transloco: { count: count() } }}
        </span>
      </div>

      <ng-template
        cdkConnectedOverlay
        [cdkConnectedOverlayOrigin]="origin"
        [cdkConnectedOverlayOpen]="open()"
        [cdkConnectedOverlayPositions]="positions"
        (overlayOutsideClick)="close()"
        (overlayKeydown)="onOverlayKeydown($event)"
        (detach)="close()"
      >
        <div
          role="dialog"
          class="w-56 overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-xl"
          (mouseenter)="onMouseEnter()"
          (mouseleave)="onMouseLeave()"
        >
          <div
            class="border-b border-border px-3 py-2 text-xs font-medium text-muted-foreground"
            data-testid="active-participants-panel-title"
          >
            {{ 'discovery.presence.viewing' | transloco: { count: count() } }}
          </div>
          <div class="max-h-64 overflow-y-auto p-1">
            @for (participant of participants(); track participant.userId) {
              <div
                class="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm"
                data-testid="active-participants-row"
              >
                <app-avatar
                  [name]="participant.displayName"
                  [seed]="participant.userId"
                  [imageUrl]="participant.avatarUrl"
                  [size]="24"
                />
                <span class="min-w-0 flex-1 truncate">{{ participant.displayName }}</span>
              </div>
            }
          </div>
        </div>
      </ng-template>
    }
  `,
})
export class ActiveParticipants {
  /** The users currently present. Empty hides the whole roster. */
  readonly participants = input<SessionParticipant[]>([]);
  /** Pixel diameter of each avatar. */
  readonly size = input<number>(26);
  /** How many avatars to render before collapsing the rest into a "+N" bubble. */
  readonly max = input<number>(4);

  protected readonly positions = BELOW_START;
  protected readonly open = signal(false);
  private closeTimer: ReturnType<typeof setTimeout> | null = null;

  protected readonly count = computed(() => this.participants().length);
  protected readonly visible = computed(() => this.participants().slice(0, this.max()));
  protected readonly overflow = computed(() => Math.max(0, this.count() - this.max()));

  protected toggle(): void {
    this.open.update((v) => !v);
  }

  protected close(): void {
    this.open.set(false);
  }

  /** Opens on hover (desktop); harmless on touch, where this event never fires. */
  protected onMouseEnter(): void {
    if (this.closeTimer !== null) {
      clearTimeout(this.closeTimer);
      this.closeTimer = null;
    }
    this.open.set(true);
  }

  /** Delayed close so moving the pointer from the trigger into the panel doesn't flicker-close it. */
  protected onMouseLeave(): void {
    this.closeTimer = setTimeout(() => this.open.set(false), HOVER_CLOSE_DELAY_MS);
  }

  protected onOverlayKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') this.close();
  }
}
