import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  OnDestroy,
  OnInit,
  computed,
  effect,
  inject,
  input,
  linkedSignal,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { provideIcons } from '@ng-icons/core';
import {
  lucideArrowDown,
  lucideArrowUpRight,
  lucideCheck,
  lucideCircleHelp,
  lucideClock,
  lucideHistory,
  lucideLanguages,
  lucideMic,
  lucidePanelRight,
  lucideSparkles,
  lucideX,
} from '@ng-icons/lucide';
import { AuthStore } from '../../../../core/auth/auth.store';
import { WorkspaceStore } from '../../../workspace/data/workspace.store';
import { ToastService } from '../../../../shared/toast/toast.service';
import { AudioRecorderService } from '../../../../core/audio/audio-recorder.service';
import { DiscoveryChatStore, RenderBlock } from '../../data/discovery-chat.store';
import { SessionRecordingService } from '../../data/session-recording.service';
import { MockSuggestionService } from '../../data/mock-suggestion.service';
import { SpeakerDisplay } from '../../data/feed';
import { RelativeTime, relativeTime } from '../../data/relative-time';
import {
  AcceptSuggestionRequest,
  SessionTranscriptSegmentMessage,
  SuggestionResponse,
} from '../../data/discovery.models';
import { SessionBar } from '../../components/session-bar/session-bar';
import { DecisionQueue } from '../../components/decision-queue/decision-queue';
import { SidePanel } from '../../components/side-panel/side-panel';
import { Select, SelectOption } from '../../../../shared/components/select/select';
import { Modal } from '../../../../shared/components/modal/modal';
import { DISCOVERY_LANGUAGES } from '../../data/discovery-languages';
import { languageStorageKey, resolveInitialLanguage } from '../../data/language-preference';
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
    Select,
    Modal,
    HlmButton,
    HlmIcon,
    HlmSpinner,
  ],
  viewProviders: [
    provideIcons({
      lucideArrowDown,
      lucideArrowUpRight,
      lucideCheck,
      lucideCircleHelp,
      lucideClock,
      lucideHistory,
      lucideLanguages,
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
            <!-- Meeting language: editable until a session is live, then locked to
                 the SESSION's language so every viewer sees the actual meeting
                 language rather than their own preference. -->
            @if (liveLanguageLabel(); as lockedLabel) {
              <span
                class="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-secondary/50 px-2.5 text-xs font-medium text-muted-foreground"
                [title]="'discovery.language.locked' | transloco"
                data-testid="discovery-language-locked"
              >
                <hlm-icon name="lucideLanguages" size="14px" />
                <span class="hidden sm:inline">{{ lockedLabel }}</span>
                <span class="sm:hidden">{{ liveLanguageAbbrev() }}</span>
              </span>
            } @else {
              <app-select
                size="sm"
                [searchable]="true"
                [options]="languageOptions()"
                [value]="language()"
                (valueChange)="setLanguage($event)"
                [compactLabel]="languageAbbrevValue()"
                [ariaLabel]="'discovery.language.label' | transloco"
                [searchPlaceholder]="'discovery.language.search' | transloco"
                [emptyText]="'discovery.language.empty' | transloco"
                data-testid="discovery-language"
              />
            }
            <a
              [routerLink]="['history']"
              hlmBtn
              variant="outline"
              size="sm"
              class="gap-0 px-2 sm:gap-2 sm:px-3"
              [attr.aria-label]="'discovery.history.button' | transloco"
              [title]="'discovery.history.button' | transloco"
              data-testid="discovery-history"
            >
              <hlm-icon name="lucideHistory" size="15px" />
              <span class="hidden sm:inline">{{ 'discovery.history.button' | transloco }}</span>
            </a>
            <button
              type="button"
              hlmBtn
              variant="outline"
              size="sm"
              class="gap-0 px-2 sm:gap-2 sm:px-3"
              (click)="panelOpen.set(!panelOpen())"
              [attr.aria-label]="'discovery.panel.toggle' | transloco"
              [title]="'discovery.panel.toggle' | transloco"
              data-testid="discovery-panel-toggle"
            >
              <hlm-icon name="lucidePanelRight" size="15px" />
              <span class="hidden sm:inline">{{ 'discovery.panel.toggle' | transloco }}</span>
            </button>
            <!-- DEV-ONLY mock suggestion toggle: never rendered in production. -->
            @if (mock.available) {
              <button
                type="button"
                hlmBtn
                [variant]="mock.running() ? 'default' : 'outline'"
                size="sm"
                class="gap-0 px-2 sm:gap-2 sm:px-3"
                (click)="mock.toggle()"
                [attr.aria-label]="'discovery.mock.hint' | transloco"
                [title]="'discovery.mock.hint' | transloco"
                data-testid="discovery-mock-toggle"
              >
                🧪<span class="hidden sm:inline">{{
                  (mock.running() ? 'discovery.mock.on' : 'discovery.mock.off') | transloco
                }}</span>
              </button>
            }
          </div>
        </div>

        <!-- Persistent session bar (sticky) — exclusive to users who can record. -->
        @if (canRecord() && recording.isActive()) {
          <div class="sticky top-0 z-20 mb-2">
            <app-session-bar
              (pauseSession)="pause()"
              (resumeSession)="resume()"
              (stopSession)="stop()"
            />
          </div>
        } @else if (liveLanguageLabel(); as liveLabel) {
          <!-- Viewers get a subtle indicator instead of the recorder's controls. -->
          <div
            class="mb-2 flex items-center gap-2.5 rounded-xl border border-border bg-card/70 px-3 py-2 text-sm"
            data-testid="live-session-banner"
          >
            <span class="relative flex h-2.5 w-2.5" aria-hidden="true">
              <span
                class="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-60"
              ></span>
              <span class="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500"></span>
            </span>
            {{ 'discovery.live.banner' | transloco: { language: liveLabel } }}
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
            {{ 'discovery.pendingPrevious' | transloco: { count: store.pendingPrevious().length } }}
          </button>
        }

        <!-- Feed -->
        <div
          #feed
          (scroll)="onScroll()"
          class="scrollbar-thin relative flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto rounded-2xl border border-border bg-card/30 p-4"
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
              @if (store.loadingOlder()) {
                <div
                  class="flex items-center justify-center gap-2 py-1 text-xs text-muted-foreground"
                  data-testid="loading-older"
                >
                  <hlm-spinner class="h-3 w-3" />
                  {{ 'discovery.loadingOlder' | transloco }}
                </div>
              } @else if (!store.hasOlder() && store.blocks().length > 0 && projectCreatedAt()) {
                <div class="flex items-center gap-3 py-1" data-testid="feed-start-marker">
                  <span class="h-px flex-1 bg-border"></span>
                  <span class="text-xs font-medium text-muted-foreground">
                    {{
                      'discovery.startMarker'
                        | transloco: { date: projectCreatedAt() | date: 'mediumDate' }
                    }}
                  </span>
                  <span class="h-px flex-1 bg-border"></span>
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
                  <!-- Session separator (sticks to the top of the feed while this
                       session's messages are on screen, WhatsApp/iMessage-style). -->
                  <div class="sticky top-0 z-10 -mx-1 flex items-center gap-3 py-1.5">
                    <span class="h-px flex-1 bg-border"></span>
                    @let sessionAt = block.session.startedAt ?? block.session.createdAt;
                    <span
                      class="rounded-full border border-border bg-card/85 px-2.5 py-0.5 text-xs font-medium text-muted-foreground shadow-sm backdrop-blur"
                      [title]="sessionAt | date: 'd MMM y, HH:mm'"
                    >
                      {{ 'discovery.sessionSeparator' | transloco }}
                      @let sessionTime = timeLabel(sessionAt);
                      @if (sessionTime.kind === 'relative') {
                        {{ sessionTime.key | transloco: sessionTime.params }}
                      } @else {
                        {{ sessionAt | date: 'MMM d · HH:mm' }}
                      }
                      @if (
                        block.session.storiesGeneratedCount !== null &&
                        block.session.storiesGeneratedCount !== undefined
                      ) {
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
                        @let speaker = speakerFor(block, item.segment);
                        <div
                          class="flex max-w-[80%] flex-col"
                          [class.self-end]="speaker?.side === 'right'"
                          [class.items-end]="speaker?.side === 'right'"
                          data-testid="segment-bubble"
                          [attr.data-side]="speaker?.side ?? 'left'"
                        >
                          @if (speaker) {
                            <span
                              class="mb-0.5 px-1 text-[11px] font-medium text-muted-foreground"
                              data-testid="segment-speaker"
                            >
                              {{ 'discovery.speaker' | transloco: { n: speaker.index } }}
                            </span>
                          }
                          <div
                            class="group rounded-2xl px-3.5 py-2"
                            [class]="segmentBubbleClass(speaker)"
                            [class.opacity-60]="!item.segment.isFinal"
                          >
                            <p class="text-sm leading-relaxed">{{ item.segment.text }}</p>
                            <!-- Segments keep the meeting's internal clock (absolute HH:mm),
                                 revealed on hover; full datetime in the tooltip. -->
                            <p
                              class="mt-0.5 text-[11px] text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
                              [title]="item.segment.occurredAt | date: 'd MMM y, HH:mm'"
                            >
                              {{ item.segment.occurredAt | date: 'HH:mm' }}
                            </p>
                          </div>
                        </div>
                      }
                      @case ('decision') {
                        <div
                          class="group flex w-full max-w-[80%] flex-col gap-2 self-center rounded-2xl border px-3.5 py-2.5 text-sm"
                          [class]="decisionClass(item.decision.outcome)"
                          [class.opacity-75]="item.decision.outcome === 'DISMISSED'"
                          data-testid="decision-entry"
                          [attr.data-outcome]="item.decision.outcome"
                        >
                          <!-- Top row: outcome + type badge on the left, action on the right. -->
                          <div class="flex items-start justify-between gap-2">
                            <div class="flex min-w-0 flex-wrap items-center gap-1.5">
                              <span class="inline-flex items-center gap-1.5 font-medium">
                                @if (item.decision.outcome === 'ACCEPTED') {
                                  <hlm-icon name="lucideCheck" size="14px" />
                                  {{ 'discovery.decision.accepted' | transloco }}
                                } @else {
                                  <hlm-icon name="lucideX" size="14px" />
                                  {{ 'discovery.decision.dismissed' | transloco }}
                                }
                              </span>
                              <span
                                class="inline-flex items-center rounded-full border border-border bg-background/60 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide"
                                data-testid="decision-type"
                              >
                                @if (item.decision.type === 'CLARIFYING_QUESTION') {
                                  <hlm-icon name="lucideCircleHelp" size="10px" class="mr-1" />
                                }
                                {{ 'discovery.suggestion.type.' + item.decision.type | transloco }}
                              </span>
                            </div>
                            @if (item.decision.storyId) {
                              <button
                                type="button"
                                (click)="focusStory(item.decision.storyId)"
                                class="inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-primary transition-colors hover:bg-primary/10 hover:underline"
                                [attr.aria-label]="'discovery.goToStory' | transloco"
                                [title]="'discovery.goToStory' | transloco"
                                data-testid="decision-go-to-story"
                              >
                                <hlm-icon name="lucideArrowUpRight" size="12px" />
                                {{ 'discovery.goToStory' | transloco }}
                              </button>
                            }
                          </div>

                          <!-- Label, struck through for a dismissed suggestion. -->
                          @if (item.decision.label) {
                            <p
                              class="leading-relaxed"
                              [class.text-muted-foreground]="item.decision.outcome === 'DISMISSED'"
                              [class.line-through]="item.decision.outcome === 'DISMISSED'"
                              data-testid="decision-label"
                            >
                              {{ item.decision.label }}
                            </p>
                          }

                          <!-- Relative time bottom-right, revealed on hover; full
                               datetime in the tooltip, absolute fallback ≥ 7d. -->
                          @let decisionTime = timeLabel(item.decision.occurredAt);
                          <span
                            class="self-end text-[11px] opacity-0 transition-opacity group-hover:opacity-100"
                            [title]="item.decision.occurredAt | date: 'd MMM y, HH:mm'"
                          >
                            @if (decisionTime.kind === 'relative') {
                              {{ decisionTime.key | transloco: decisionTime.params }}
                            } @else {
                              {{ item.decision.occurredAt | date: 'd MMM' }}
                            }
                          </span>
                        </div>
                      }
                      @case ('story') {
                        <div
                          class="group rounded-2xl border border-border bg-card p-3.5"
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
                          <div class="mt-1 flex items-center gap-2">
                            @if (item.story.createdAt; as storyAt) {
                              <!-- Relative time revealed on hover (like decisions);
                                   full datetime tooltip, absolute fallback ≥ 7d. -->
                              @let storyTime = timeLabel(storyAt);
                              <p
                                class="text-[11px] text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
                                [title]="storyAt | date: 'd MMM y, HH:mm'"
                              >
                                @if (storyTime.kind === 'relative') {
                                  {{ storyTime.key | transloco: storyTime.params }}
                                } @else {
                                  {{ storyAt | date: 'd MMM' }}
                                }
                              </p>
                            }
                            <button
                              type="button"
                              (click)="focusStory(item.story.id)"
                              class="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
                              [attr.aria-label]="'discovery.goToStory' | transloco"
                              [title]="'discovery.goToStory' | transloco"
                              data-testid="story-go-to-story"
                            >
                              <hlm-icon name="lucideArrowUpRight" size="12px" />
                              {{ 'discovery.goToStory' | transloco }}
                            </button>
                          </div>
                        </div>
                      }
                    }
                  }
                </div>
              }
            }
          }
          @if (!atBottom()) {
            <button
              type="button"
              (click)="jumpToBottom()"
              class="sticky bottom-2 z-10 inline-flex items-center gap-1.5 self-center rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium shadow-lg transition-colors hover:bg-accent"
              data-testid="scroll-bottom"
            >
              <hlm-icon name="lucideArrowDown" size="14px" />
              {{ 'discovery.scrollToBottom' | transloco }}
            </button>
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
        <aside class="fixed inset-0 z-40 md:static md:z-auto md:min-h-0 md:w-[340px] md:shrink-0">
          <app-side-panel
            [projectId]="projectId()"
            [(open)]="panelOpen"
            [(focusStoryId)]="focusStoryId"
          />
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

    <!-- Leave-while-recording confirmation (in-app navigation guard) -->
    <app-modal [(open)]="leaveOpen">
      <span modalTitle>{{ 'discovery.leaveGuard.title' | transloco }}</span>
      <p>{{ 'discovery.leaveGuard.body' | transloco }}</p>
      <button
        modalFooter
        hlmBtn
        size="sm"
        variant="ghost"
        type="button"
        (click)="resolveLeave(false)"
        data-testid="leave-cancel"
      >
        {{ 'discovery.leaveGuard.stay' | transloco }}
      </button>
      <button
        modalFooter
        hlmBtn
        size="sm"
        variant="destructive"
        type="button"
        (click)="resolveLeave(true)"
        data-testid="leave-confirm"
      >
        {{ 'discovery.leaveGuard.leave' | transloco }}
      </button>
    </app-modal>
  `,
})
export class DiscoveryChat implements OnInit, OnDestroy {
  protected readonly store = inject(DiscoveryChatStore);
  protected readonly recording = inject(SessionRecordingService);
  protected readonly recorder = inject(AudioRecorderService);
  private readonly auth = inject(AuthStore);
  private readonly workspace = inject(WorkspaceStore);
  private readonly toast = inject(ToastService);
  private readonly transloco = inject(TranslocoService);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  /** DEV-ONLY mock suggestion generator (no-op in production). */
  protected readonly mock = inject(MockSuggestionService);

  readonly projectId = input.required<string>();

  private readonly feed = viewChild<ElementRef<HTMLElement>>('feed');
  // Open by default only on desktop (md+, where the panel is a static side
  // column); on mobile it's a full-screen overlay, so it starts closed and is
  // opened explicitly (toggle button or jump-to-story) — reloading no longer
  // pops it over the chat.
  protected readonly panelOpen = signal(
    typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(min-width: 768px)').matches,
  );
  protected readonly focusStoryId = signal<string | null>(null);
  /** True while the feed is scrolled to (or near) the bottom — drives auto-stick and the jump button. */
  protected readonly atBottom = signal(true);
  /**
   * A coarse clock ticked every 60s, so the feed's relative timestamps ("5m ago")
   * age forward while the page stays open. Read by {@link timeLabel}.
   */
  protected readonly now = signal(Date.now());

  /** Controls the "leave while recording" confirmation modal (in-app nav guard). */
  protected readonly leaveOpen = signal(false);
  /** Resolver for the CanDeactivate promise, pending while the modal is open. */
  private leaveResolver: ((leave: boolean) => void) | null = null;

  /**
   * A key for the top (oldest loaded) content that changes whenever something is
   * prepended — a new older session OR older segments paged into the topmost
   * session. Watched to restore scroll position after the prepend.
   */
  private readonly topAnchor = computed(() => {
    const top = this.store.blocks()[0];
    return top ? `${top.session.id}:${top.items.length}` : null;
  });
  /** feed.scrollHeight captured right before an older-history load, to offset the prepend. */
  private pendingPrependHeight: number | null = null;

  /** The current project's creation date, for the "project created" start marker. */
  protected readonly projectCreatedAt = computed(
    () => this.workspace.projects().find((p) => p.id === this.projectId())?.createdAt ?? null,
  );
  /** Total feed entries across sessions; changes when transcript/decisions arrive, to trigger auto-stick. */
  protected readonly feedItemCount = computed(() =>
    this.store.blocks().reduce((total, block) => total + block.items.length, 0),
  );

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

  /**
   * Meeting language for the next session, editable until recording starts.
   * Precedence: the user's per-project localStorage override > org default.
   */
  protected readonly language = linkedSignal(() =>
    resolveInitialLanguage(this.storedLanguage(), this.projectLanguage()),
  );
  protected readonly languageOptions = computed<SelectOption[]>(() => {
    const base = DISCOVERY_LANGUAGES.map((l) => ({ value: l.code, label: l.label }));
    const current = this.language();
    return base.some((o) => o.value === current)
      ? base
      : [{ value: current, label: current }, ...base];
  });
  /**
   * The language of the session currently live on this project, or null when
   * nothing is live: the tracked recording session's first (recorder and
   * attached tabs), else the project-topic broadcast one (viewers).
   */
  protected readonly liveLanguage = computed<string | null>(() => {
    const own = this.recording.session();
    if (own) return own.language || null;
    return this.store.liveSession()?.language || null;
  });
  /** Endonym label for the live session's language (falls back to the raw code). */
  protected readonly liveLanguageLabel = computed<string | null>(() => {
    const code = this.liveLanguage();
    if (!code) return null;
    return DISCOVERY_LANGUAGES.find((l) => l.code === code)?.label ?? code;
  });
  /**
   * Uppercased primary subtag of the live session's language, for the mobile
   * abbreviation in the locked badge (e.g. `es-419` → "ES", `pt-BR` → "PT").
   */
  protected readonly liveLanguageAbbrev = computed<string | null>(() => {
    const code = this.liveLanguage();
    return code ? this.languageAbbrev(code) : null;
  });
  /** Uppercased primary subtag of the editable language, for the select's mobile trigger. */
  protected readonly languageAbbrevValue = computed(() => this.languageAbbrev(this.language()));

  /** The language code before any region subtag, uppercased (`es-419` → "ES"). */
  private languageAbbrev(code: string): string {
    return code.split('-')[0].toUpperCase();
  }

  constructor() {
    // Age the relative timestamps forward while the page is open (60s cadence is
    // plenty for "Nm ago" granularity). Cleared on destroy so no timer leaks.
    const ticker = setInterval(() => this.now.set(Date.now()), 60_000);
    this.destroyRef.onDestroy(() => clearInterval(ticker));
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
    // Auto-stick: when new transcript/decisions arrive and the user is already at the bottom, follow along.
    effect(() => {
      this.feedItemCount();
      if (untracked(() => this.atBottom())) setTimeout(() => this.scrollToBottom(), 0);
    });
    // If the leave modal is dismissed via backdrop/Escape (not the buttons),
    // treat it as "stay" so the router's CanDeactivate promise never hangs.
    effect(() => {
      if (!this.leaveOpen() && this.leaveResolver) {
        this.leaveResolver(false);
        this.leaveResolver = null;
      }
    });
    // Preserve scroll position when older sessions are prepended at the top: the
    // captured pre-load height lets us re-anchor scrollTop so the view never jumps.
    effect(() => {
      this.topAnchor();
      const before = untracked(() => this.pendingPrependHeight);
      if (before === null) return;
      this.pendingPrependHeight = null;
      setTimeout(() => {
        const el = this.feed()?.nativeElement;
        if (el) el.scrollTop += el.scrollHeight - before;
      }, 0);
    });
  }

  private scrollToBottom(): void {
    const el = this.feed()?.nativeElement;
    if (el) el.scrollTop = el.scrollHeight;
  }

  protected jumpToBottom(): void {
    this.atBottom.set(true);
    this.scrollToBottom();
  }

  ngOnInit(): void {
    this.store.init(this.projectId());
    // History click-through: ?session=<id> reveals that session in the feed.
    const focus = this.route.snapshot.queryParamMap.get('session');
    if (focus) this.store.showSession(focus);
    // DEV-ONLY: ?mock=1 auto-starts the mock suggestion generator (ignored in prod).
    if (this.mock.available && this.route.snapshot.queryParamMap.get('mock') === '1') {
      this.mock.start();
    }
  }

  ngOnDestroy(): void {
    this.mock.stop();
  }

  /** Lazy-loads older sessions when the feed is scrolled near the top, preserving scroll position. */
  protected onScroll(): void {
    const el = this.feed()?.nativeElement;
    if (!el) return;
    if (el.scrollTop < 120 && this.store.hasOlder() && !this.store.loadingOlder()) {
      // Capture the height before the prepend so the effect can re-anchor scrollTop.
      this.pendingPrependHeight = el.scrollHeight;
      this.store.loadOlder();
    }
    this.atBottom.set(el.scrollHeight - el.scrollTop - el.clientHeight < 120);
  }

  protected async record(): Promise<void> {
    const granted = await this.recorder.requestPermission();
    if (!granted) return;
    const language = this.language();
    this.recording.start(this.projectId(), { title: this.defaultTitle(), language }).subscribe({
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

  /**
   * CanDeactivate hook: while a session is live (RECORDING/PAUSED), in-app
   * navigation prompts a confirmation modal — the recording keeps running in the
   * background either way. Returns true immediately when nothing is recording.
   */
  canLeave(): boolean | Promise<boolean> {
    if (!this.recording.isActive()) return true;
    this.leaveOpen.set(true);
    return new Promise<boolean>((resolve) => {
      this.leaveResolver = resolve;
    });
  }

  /** Resolves the pending CanDeactivate promise and closes the modal. */
  protected resolveLeave(leave: boolean): void {
    this.leaveOpen.set(false);
    this.leaveResolver?.(leave);
    this.leaveResolver = null;
  }

  /**
   * The relative-time label for a feed timestamp, evaluated against the ticking
   * {@link now} clock so it refreshes as the page ages. Returns a tagged union:
   * `relative` carries a Transloco key/params the template renders; `absolute`
   * signals the template to fall back to the `date` pipe (items ≥ 7 days old).
   */
  protected timeLabel(iso: string): RelativeTime {
    return relativeTime(iso, this.now());
  }

  protected decisionClass(outcome: 'ACCEPTED' | 'DISMISSED'): string {
    return outcome === 'ACCEPTED'
      ? 'border-emerald-500/30 bg-emerald-500/10'
      : 'border-border bg-secondary/60 text-muted-foreground';
  }

  /**
   * The stable speaker display for a segment, or undefined when the session has
   * no diarization (no labeled segments) — in which case every bubble keeps the
   * default single-column left layout.
   */
  protected speakerFor(
    block: RenderBlock,
    segment: SessionTranscriptSegmentMessage,
  ): SpeakerDisplay | undefined {
    const label = segment.speakerLabel?.trim();
    return label ? block.speakers.get(label) : undefined;
  }

  /** Bubble styling per side: the right (2nd) speaker gets the primary tint to read as "the other side". */
  protected segmentBubbleClass(speaker: SpeakerDisplay | undefined): string {
    return speaker?.side === 'right' ? 'bg-primary/10' : 'bg-secondary';
  }

  /** Picks a language and persists it as this user's per-project override. */
  protected setLanguage(code: string): void {
    this.language.set(code);
    try {
      localStorage.setItem(languageStorageKey(this.projectId()), code);
    } catch {
      // Storage can be unavailable (private mode / quota); the in-memory value still applies.
    }
  }

  /** This user's stored per-project language override, or null when absent/unreadable. */
  private storedLanguage(): string | null {
    try {
      return localStorage.getItem(languageStorageKey(this.projectId()));
    } catch {
      return null;
    }
  }

  /** The org's configured meeting language, or null when unset. */
  private projectLanguage(): string | null {
    const org = this.workspace.organizations().find((o) => o.id === this.auth.organizationId());
    return org?.meetingLanguage || null;
  }

  private defaultTitle(): string {
    const now = new Date();
    return this.transloco.translate('discovery.sessionDefaultTitle', {
      date: now.toLocaleDateString(),
    });
  }
}
