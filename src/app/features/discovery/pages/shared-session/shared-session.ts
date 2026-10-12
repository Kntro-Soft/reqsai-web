import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Observable } from 'rxjs';
import { provideIcons } from '@ng-icons/core';
import {
  lucideCheck,
  lucideEye,
  lucideLink2Off,
  lucideRotateCcw,
  lucideShieldCheck,
  lucideX,
} from '@ng-icons/lucide';
import { TranslocoPipe } from '@jsverse/transloco';
import { ShareApiService } from '../../data/share-api.service';
import { SHARED_SESSION_POLL_MS } from '../../data/share-links';
import { SharedSessionResponse, SharedStoryDecision } from '../../data/share.models';
import { SessionSegmentResponse, SuggestionResponse } from '../../data/discovery.models';
import { PriorityBadge, StoryStatusBadge } from '../../components/story-badges/story-badges';
import { ThemeToggle } from '../../../../shared/components/theme-toggle/theme-toggle';
import { LanguageSwitcher } from '../../../../shared/components/language-switcher/language-switcher';
import { Logo } from '../../../../shared/components/logo/logo';
import { HlmButton, HlmIcon, HlmSpinner } from '../../../../shared/ui';

type View = 'loading' | 'unavailable' | 'ready';

/**
 * The visitor's page for a session link: chrome-less and public. A spectator follows the session as it
 * happens (the page re-reads it every few seconds): the transcript, what the assistant suggests and the
 * stories it produced. A reviewer link adds the decisions: accept or dismiss suggestions, approve or
 * reject stories. Unknown, revoked and expired links all show the same dead-end.
 */
@Component({
  selector: 'app-shared-session',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    TranslocoPipe,
    PriorityBadge,
    StoryStatusBadge,
    ThemeToggle,
    LanguageSwitcher,
    Logo,
    HlmButton,
    HlmIcon,
    HlmSpinner,
  ],
  viewProviders: [
    provideIcons({
      lucideCheck,
      lucideEye,
      lucideLink2Off,
      lucideRotateCcw,
      lucideShieldCheck,
      lucideX,
    }),
  ],
  template: `
    <div class="min-h-dvh bg-background text-foreground">
      <header
        class="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-background/90 px-4 py-3 backdrop-blur md:px-6"
      >
        <app-logo [size]="26" />
        <div class="flex items-center gap-1">
          <app-language-switcher />
          <app-theme-toggle />
        </div>
      </header>

      <main class="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8">
        @switch (view()) {
          @case ('loading') {
            <div class="grid place-items-center py-24" data-testid="shared-session-loading">
              <hlm-spinner class="h-7 w-7" />
            </div>
          }

          @case ('unavailable') {
            <div
              class="flex flex-col items-center gap-3 py-24 text-center"
              data-testid="shared-session-unavailable"
            >
              <span
                class="grid h-12 w-12 place-items-center rounded-2xl bg-muted text-muted-foreground"
              >
                <hlm-icon name="lucideLink2Off" size="24px" />
              </span>
              <h1 class="text-xl font-bold tracking-tight">
                {{ 'share.public.unavailableTitle' | transloco }}
              </h1>
              <p class="max-w-sm text-sm text-muted-foreground">
                {{ 'share.public.unavailableBody' | transloco }}
              </p>
            </div>
          }

          @case ('ready') {
            @let data = shared()!;
            <div class="flex flex-col gap-2">
              <p class="text-xs font-medium uppercase tracking-wide text-primary">
                {{ 'share.public.session.eyebrow' | transloco }} · {{ data.projectName }}
              </p>
              <h1 class="text-2xl font-bold tracking-tight" data-testid="shared-session-title">
                {{ data.session.title }}
              </h1>
              <div class="flex flex-wrap items-center gap-2 text-sm">
                <span
                  class="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-0.5 text-xs font-medium"
                  data-testid="shared-session-status"
                  [attr.data-status]="data.session.status"
                >
                  @if (live()) {
                    <span class="relative flex h-2 w-2" aria-hidden="true">
                      <span
                        class="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60 motion-reduce:animate-none"
                      ></span>
                      <span class="relative inline-flex h-2 w-2 rounded-full bg-primary"></span>
                    </span>
                  }
                  {{ 'share.public.session.status.' + data.session.status | transloco }}
                </span>
                <span
                  class="inline-flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium"
                  data-testid="shared-session-access"
                >
                  <hlm-icon
                    [name]="reviewer() ? 'lucideShieldCheck' : 'lucideEye'"
                    size="13px"
                    aria-hidden="true"
                  />
                  {{ 'share.session.' + data.access | transloco }}
                </span>
                <span class="text-xs text-muted-foreground">
                  {{ 'share.public.until' | transloco }} {{ data.expiresAt | date: 'mediumDate' }}
                </span>
              </div>
              <p class="text-sm text-muted-foreground">
                {{
                  (reviewer()
                    ? 'share.public.session.introReview'
                    : 'share.public.session.introView'
                  ) | transloco
                }}
              </p>
            </div>

            @if (message(); as text) {
              <p
                class="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
                role="alert"
                data-testid="shared-session-message"
              >
                {{ text | transloco }}
              </p>
            }

            <div class="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
              <!-- The conversation, oldest first -->
              <section
                class="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 lg:sticky lg:top-20 lg:self-start"
                [attr.aria-label]="'share.public.session.transcript' | transloco"
              >
                <h2 class="text-sm font-semibold">
                  {{ 'share.public.session.transcript' | transloco }}
                </h2>
                @if (data.segments.length === 0) {
                  <p class="text-sm text-muted-foreground" data-testid="shared-session-no-segments">
                    {{ 'share.public.session.noTranscript' | transloco }}
                  </p>
                } @else {
                  @if (data.totalSegments > data.segments.length) {
                    <p class="text-xs text-muted-foreground">
                      {{
                        'share.public.session.latest'
                          | transloco: { shown: data.segments.length, total: data.totalSegments }
                      }}
                    </p>
                  }
                  <ol
                    class="flex max-h-[calc(100dvh-12rem)] flex-col gap-2 overflow-y-auto pr-1"
                    tabindex="0"
                  >
                    @for (segment of data.segments; track segment.sequence) {
                      <li class="flex flex-col gap-0.5 text-sm" data-testid="shared-segment">
                        <span class="text-xs text-muted-foreground">
                          <span class="font-medium text-foreground">{{ speakerOf(segment) }}</span>
                          · {{ clock(segment.startMs) }}
                        </span>
                        <span class="leading-relaxed">{{ segment.text }}</span>
                      </li>
                    }
                  </ol>
                }
              </section>

              <div class="flex flex-col gap-6">
                <!-- What the assistant suggests and nobody has decided yet -->
                <section class="flex flex-col gap-3" data-testid="shared-suggestions">
                  <h2 class="text-sm font-semibold">
                    {{ 'share.public.session.suggestions' | transloco }}
                    <span class="ml-1 font-normal text-muted-foreground tabular-nums">{{
                      data.suggestions.length
                    }}</span>
                  </h2>
                  @if (data.suggestions.length === 0) {
                    <p
                      class="rounded-xl border border-dashed border-border px-3 py-5 text-center text-sm text-muted-foreground"
                    >
                      {{ 'share.public.session.noSuggestions' | transloco }}
                    </p>
                  }
                  @for (s of data.suggestions; track s.id) {
                    <article
                      class="flex flex-col gap-2 rounded-2xl border border-border bg-card p-4"
                      data-testid="shared-suggestion"
                      [attr.data-suggestion-id]="s.id"
                    >
                      <p class="text-xs font-medium text-muted-foreground">
                        {{ 'share.public.session.type.' + s.type | transloco }}
                      </p>
                      @if (s.type === 'CLARIFYING_QUESTION') {
                        <p class="text-sm font-medium">{{ s.question }}</p>
                      } @else {
                        <h3 class="text-sm font-semibold">{{ s.draftTitle }}</h3>
                        <p class="text-sm leading-relaxed text-muted-foreground">
                          {{ 'share.public.asA' | transloco }} {{ s.draftRole }},
                          {{ 'share.public.iWant' | transloco }} {{ s.draftAction }},
                          {{ 'share.public.soThat' | transloco }} {{ s.draftBenefit }}.
                        </p>
                      }
                      @if (s.evidence?.quote; as quote) {
                        <blockquote
                          class="border-l-2 border-border pl-3 text-xs italic text-muted-foreground"
                        >
                          {{ quote }}
                        </blockquote>
                      }
                      @if (reviewer()) {
                        <div class="flex flex-wrap gap-2 pt-1">
                          @if (s.type !== 'CLARIFYING_QUESTION') {
                            <button
                              hlmBtn
                              size="sm"
                              type="button"
                              (click)="accept(s, true)"
                              [disabled]="busy() === s.id"
                              data-testid="shared-accept-approve"
                            >
                              <hlm-icon name="lucideCheck" size="14px" />
                              {{ 'share.public.session.acceptApprove' | transloco }}
                            </button>
                          }
                          <button
                            hlmBtn
                            size="sm"
                            variant="outline"
                            type="button"
                            (click)="accept(s, false)"
                            [disabled]="busy() === s.id"
                            data-testid="shared-accept"
                          >
                            {{
                              (s.type === 'CLARIFYING_QUESTION'
                                ? 'share.public.session.resolve'
                                : 'share.public.session.acceptDraft'
                              ) | transloco
                            }}
                          </button>
                          <button
                            hlmBtn
                            size="sm"
                            variant="ghost"
                            type="button"
                            (click)="dismiss(s)"
                            [disabled]="busy() === s.id"
                            data-testid="shared-dismiss"
                          >
                            <hlm-icon name="lucideX" size="14px" />
                            {{ 'share.public.session.dismiss' | transloco }}
                          </button>
                        </div>
                      }
                    </article>
                  }
                </section>

                <!-- The stories the session produced -->
                <section class="flex flex-col gap-3" data-testid="shared-stories">
                  <h2 class="text-sm font-semibold">
                    {{ 'share.public.session.stories' | transloco }}
                    <span class="ml-1 font-normal text-muted-foreground tabular-nums">{{
                      data.stories.length
                    }}</span>
                  </h2>
                  @if (data.stories.length === 0) {
                    <p
                      class="rounded-xl border border-dashed border-border px-3 py-5 text-center text-sm text-muted-foreground"
                    >
                      {{ 'share.public.session.noStories' | transloco }}
                    </p>
                  }
                  @for (story of data.stories; track story.id) {
                    <article
                      class="flex flex-col gap-2 rounded-2xl border border-border bg-card p-4"
                      data-testid="shared-session-story"
                      [attr.data-story-id]="story.id"
                    >
                      <div class="flex flex-wrap items-start justify-between gap-2">
                        <h3 class="text-sm font-semibold">{{ story.title }}</h3>
                        <div class="flex items-center gap-1.5">
                          <app-priority-badge [priority]="story.priority" size="sm" />
                          <app-story-status-badge [status]="story.status" />
                        </div>
                      </div>
                      <p class="text-sm leading-relaxed text-muted-foreground">
                        {{ 'share.public.asA' | transloco }} {{ story.role }},
                        {{ 'share.public.iWant' | transloco }} {{ story.action }},
                        {{ 'share.public.soThat' | transloco }} {{ story.benefit }}.
                      </p>
                      @if (reviewer()) {
                        <div class="flex flex-wrap gap-2 pt-1">
                          @if (story.status === 'DRAFT') {
                            <button
                              hlmBtn
                              size="sm"
                              type="button"
                              (click)="decide(story.id, 'APPROVED')"
                              [disabled]="busy() === story.id"
                              data-testid="shared-story-approve"
                            >
                              <hlm-icon name="lucideCheck" size="14px" />
                              {{ 'share.public.session.approve' | transloco }}
                            </button>
                            <button
                              hlmBtn
                              size="sm"
                              variant="outline"
                              type="button"
                              (click)="decide(story.id, 'REJECTED')"
                              [disabled]="busy() === story.id"
                              data-testid="shared-story-reject"
                            >
                              <hlm-icon name="lucideX" size="14px" />
                              {{ 'share.public.session.reject' | transloco }}
                            </button>
                          } @else if (story.status === 'APPROVED' || story.status === 'REJECTED') {
                            <button
                              hlmBtn
                              size="sm"
                              variant="outline"
                              type="button"
                              (click)="decide(story.id, 'DRAFT')"
                              [disabled]="busy() === story.id"
                              data-testid="shared-story-draft"
                            >
                              <hlm-icon name="lucideRotateCcw" size="14px" />
                              {{ 'share.public.session.backToDraft' | transloco }}
                            </button>
                          }
                        </div>
                      }
                    </article>
                  }
                </section>
              </div>
            </div>
          }
        }
      </main>
    </div>
  `,
})
export class SharedSession implements OnInit {
  private readonly api = inject(ShareApiService);
  private readonly destroyRef = inject(DestroyRef);

  /** Route param: the link's token. */
  readonly token = input.required<string>();

  protected readonly view = signal<View>('loading');
  protected readonly shared = signal<SharedSessionResponse | null>(null);
  /** The suggestion or story with a decision in flight. */
  protected readonly busy = signal<string | null>(null);
  protected readonly message = signal<string | null>(null);

  protected readonly reviewer = computed(() => this.shared()?.access === 'REVIEW');
  protected readonly live = computed(() => this.shared()?.session.status === 'RECORDING');

  private readonly names = computed(
    () => new Map((this.shared()?.speakers.speakers ?? []).map((s) => [s.label, s.name])),
  );
  private reading = false;

  ngOnInit(): void {
    this.refresh();
    const timer = setInterval(() => {
      if (this.view() === 'ready' && !document.hidden && this.busy() === null) this.refresh();
    }, SHARED_SESSION_POLL_MS);
    this.destroyRef.onDestroy(() => clearInterval(timer));
  }

  protected speakerOf(segment: SessionSegmentResponse): string {
    return (segment.speakerLabel && this.names().get(segment.speakerLabel)) || '—';
  }

  protected clock(ms: number): string {
    const total = Math.floor(ms / 1000);
    const minutes = Math.floor(total / 60);
    return `${minutes}:${String(total % 60).padStart(2, '0')}`;
  }

  protected accept(suggestion: SuggestionResponse, approve: boolean): void {
    this.decideOn(
      suggestion.id,
      this.api.acceptSharedSuggestion(this.token(), suggestion.id, { approve }),
    );
  }

  protected dismiss(suggestion: SuggestionResponse): void {
    this.decideOn(suggestion.id, this.api.dismissSharedSuggestion(this.token(), suggestion.id));
  }

  protected decide(storyId: string, status: SharedStoryDecision): void {
    this.decideOn(storyId, this.api.changeSharedStoryStatus(this.token(), storyId, status));
  }

  private decideOn(id: string, request: Observable<unknown>): void {
    if (this.busy() !== null) return;
    this.busy.set(id);
    this.message.set(null);
    request.subscribe({
      next: () => {
        this.busy.set(null);
        this.refresh();
      },
      error: (err: HttpErrorResponse) => {
        this.busy.set(null);
        if (err.status === 403) this.message.set('share.public.session.readOnly');
        else if (err.status === 404 && err.error?.code === 'SHARE_LINK_UNAVAILABLE') {
          this.view.set('unavailable');
        } else this.message.set('share.public.session.decideFailed');
        this.refresh();
      },
    });
  }

  private refresh(): void {
    if (this.reading) return;
    this.reading = true;
    this.api.openSharedSession(this.token()).subscribe({
      next: (shared) => {
        this.reading = false;
        this.shared.set(shared);
        this.view.set('ready');
      },
      error: (err: HttpErrorResponse) => {
        this.reading = false;
        // A first read that fails is a dead link; a later hiccup keeps what is on screen.
        if (this.view() === 'loading' || err.status === 404) this.view.set('unavailable');
      },
    });
  }
}
