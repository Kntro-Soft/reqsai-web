import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { Avatar } from '../../../../shared/components/avatar/avatar';
import { SessionParticipant } from '../../data/discovery.models';

/**
 * Live presence roster for a discovery session: an overlapping stack of participant avatars with a
 * "+N" overflow bubble and a live-pulse count. Purely presentational — it renders whatever
 * {@link participants} the store feeds it (the store already scopes presence to the live session).
 *
 * Avatars carry the participant name as a native tooltip (via {@link Avatar}); new joiners fade/scale
 * in through a CSS entrance animation keyed by user id, so the stack feels alive without reshuffling.
 */
@Component({
  selector: 'app-active-participants',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Avatar, TranslocoPipe],
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
        class="inline-flex items-center gap-2 rounded-full border border-border bg-card/70 py-1 pr-2.5 pl-1.5 backdrop-blur"
        data-testid="active-participants"
        [attr.aria-label]="'discovery.presence.viewing' | transloco: { count: count() }"
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
              [attr.title]="'discovery.presence.more' | transloco: { count: overflow() }"
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

  protected readonly count = computed(() => this.participants().length);
  protected readonly visible = computed(() => this.participants().slice(0, this.max()));
  protected readonly overflow = computed(() => Math.max(0, this.count() - this.max()));
}
