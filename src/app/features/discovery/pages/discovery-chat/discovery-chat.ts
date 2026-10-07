import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
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
  lucideCircleAlert,
  lucideCircleCheck,
  lucideCircleDashed,
  lucideCircleX,
  lucideClock,
  lucideHeadphones,
  lucideHistory,
  lucideInfo,
  lucideLanguages,
  lucideMic,
  lucidePanelRight,
  lucidePause,
  lucideRotateCw,
  lucideScreenShare,
  lucideSparkles,
  lucideTriangleAlert,
} from '@ng-icons/lucide';
import { AuthStore } from '../../../../core/auth/auth.store';
import { WorkspaceStore } from '../../../workspace/data/workspace.store';
import { ToastService } from '../../../../shared/toast/toast.service';
import { messageForError } from '../../../../core/errors/error-message';
import { AudioRecorderService } from '../../../../core/audio/audio-recorder.service';
import { AudioSource, supportsMeetingAudio } from '../../../../core/audio/audio-source';
import { DiscoveryChatStore, RenderBlock } from '../../data/discovery-chat.store';
import { SessionRecordingService } from '../../data/session-recording.service';
import { DecisionEntry, SpeakerDisplay } from '../../data/feed';
import { RelativeTime, relativeTime } from '../../data/relative-time';
import {
  AcceptSuggestionRequest,
  SessionTranscriptSegmentMessage,
  SuggestionResponse,
} from '../../data/discovery.models';
import { AiActivity, aiActivityFor } from '../../data/ai-activity';
import { SessionBar } from '../../components/session-bar/session-bar';
import { AudioSourcePicker } from '../../components/audio-source-picker/audio-source-picker';
import { ActiveParticipants } from '../../components/active-participants/active-participants';
import { DecisionQueue } from '../../components/decision-queue/decision-queue';
import { SidePanel } from '../../components/side-panel/side-panel';
import { Select, SelectOption } from '../../../../shared/components/select/select';
import { Modal } from '../../../../shared/components/modal/modal';
import { DISCOVERY_LANGUAGES } from '../../data/discovery-languages';
import { languageStorageKey, resolveInitialLanguage } from '../../data/language-preference';
import { audioSourceStorageKey, resolveAudioSource } from '../../data/audio-source-preference';
import { HlmButton, HlmIcon, HlmSpinner } from '../../../../shared/ui';

/**
 * The default discovery view. The center feed is a chronological, read-only
 * stream chunked by session: neutral transcript bubbles, compact human decision
 * rows (accepted = validated by the analyst), AI-generated stories and, at the
 * live edge, a status line saying what the AI is doing (listening, paused,
 * processing, failed). Scrolling to the top lazily loads older sessions. Pending
 * AI suggestions wait in a review tray docked over the top of the feed column —
 * never over the session bar or the side panel. The composer pairs the
 * audio-source picker (in person vs. virtual meeting) with the record button;
 * the side panel exposes the project's stories/info/glossary/constraints.
 */
@Component({
  selector: 'app-discovery-chat',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    DatePipe,
    TranslocoPipe,
    SessionBar,
    AudioSourcePicker,
    ActiveParticipants,
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
      lucideCircleAlert,
      lucideCircleCheck,
      lucideCircleDashed,
      lucideCircleX,
      lucideClock,
      lucideHeadphones,
      lucideHistory,
      lucideInfo,
      lucideLanguages,
      lucideMic,
      lucidePanelRight,
      lucidePause,
      lucideRotateCw,
      lucideScreenShare,
      lucideSparkles,
      lucideTriangleAlert,
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
            <!-- Live presence: who is currently viewing the live session. Renders
                 unconditionally for every role (unlike app-session-bar, which is
                 recorder-only) — this is the one place all members can see it. -->
            @if (store.activeParticipants(); as participants) {
              @if (participants.length > 0) {
                <app-active-participants [participants]="participants" class="mr-1" />
              }
            }
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
                class="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60 motion-reduce:animate-none"
              ></span>
              <span class="relative inline-flex h-2.5 w-2.5 rounded-full bg-primary"></span>
            </span>
            {{ 'discovery.live.banner' | transloco: { language: liveLabel } }}
          </div>
        }

        <!-- Pending-from-previous chip -->
        @if (store.pendingPrevious().length > 0) {
          <button
            type="button"
            (click)="openPendingPrevious()"
            class="mb-2 inline-flex w-fit items-center gap-2 self-center rounded-full border border-pending-border bg-pending-soft px-3 py-1.5 text-sm font-medium text-pending transition-colors hover:brightness-95"
            data-testid="pending-previous-chip"
          >
            <hlm-icon name="lucideClock" size="14px" />
            {{ 'discovery.pendingPrevious' | transloco: { count: store.pendingPrevious().length } }}
          </button>
        }

        <!-- Feed column: the transcript stream, with the AI review tray docked over its
             top edge (inside this relative box, so it never covers the session bar,
             the header actions or the side panel). -->
        <div class="relative flex min-h-0 flex-1 flex-col">
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
                <div
                  class="flex flex-1 flex-col items-center justify-center gap-3 py-10 text-center"
                >
                  <p class="text-sm text-destructive" role="alert">
                    {{ 'discovery.loadError' | transloco }}
                  </p>
                  <button
                    hlmBtn
                    size="sm"
                    variant="outline"
                    type="button"
                    (click)="retryLoad()"
                    data-testid="feed-retry"
                  >
                    <hlm-icon name="lucideRotateCw" size="14px" />
                    {{ 'discovery.retry' | transloco }}
                  </button>
                </div>
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
                    <!-- Session separator: a pill that sticks to the top of the feed while
                       this session's messages are on screen (no flanking rules, so it never
                       strikes through the bubbles scrolling under it). -->
                    <div class="pointer-events-none sticky top-0 z-10 flex justify-center py-1.5">
                      @let sessionAt = block.session.startedAt ?? block.session.createdAt;
                      <span
                        class="pointer-events-auto rounded-full border border-border bg-card/90 px-2.5 py-0.5 text-xs font-medium text-muted-foreground shadow-sm backdrop-blur"
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
                    </div>

                    @if (!block.loaded) {
                      <div class="flex justify-center py-2"><hlm-spinner class="h-4 w-4" /></div>
                    }

                    @for (item of block.items; track item.id) {
                      @switch (item.kind) {
                        @case ('paragraph') {
                          <div
                            class="max-w-[85%] rounded-2xl rounded-tl-md bg-secondary px-3.5 py-2"
                          >
                            <p class="text-sm leading-relaxed">{{ item.text }}</p>
                          </div>
                        }
                        @case ('segment') {
                          <!-- Transcript: neutral bubbles (speaker 1 filled, speaker 2 outlined),
                             so the conversation recedes behind AI and human decisions. -->
                          @let speaker = speakerFor(block, item.segment);
                          <div
                            class="flex max-w-[85%] flex-col"
                            [class.self-end]="speaker?.side === 'right'"
                            [class.items-end]="speaker?.side === 'right'"
                            data-testid="segment-bubble"
                            [attr.data-side]="speaker?.side ?? 'left'"
                          >
                            <span
                              class="mb-1 flex items-center gap-1.5 px-1 text-[11px] text-muted-foreground"
                            >
                              @if (speaker) {
                                <span class="font-medium" data-testid="segment-speaker">{{
                                  'discovery.speaker' | transloco: { n: speaker.index }
                                }}</span>
                                <span aria-hidden="true">·</span>
                              }
                              <time
                                class="tabular-nums"
                                [attr.datetime]="item.segment.occurredAt"
                                [title]="item.segment.occurredAt | date: 'd MMM y, HH:mm'"
                                >{{ item.segment.occurredAt | date: 'HH:mm' }}</time
                              >
                            </span>
                            <div
                              class="rounded-2xl px-3.5 py-2 text-foreground"
                              [class]="segmentBubbleClass(speaker)"
                              [class.opacity-60]="!item.segment.isFinal"
                            >
                              <p class="text-sm leading-relaxed">{{ item.segment.text }}</p>
                            </div>
                          </div>
                        }
                        @case ('decision') {
                          <!-- A human decision on an AI suggestion: a compact event row. Accepted
                             reads "validated by the analyst" (emerald), dismissed stays neutral. -->
                          @let accepted = item.decision.outcome === 'ACCEPTED';
                          <div
                            class="flex w-full max-w-[85%] items-start gap-2.5 self-center rounded-xl px-3 py-2 text-sm"
                            [class]="decisionClass(item.decision.outcome)"
                            data-testid="decision-entry"
                            [attr.data-outcome]="item.decision.outcome"
                          >
                            <hlm-icon
                              [name]="accepted ? 'lucideCircleCheck' : 'lucideCircleX'"
                              size="16px"
                              class="mt-0.5 shrink-0"
                              [class.text-verified]="accepted"
                              aria-hidden="true"
                            />
                            <div class="min-w-0 flex-1">
                              <p class="flex flex-wrap items-center gap-x-1.5 text-xs">
                                <span class="font-semibold" [class.text-verified]="accepted">{{
                                  decisionLabel(item.decision) | transloco
                                }}</span>
                                <span class="text-muted-foreground" data-testid="decision-type"
                                  >·
                                  {{
                                    'discovery.suggestion.type.' + item.decision.type | transloco
                                  }}</span
                                >
                                @let decisionTime = timeLabel(item.decision.occurredAt);
                                <time
                                  class="text-muted-foreground"
                                  [attr.datetime]="item.decision.occurredAt"
                                  [title]="item.decision.occurredAt | date: 'd MMM y, HH:mm'"
                                >
                                  ·
                                  @if (decisionTime.kind === 'relative') {
                                    {{ decisionTime.key | transloco: decisionTime.params }}
                                  } @else {
                                    {{ item.decision.occurredAt | date: 'd MMM' }}
                                  }
                                </time>
                              </p>
                              @if (item.decision.label) {
                                <p
                                  class="mt-0.5 leading-snug"
                                  [class.text-foreground]="accepted"
                                  [class.line-through]="!accepted"
                                  data-testid="decision-label"
                                >
                                  {{ item.decision.label }}
                                </p>
                              }
                            </div>
                            @if (item.decision.storyId) {
                              <button
                                type="button"
                                (click)="focusStory(item.decision.storyId)"
                                class="inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium text-primary transition-colors hover:bg-primary/10 hover:underline"
                                [attr.aria-label]="'discovery.goToStory' | transloco"
                                [title]="'discovery.goToStory' | transloco"
                                data-testid="decision-go-to-story"
                              >
                                <hlm-icon name="lucideArrowUpRight" size="12px" />
                                <span class="hidden sm:inline">{{
                                  'discovery.goToStory' | transloco
                                }}</span>
                              </button>
                            }
                          </div>
                        }
                        @case ('story') {
                          <!-- A story the AI generated when the session was processed: violet
                             provenance plus an explicit "awaiting review" state. -->
                          <div
                            class="rounded-2xl border border-ai-border bg-card p-3.5"
                            data-testid="feed-story"
                          >
                            <div class="mb-1.5 flex flex-wrap items-center gap-1.5">
                              <span
                                class="inline-flex items-center gap-1 rounded-full bg-ai-soft px-2 py-0.5 text-xs font-medium text-ai"
                              >
                                <hlm-icon name="lucideSparkles" size="12px" aria-hidden="true" />
                                {{ 'discovery.generatedStory' | transloco }}
                              </span>
                              <span
                                class="inline-flex items-center gap-1 rounded-full bg-pending-soft px-2 py-0.5 text-xs font-medium text-pending"
                              >
                                <hlm-icon
                                  name="lucideCircleDashed"
                                  size="12px"
                                  aria-hidden="true"
                                />
                                {{ 'discovery.pendingReview' | transloco }}
                              </span>
                            </div>
                            <p class="text-sm font-semibold">{{ item.story.title }}</p>
                            <p class="mt-1 text-sm leading-relaxed text-muted-foreground">
                              {{ 'discovery.story.as' | transloco }}
                              <span class="text-foreground">{{ item.story.role }}</span
                              >{{ 'discovery.story.want' | transloco }}
                              <span class="text-foreground">{{ item.story.action }}</span
                              >{{ 'discovery.story.soThat' | transloco }}
                              <span class="text-foreground">{{ item.story.benefit }}</span
                              >.
                            </p>
                            <div class="mt-2 flex items-center gap-2">
                              @if (item.story.createdAt; as storyAt) {
                                @let storyTime = timeLabel(storyAt);
                                <time
                                  class="text-xs text-muted-foreground"
                                  [attr.datetime]="storyAt"
                                  [title]="storyAt | date: 'd MMM y, HH:mm'"
                                >
                                  @if (storyTime.kind === 'relative') {
                                    {{ storyTime.key | transloco: storyTime.params }}
                                  } @else {
                                    {{ storyAt | date: 'd MMM' }}
                                  }
                                </time>
                              }
                              <button
                                type="button"
                                (click)="focusStory(item.story.id)"
                                class="ml-auto inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
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

                    <!-- What the AI is doing for this session right now: listening while
                       recording, waiting while paused, generating stories after Stop, or
                       why processing failed. A chat-style status line at the live edge. -->
                    @if (activityFor(block); as activity) {
                      <div
                        class="flex max-w-[85%] items-start gap-2.5 self-start rounded-2xl px-3.5 py-2.5 text-sm"
                        [class]="activityClass(activity.state)"
                        role="status"
                        data-testid="ai-activity"
                        [attr.data-state]="activity.state"
                      >
                        @switch (activity.state) {
                          @case ('listening') {
                            <span
                              class="ai-dots mt-1.5 flex shrink-0 items-center gap-1"
                              aria-hidden="true"
                            >
                              <span></span><span></span><span></span>
                            </span>
                          }
                          @case ('paused') {
                            <hlm-icon name="lucidePause" size="15px" class="mt-0.5 shrink-0" />
                          }
                          @case ('processing') {
                            <hlm-spinner class="mt-0.5 h-4 w-4 shrink-0" />
                          }
                          @case ('failed') {
                            <hlm-icon
                              name="lucideCircleAlert"
                              size="15px"
                              class="mt-0.5 shrink-0"
                            />
                          }
                        }
                        <div class="min-w-0">
                          <p class="font-medium text-foreground">
                            {{ 'discovery.ai.' + activity.state | transloco }}
                          </p>
                          @if (activity.detail; as detail) {
                            <p class="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                              {{ detail }}
                            </p>
                          } @else if (activity.state === 'listening' && activity.last) {
                            <p class="mt-0.5 text-xs text-muted-foreground">
                              {{
                                'discovery.ai.lastSuggestion'
                                  | transloco
                                    : {
                                        time: (activity.last.key | transloco: activity.last.params),
                                      }
                              }}
                            </p>
                          } @else {
                            <p class="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                              {{ 'discovery.ai.' + activity.state + 'Hint' | transloco }}
                            </p>
                          }
                        </div>
                      </div>
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

          <app-decision-queue
            [canDecide]="canDecide()"
            (decideAccept)="accept($event.suggestion, $event.body)"
            (decideDismiss)="dismiss($event)"
            (openTarget)="focusStory($event)"
          />
        </div>

        <!-- Composer: the source of the next recording and the record action. -->
        <div class="mt-3 flex items-center gap-2">
          <div
            class="relative hidden min-w-0 flex-1 sm:block"
            [title]="'discovery.composer.comingSoon' | transloco"
          >
            <input
              type="text"
              disabled
              [placeholder]="'discovery.composer.placeholder' | transloco"
              [attr.aria-label]="'discovery.composer.comingSoon' | transloco"
              class="h-11 w-full cursor-not-allowed rounded-full border border-border bg-secondary/40 px-4 text-sm text-muted-foreground outline-none"
              data-testid="composer-input"
            />
          </div>
          @if (canRecord()) {
            <!-- Locked once a session is live: the recorder owns the source then. -->
            <app-audio-source-picker
              class="min-w-0 flex-1 sm:flex-none"
              [value]="audioSource()"
              (valueChange)="setAudioSource($event)"
              [meetingSupported]="meetingSupported"
              [disabled]="startLocked()"
              (unavailablePicked)="meetingUnavailableHint.set(true)"
            />
            <button
              type="button"
              hlmBtn
              [disabled]="startLocked()"
              (click)="record()"
              [attr.aria-label]="'discovery.composer.record' | transloco"
              [title]="'discovery.composer.record' | transloco"
              class="h-11 w-11 shrink-0 gap-2 rounded-full p-0 sm:w-auto sm:px-5"
              data-testid="composer-record"
            >
              @if (recording.busy() || preparingCapture()) {
                <hlm-spinner class="h-4 w-4" />
              } @else {
                <span class="h-3 w-3 rounded-full bg-primary-foreground" aria-hidden="true"></span>
              }
              <span class="hidden sm:inline">{{
                'discovery.composer.recordShort' | transloco
              }}</span>
            </button>
          }
        </div>
        @if (recorder.error(); as errKey) {
          <div
            class="mt-2 flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-xs leading-relaxed text-foreground"
            role="alert"
            data-testid="recorder-error"
          >
            <hlm-icon
              name="lucideCircleAlert"
              size="14px"
              class="mt-px shrink-0 text-destructive"
            />
            <span>{{ errKey | transloco }}</span>
          </div>
        } @else if (recorder.notice(); as noticeKey) {
          <div
            class="mt-2 flex items-start gap-2 rounded-xl border border-pending-border bg-pending-soft px-3 py-2.5 text-xs leading-relaxed text-foreground"
            role="status"
            data-testid="recorder-notice"
          >
            <hlm-icon name="lucideTriangleAlert" size="14px" class="mt-px shrink-0 text-pending" />
            <span class="flex-1">{{ noticeKey | transloco }}</span>
            @if (canRecord() && noticeKey === 'discovery.rec.noMeetingAudio') {
              <button
                type="button"
                (click)="retryMeetingShare()"
                class="shrink-0 rounded-md px-1.5 py-0.5 font-medium text-foreground underline underline-offset-2 hover:bg-pending-soft"
                data-testid="recorder-notice-retry"
              >
                {{ 'discovery.bar.reshare' | transloco }}
              </button>
            }
          </div>
        } @else if (sourceHint(); as hint) {
          @if (hint === 'unsupported') {
            <p
              class="mt-2 flex items-start gap-2 px-1 text-xs leading-relaxed text-muted-foreground"
              data-testid="audio-source-hint"
            >
              <hlm-icon name="lucideInfo" size="14px" class="mt-px shrink-0" />
              <span>{{ 'discovery.source.unsupported' | transloco }}</span>
            </p>
          } @else {
            <!-- Virtual meeting: the two things to get right, before the browser's share
                 dialog covers the page. Calm and neutral — guidance, not a warning. -->
            <ul
              class="mt-2 flex flex-col gap-1.5 rounded-xl border border-border bg-card/70 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground"
              data-testid="audio-source-hint"
            >
              <li class="flex items-start gap-2">
                <hlm-icon
                  name="lucideScreenShare"
                  size="14px"
                  class="mt-px shrink-0 text-foreground"
                />
                <span>{{ 'discovery.source.hintShare' | transloco }}</span>
              </li>
              <li class="flex items-start gap-2">
                <hlm-icon
                  name="lucideHeadphones"
                  size="14px"
                  class="mt-px shrink-0 text-foreground"
                />
                <span>{{ 'discovery.source.hintHeadphones' | transloco }}</span>
              </li>
            </ul>
          }
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

    <!-- Screen readers hear the review queue grow (the tray itself is visual). -->
    <p class="sr-only" aria-live="polite" data-testid="queue-announcer">
      @if (store.queue().length > 0) {
        {{ 'discovery.queue.announce' | transloco: { count: store.queue().length } }}
      }
    </p>

    <style>
      .ai-dots span {
        width: 0.375rem;
        height: 0.375rem;
        border-radius: 9999px;
        background: currentColor;
        opacity: 0.85;
      }
      @media (prefers-reduced-motion: no-preference) {
        .ai-dots span {
          animation: ai-dot 1.4s ease-in-out infinite;
        }
        .ai-dots span:nth-child(2) {
          animation-delay: 0.18s;
        }
        .ai-dots span:nth-child(3) {
          animation-delay: 0.36s;
        }
      }
      @keyframes ai-dot {
        0%,
        70%,
        100% {
          opacity: 0.35;
          transform: translateY(0);
        }
        35% {
          opacity: 1;
          transform: translateY(-2px);
        }
      }
    </style>

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
export class DiscoveryChat implements OnInit {
  protected readonly store = inject(DiscoveryChatStore);
  protected readonly recording = inject(SessionRecordingService);
  protected readonly recorder = inject(AudioRecorderService);
  private readonly auth = inject(AuthStore);
  private readonly workspace = inject(WorkspaceStore);
  private readonly toast = inject(ToastService);
  private readonly transloco = inject(TranslocoService);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

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
  /** Whether this browser can capture a virtual meeting's audio (desktop Chromium). */
  protected readonly meetingSupported = supportsMeetingAudio();
  /**
   * Audio source for the next session: the user's last choice (localStorage),
   * falling back to the microphone where meeting capture is unavailable.
   */
  protected readonly audioSource = linkedSignal<AudioSource>(() =>
    resolveAudioSource(this.storedAudioSource(), this.meetingSupported),
  );
  /** Set when the unavailable "virtual meeting" option is tapped, to explain why. */
  protected readonly meetingUnavailableHint = signal(false);
  /** True while the share picker / mic prompt is open, so a second click can't stack another. */
  protected readonly preparingCapture = signal(false);
  /** The record button and source picker stay locked while starting or once a session is live. */
  protected readonly startLocked = computed(
    () => this.recording.busy() || this.recording.isActive() || this.preparingCapture(),
  );
  /**
   * The composer's guidance line before recording: why the virtual option is
   * unavailable, or how to share the meeting audio (and to wear headphones).
   */
  protected readonly sourceHint = computed<'unsupported' | 'meeting' | null>(() => {
    if (!this.canRecord() || this.recording.isActive()) return null;
    if (this.meetingUnavailableHint()) return 'unsupported';
    return this.audioSource() === 'meeting' ? 'meeting' : null;
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
    if (this.startLocked()) return;
    this.preparingCapture.set(true);
    // Must stay the first await: the meeting source opens the screen-share
    // picker, which needs this click's transient activation.
    const granted = await this.recorder.requestPermission(this.audioSource());
    this.preparingCapture.set(false);
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
    this.toast.error(messageForError(err, this.transloco));
  }

  protected pause(): void {
    this.recording.pause()?.subscribe({
      error: (err) => this.toast.error(messageForError(err, this.transloco)),
    });
  }

  protected resume(): void {
    this.recording.resume()?.subscribe({
      error: (err) => this.toast.error(messageForError(err, this.transloco)),
    });
  }

  protected stop(): void {
    this.recording.stop()?.subscribe({
      error: (err) => this.toast.error(messageForError(err, this.transloco)),
    });
  }

  protected openPendingPrevious(): void {
    this.store.openPendingPrevious();
  }

  protected accept(suggestion: SuggestionResponse, body: AcceptSuggestionRequest): void {
    this.store.decide(suggestion, 'ACCEPTED', body).subscribe({
      // Confirm where the accepted content went: a question is only marked as
      // addressed, everything else lands in the backlog as a draft.
      next: () =>
        this.toast.success(
          this.transloco.translate(
            suggestion.type === 'CLARIFYING_QUESTION'
              ? 'discovery.decision.resolvedToast'
              : 'discovery.decision.acceptedToast',
          ),
        ),
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
    this.toast.error(messageForError(err, this.transloco));
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
      ? 'bg-verified-soft ring-1 ring-inset ring-verified-border'
      : 'bg-muted/70 text-muted-foreground';
  }

  /** "Accepted/resolved by the analyst" makes the human validation explicit; questions are resolved. */
  protected decisionLabel(decision: DecisionEntry): string {
    if (decision.outcome === 'DISMISSED') return 'discovery.decision.dismissed';
    return decision.type === 'CLARIFYING_QUESTION'
      ? 'discovery.decision.resolvedBy'
      : 'discovery.decision.acceptedBy';
  }

  /**
   * What the AI is doing for a session block (live/paused/processing/failed), or
   * null for a settled session. "Last suggestion" is the newest pending one of
   * this session still in the review queue.
   */
  protected activityFor(block: RenderBlock): AiActivity | null {
    const pending = this.store.queue().filter((s) => s.sessionId === block.session.id);
    return aiActivityFor(block.session, pending, this.now());
  }

  protected activityClass(state: AiActivity['state']): string {
    switch (state) {
      case 'listening':
      case 'processing':
        return 'bg-ai-soft text-ai';
      case 'failed':
        return 'border border-destructive/30 bg-destructive/5 text-destructive';
      default:
        return 'bg-muted/70 text-muted-foreground';
    }
  }

  /** Re-runs the initial feed load after an error. */
  protected retryLoad(): void {
    this.store.init(this.projectId());
  }

  /**
   * "Share again" from the no-meeting-audio notice: mid-session it re-opens the
   * share picker for the running recording; before one, it simply retries the
   * record flow (both straight from the click, which the picker needs).
   */
  protected retryMeetingShare(): void {
    if (this.recording.isActive()) {
      void this.recorder.shareMeetingAudio();
      return;
    }
    void this.record();
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

  /**
   * Bubble styling per side, kept neutral so the transcript recedes behind AI and
   * human decisions: the left speaker is filled, the right (2nd) one outlined.
   */
  protected segmentBubbleClass(speaker: SpeakerDisplay | undefined): string {
    return speaker?.side === 'right'
      ? 'rounded-tr-md border border-border bg-card'
      : 'rounded-tl-md bg-secondary';
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

  /** Picks the audio source and persists it as this user's preference. */
  protected setAudioSource(source: AudioSource): void {
    this.audioSource.set(source);
    this.meetingUnavailableHint.set(false);
    // A previous attempt's capture warning no longer applies to the new choice.
    this.recorder.notice.set(null);
    const userId = this.auth.user()?.id;
    if (!userId) return;
    try {
      localStorage.setItem(audioSourceStorageKey(userId), source);
    } catch {
      // Storage can be unavailable (private mode / quota); the in-memory value still applies.
    }
  }

  /** This user's stored audio-source choice, or null when absent/unreadable. */
  private storedAudioSource(): string | null {
    const userId = this.auth.user()?.id;
    if (!userId) return null;
    try {
      return localStorage.getItem(audioSourceStorageKey(userId));
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
