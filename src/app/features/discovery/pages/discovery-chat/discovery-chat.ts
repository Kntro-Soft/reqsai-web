import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnInit,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { provideIcons } from '@ng-icons/core';
import {
  lucideCheck,
  lucideCircleHelp,
  lucideClock,
  lucideHistory,
  lucideMic,
  lucidePanelRight,
  lucideSparkles,
  lucideX,
} from '@ng-icons/lucide';
import { AuthStore } from '../../../../core/auth/auth.store';
import { WorkspaceStore } from '../../../workspace/data/workspace.store';
import { ToastService } from '../../../../shared/toast/toast.service';
import { AudioRecorderService } from '../../../../core/audio/audio-recorder.service';
import { DiscoveryChatStore } from '../../data/discovery-chat.store';
import { SessionRecordingService } from '../../data/session-recording.service';
import { AcceptSuggestionRequest, SuggestionResponse } from '../../data/discovery.models';
import { SessionBar } from '../../components/session-bar/session-bar';
import { DecisionQueue } from '../../components/decision-queue/decision-queue';
import { SidePanel } from '../../components/side-panel/side-panel';
import { HlmButton, HlmIcon, HlmSpinner } from '../../../../shared/ui';

/**
 * The default discovery view: a GPT/Claude-style chat. The center feed is a
 * chronological, read-only stream of transcript bubbles and resolved decision
 * cards, chunked by session; scrolling to the top lazily loads older sessions.
 * The composer at the bottom pairs a disabled ("coming soon") text input with
 * the record button. Pending AI suggestions surface in the floating decision
 * queue; the side panel exposes the project's stories/info/glossary/constraints.
 */
@Component({
  selector: 'app-discovery-chat',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    DatePipe,
    TranslocoPipe,
    SessionBar,
    DecisionQueue,
    SidePanel,
    HlmButton,
    HlmIcon,
    HlmSpinner,
  ],
  viewProviders: [
    provideIcons({
      lucideCheck,
      lucideCircleHelp,
      lucideClock,
      lucideHistory,
      lucideMic,
      lucidePanelRight,
      lucideSparkles,
      lucideX,
    }),
  ],
  host: { class: 'flex min-h-0 flex-1 flex-col' },
  template: `
    <div class="flex min-h-0 flex-1 flex-col gap-3 md:flex-row md:gap-4">
      <!-- Main column -->
      <div class="flex min-h-0 min-w-0 flex-1 flex-col">
        <!-- Header -->
        <div class="mb-2 flex items-center justify-between gap-3">
          <div class="min-w-0">
            <h1 class="truncate text-lg font-bold tracking-tight">
              {{ 'discovery.title' | transloco }}
            </h1>
            <p class="truncate text-xs text-muted-foreground">
              {{ 'discovery.subtitle' | transloco }}
            </p>
          </div>
          <div class="flex shrink-0 items-center gap-1.5">
            <a
              [routerLink]="['history']"
              hlmBtn
              variant="outline"
              size="sm"
              data-testid="discovery-history"
            >
              <hlm-icon name="lucideHistory" size="15px" />
              {{ 'discovery.history.button' | transloco }}
            </a>
            <button
              type="button"
              hlmBtn
              variant="outline"
              size="sm"
              (click)="panelOpen.set(!panelOpen())"
              data-testid="discovery-panel-toggle"
            >
              <hlm-icon name="lucidePanelRight" size="15px" />
              {{ 'discovery.panel.toggle' | transloco }}
            </button>
          </div>
        </div>

        <!-- Persistent session bar (sticky) -->
        @if (recording.isActive()) {
          <div class="sticky top-0 z-20 mb-2">
            <app-session-bar
              (pauseSession)="pause()"
              (resumeSession)="resume()"
              (stopSession)="stop()"
            />
          </div>
        }

        <!-- Pending-from-previous chip -->
        @if (store.pendingPrevious().length > 0) {
          <button
            type="button"
            (click)="openPendingPrevious()"
            class="mb-2 inline-flex w-fit items-center gap-2 self-center rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-sm font-medium text-amber-600 transition-colors hover:bg-amber-500/20"
            data-testid="pending-previous-chip"
          >
            <hlm-icon name="lucideClock" size="14px" />
            {{
              'discovery.pendingPrevious' | transloco: { count: store.pendingPrevious().length }
            }}
          </button>
        }

        <!-- Feed -->
        <div
          #feed
          (scroll)="onScroll()"
          class="relative flex flex-1 flex-col gap-4 overflow-y-auto rounded-2xl border border-border bg-card/30 p-4"
          data-testid="discovery-feed"
        >
          @switch (store.state()) {
            @case ('loading') {
              <div class="flex flex-1 items-center justify-center">
                <hlm-spinner class="h-6 w-6" />
              </div>
            }
            @case ('error') {
              <p class="py-10 text-center text-sm text-destructive">
                {{ 'discovery.loadError' | transloco }}
              </p>
            }
            @default {
              @if (store.hasOlder()) {
                <div class="flex justify-center">
                  <button
                    type="button"
                    (click)="store.loadOlder()"
                    [disabled]="store.loadingOlder()"
                    class="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
                    data-testid="load-older"
                  >
                    @if (store.loadingOlder()) {
                      <hlm-spinner class="h-3 w-3" />
                    }
                    {{ 'discovery.loadOlder' | transloco }}
                  </button>
                </div>
              }

              @if (store.blocks().length === 0) {
                <div class="flex flex-1 flex-col items-center justify-center gap-3 text-center">
                  <span
                    class="grid h-12 w-12 place-items-center rounded-xl bg-primary/10 text-primary"
                  >
                    <hlm-icon name="lucideMic" size="22px" />
                  </span>
                  <div>
                    <p class="font-medium">{{ 'discovery.emptyTitle' | transloco }}</p>
                    <p class="text-sm text-muted-foreground">
                      {{ 'discovery.emptyBody' | transloco }}
                    </p>
                  </div>
                </div>
              }

              @for (block of store.blocks(); track block.session.id) {
                <div [attr.data-session-id]="block.session.id" class="flex flex-col gap-3">
                  <!-- Session separator -->
                  <div class="flex items-center gap-3 py-1">
                    <span class="h-px flex-1 bg-border"></span>
                    <span class="text-xs font-medium text-muted-foreground">
                      {{ 'discovery.sessionSeparator' | transloco }}
                      {{ block.session.startedAt ?? block.session.createdAt | date: 'MMM d · HH:mm' }}
                      @if (block.session.storiesGeneratedCount !== null && block.session.storiesGeneratedCount !== undefined) {
                        ·
                        {{
                          'discovery.sessionStories'
                            | transloco: { count: block.session.storiesGeneratedCount }
                        }}
                      }
                    </span>
                    <span class="h-px flex-1 bg-border"></span>
                  </div>

                  @if (!block.loaded) {
                    <div class="flex justify-center py-2"><hlm-spinner class="h-4 w-4" /></div>
                  }

                  @for (item of block.items; track item.id) {
                    @switch (item.kind) {
                      @case ('paragraph') {
                        <div class="max-w-[80%] rounded-2xl bg-secondary px-3.5 py-2">
                          <p class="text-sm leading-relaxed">{{ item.text }}</p>
                        </div>
                      }
                      @case ('segment') {
                        <div
                          class="max-w-[80%] rounded-2xl bg-secondary px-3.5 py-2"
                          [class.opacity-60]="!item.segment.isFinal"
                        >
                          <p class="text-sm leading-relaxed">{{ item.segment.text }}</p>
                        </div>
                      }
                      @case ('decision') {
                        <div
                          class="self-center rounded-xl border px-3.5 py-2.5 text-sm"
                          [class]="decisionClass(item.decision.outcome)"
                          data-testid="decision-entry"
                        >
                          <span class="inline-flex items-center gap-1.5 font-medium">
                            @switch (item.decision.type) {
                              @case ('CLARIFYING_QUESTION') {
                                <hlm-icon name="lucideCircleHelp" size="14px" />
                              }
                              @default {
                                @if (item.decision.outcome === 'ACCEPTED') {
                                  <hlm-icon name="lucideCheck" size="14px" />
                                } @else {
                                  <hlm-icon name="lucideX" size="14px" />
                                }
                              }
                            }
                            {{ decisionLabel(item.decision.type, item.decision.outcome) }}
                          </span>
                          @if (item.decision.label) {
                            <span class="ml-1 text-muted-foreground">— {{ item.decision.label }}</span>
                          }
                        </div>
                      }
                      @case ('story') {
                        <div
                          class="rounded-2xl border border-border bg-card p-3.5"
                          data-testid="feed-story"
                        >
                          <span
                            class="mb-1 inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary"
                          >
                            <hlm-icon name="lucideSparkles" size="11px" />
                            {{ 'discovery.generatedStory' | transloco }}
                          </span>
                          <p class="text-sm font-medium">{{ item.story.title }}</p>
                          <p class="mt-1 text-sm leading-relaxed text-muted-foreground">
                            {{ 'discovery.story.as' | transloco }}
                            <span class="text-foreground">{{ item.story.role }}</span
                            >{{ 'discovery.story.want' | transloco }}
                            <span class="text-foreground">{{ item.story.action }}</span
                            >{{ 'discovery.story.soThat' | transloco }}
                            <span class="text-foreground">{{ item.story.benefit }}</span
                            >.
                          </p>
                        </div>
                      }
                    }
                  }
                </div>
              }
            }
          }
        </div>

        <!-- Composer -->
        <div class="mt-3 flex items-center gap-2">
          <div class="relative flex-1" [title]="'discovery.composer.comingSoon' | transloco">
            <input
              type="text"
              disabled
              [placeholder]="'discovery.composer.placeholder' | transloco"
              class="h-11 w-full cursor-not-allowed rounded-full border border-border bg-secondary/40 px-4 text-sm text-muted-foreground outline-none"
              data-testid="composer-input"
            />
          </div>
          @if (canRecord()) {
            <button
              type="button"
              hlmBtn
              [disabled]="recording.busy() || recording.isActive()"
              (click)="record()"
              [attr.aria-label]="'discovery.composer.record' | transloco"
              class="h-11 w-11 shrink-0 rounded-full p-0"
              data-testid="composer-record"
            >
              @if (recording.busy()) {
                <hlm-spinner class="h-4 w-4" />
              } @else {
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <path
                    d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3ZM19 10v2a7 7 0 0 1-14 0v-2M12 19v4"
                  />
                </svg>
              }
            </button>
          }
        </div>
        @if (recorder.error(); as errKey) {
          <p class="mt-1.5 text-center text-xs text-destructive">{{ errKey | transloco }}</p>
        }
      </div>

      <!-- Side panel: full-screen modal on mobile, fixed-width column on desktop.
           The header "Panel" button toggles it on every breakpoint. -->
      @if (panelOpen()) {
        <aside
          class="fixed inset-0 z-40 md:static md:z-auto md:min-h-0 md:w-[340px] md:shrink-0"
        >
          <app-side-panel [projectId]="projectId()" [(open)]="panelOpen" [(focusStoryId)]="focusStoryId" />
        </aside>
      }
    </div>

    <!-- Floating decision queue -->
    <app-decision-queue
      [canDecide]="canDecide()"
      (decideAccept)="accept($event.suggestion, $event.body)"
      (decideDismiss)="dismiss($event)"
      (openTarget)="focusStory($event)"
    />
  `,
})
export class DiscoveryChat implements OnInit {
  protected readonly store = inject(DiscoveryChatStore);
  protected readonly recording = inject(SessionRecordingService);
  protected readonly recorder = inject(AudioRecorderService);
  private readonly auth = inject(AuthStore);
  private readonly workspace = inject(WorkspaceStore);
  private readonly toast = inject(ToastService);
  private readonly transloco = inject(TranslocoService);
  private readonly route = inject(ActivatedRoute);

  readonly projectId = input.required<string>();

  private readonly feed = viewChild<ElementRef<HTMLElement>>('feed');
  protected readonly panelOpen = signal(true);
  protected readonly focusStoryId = signal<string | null>(null);

  /** Owner/admin gate reused from the workspace pages (fine-grained perms not client-side yet). */
  protected readonly canManage = computed(() => {
    const user = this.auth.user();
    if (!user) return false;
    const orgId = this.auth.organizationId();
    const org = this.workspace.organizations().find((o) => o.id === orgId);
    return org?.ownerId === user.id;
  });
  protected readonly canRecord = this.canManage;
  protected readonly canDecide = this.canManage;

  constructor() {
    // Scroll a freshly focused session into view (history row click / new session).
    effect(() => {
      const sessionId = this.store.focusSessionId();
      if (!sessionId) return;
      setTimeout(() => {
        const el = this.feed()?.nativeElement.querySelector(
          `[data-session-id="${CSS.escape(sessionId)}"]`,
        );
        el?.scrollIntoView({ block: 'start', behavior: 'smooth' });
        this.store.clearFocus();
      }, 60);
    });
  }

  ngOnInit(): void {
    this.store.init(this.projectId());
    // History click-through: ?session=<id> reveals that session in the feed.
    const focus = this.route.snapshot.queryParamMap.get('session');
    if (focus) this.store.showSession(focus);
  }

  /** Lazy-loads older sessions when the feed is scrolled near the top. */
  protected onScroll(): void {
    const el = this.feed()?.nativeElement;
    if (el && el.scrollTop < 80) this.store.loadOlder();
  }

  protected async record(): Promise<void> {
    const granted = await this.recorder.requestPermission();
    if (!granted) return;
    const language = this.projectLanguage();
    this.recording
      .start(this.projectId(), { title: this.defaultTitle(), language })
      .subscribe({
        next: (session) => this.store.addNewSession(session),
        error: (err: HttpErrorResponse) => this.handleStartError(err),
      });
  }

  private handleStartError(err: HttpErrorResponse): void {
    const code = (err.error as { code?: string } | null)?.code;
    if (err.status === 409 && code === 'SESSION_ALREADY_ACTIVE') {
      const activeId = (err.error as { sessionId?: string } | null)?.sessionId;
      this.toast.info(this.transloco.translate('discovery.errors.alreadyActive'));
      if (activeId) this.store.showSession(activeId);
      return;
    }
    this.toast.error(this.transloco.translate('discovery.errors.startFailed'));
  }

  protected pause(): void {
    this.recording.pause()?.subscribe({
      error: () => this.toast.error(this.transloco.translate('discovery.errors.transitionFailed')),
    });
  }

  protected resume(): void {
    this.recording.resume()?.subscribe({
      error: () => this.toast.error(this.transloco.translate('discovery.errors.transitionFailed')),
    });
  }

  protected stop(): void {
    this.recording.stop()?.subscribe({
      error: () => this.toast.error(this.transloco.translate('discovery.errors.transitionFailed')),
    });
  }

  protected openPendingPrevious(): void {
    this.store.openPendingPrevious();
  }

  protected accept(suggestion: SuggestionResponse, body: AcceptSuggestionRequest): void {
    this.store.decide(suggestion, 'ACCEPTED', body).subscribe({
      error: (err: HttpErrorResponse) => this.handleDecideError(err, suggestion.id),
    });
  }

  protected dismiss(suggestion: SuggestionResponse): void {
    this.store.decide(suggestion, 'DISMISSED').subscribe({
      error: (err: HttpErrorResponse) => this.handleDecideError(err, suggestion.id),
    });
  }

  /** 409 = someone else already resolved it: drop the card silently, toast info. */
  private handleDecideError(err: HttpErrorResponse, suggestionId: string): void {
    if (err.status === 409) {
      this.store.removeQueued(suggestionId);
      this.toast.info(this.transloco.translate('discovery.errors.alreadyResolved'));
      return;
    }
    this.toast.error(this.transloco.translate('discovery.errors.decideFailed'));
  }

  protected focusStory(storyId: string): void {
    this.panelOpen.set(true);
    this.focusStoryId.set(storyId);
  }

  protected decisionClass(outcome: 'ACCEPTED' | 'DISMISSED'): string {
    return outcome === 'ACCEPTED'
      ? 'border-emerald-500/30 bg-emerald-500/10'
      : 'border-border bg-secondary/60 text-muted-foreground';
  }

  protected decisionLabel(type: string, outcome: 'ACCEPTED' | 'DISMISSED'): string {
    if (type === 'CLARIFYING_QUESTION') {
      return this.transloco.translate('discovery.decision.question');
    }
    return this.transloco.translate(
      outcome === 'ACCEPTED' ? 'discovery.decision.accepted' : 'discovery.decision.dismissed',
    );
  }

  /** Recording language: the org's meeting language, defaulting to Spanish (Peru). */
  private projectLanguage(): string {
    const org = this.workspace
      .organizations()
      .find((o) => o.id === this.auth.organizationId());
    return org?.meetingLanguage || 'es-PE';
  }

  private defaultTitle(): string {
    const now = new Date();
    return this.transloco.translate('discovery.sessionDefaultTitle', {
      date: now.toLocaleDateString(),
    });
  }
}
