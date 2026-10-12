import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterNextRender,
  computed,
  effect,
  Injector,
  inject,
  input,
  linkedSignal,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { DatePipe, NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { provideIcons } from '@ng-icons/core';
import {
  lucideArrowUpRight,
  lucideCircleHelp,
  lucideCodeXml,
  lucideFileSearch,
  lucidePlus,
  lucideQuote,
  lucideRefreshCw,
  lucideSearchX,
  lucideSparkles,
  lucideTrash2,
  lucideTriangleAlert,
} from '@ng-icons/lucide';
import {
  AcceptSuggestionRequest,
  DisplayStory,
  EditableCriterion,
  EditableSuggestion,
  SuggestionPriority,
  SuggestionResponse,
  draftToEditable,
  editableToAcceptRequest,
  emptyEditableCriterion,
  suggestionCriteria,
} from '../../data/discovery.models';
import { CodeBannerKind, codeBannerKind, verifyStateOf } from '../../data/code-verification';
import { CodeReference } from '../../data/codebase.models';
import { EvidenceSegment, evidenceSpeakerLabel } from '../../data/evidence';
import { Select, SelectOption } from '../../../../shared/components/select/select';
import { translateFn } from '../../../../core/i18n/translate-fn';
import { HlmButton, HlmIcon, HlmInput, HlmSpinner } from '../../../../shared/ui';
import { CodeReferences } from '../code-references/code-references';
import { GherkinSteps } from '../gherkin-steps/gherkin-steps';
import { PriorityBadge } from '../story-badges/story-badges';

const PRIORITIES: SuggestionPriority[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

/** How each outcome of the code check reads on the card. */
const BANNERS: Record<CodeBannerKind, { testId: string; labelKey: string; icon: string }> = {
  exists: {
    testId: 'suggestion-code-exists',
    labelKey: 'discovery.suggestion.code.exists',
    icon: 'lucideCodeXml',
  },
  conflicts: {
    testId: 'suggestion-code-conflict',
    labelKey: 'discovery.suggestion.code.conflicts',
    icon: 'lucideTriangleAlert',
  },
  notFound: {
    testId: 'suggestion-code-notfound',
    labelKey: 'discovery.suggestion.code.notFound',
    icon: 'lucideSearchX',
  },
  unsure: {
    testId: 'suggestion-code-unsure',
    labelKey: 'discovery.suggestion.code.unsure',
    icon: 'lucideCircleHelp',
  },
};

/** The code banner of a card: its look, the note, the places it cites and whether it was verified. */
interface CodeBanner {
  kind: CodeBannerKind;
  testId: string;
  labelKey: string;
  icon: string;
  note: string | null;
  references: CodeReference[];
  verified: boolean;
}

/** Story fields an UPDATE_STORY suggestion can change (highlighted on the proposed side). */
type StoryField = 'title' | 'role' | 'action' | 'benefit';

/**
 * One AI suggestion rendered per type (draft story, story update diff, edge
 * case, clarifying question) with an inline edit-before-accept flow. Everything
 * the AI proposed carries the violet "AI" provenance (type chip, card border),
 * so it never reads like content an analyst already validated. The story reads
 * as its canonical sentence ("Como …, quiero …, para …") and criteria as
 * Given/When/Then steps. Clicking "Edit" opens labelled, auto-growing fields;
 * approving or saving as a draft sends only the changed fields to the backend. Read-only when
 * `canDecide` is false. `openTarget` asks the page to reveal the target story.
 */
@Component({
  selector: 'app-suggestion-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    NgTemplateOutlet,
    FormsModule,
    Select,
    CodeReferences,
    GherkinSteps,
    PriorityBadge,
    HlmButton,
    HlmInput,
    HlmIcon,
    HlmSpinner,
    TranslocoPipe,
  ],
  viewProviders: [
    provideIcons({
      lucideArrowUpRight,
      lucideCircleHelp,
      lucideCodeXml,
      lucideFileSearch,
      lucidePlus,
      lucideQuote,
      lucideRefreshCw,
      lucideSearchX,
      lucideSparkles,
      lucideTrash2,
      lucideTriangleAlert,
    }),
  ],
  host: { class: 'flex min-h-0 flex-col' },
  template: `
    <article
      class="flex min-h-0 flex-col rounded-2xl border border-ai-border bg-card shadow-lg"
      [attr.aria-label]="
        ('discovery.suggestion.aiLabel' | transloco) +
        ': ' +
        ('discovery.suggestion.type.' + suggestion().type | transloco)
      "
      data-testid="suggestion-card"
    >
      <!-- Header: AI provenance + type, then priority/points, topic on the right. -->
      <header
        class="flex flex-wrap items-center gap-1.5 border-b border-border/70 px-4 pb-2.5 pt-3"
      >
        <span
          class="inline-flex items-center gap-1.5 rounded-full bg-ai-soft px-2 py-0.5 text-xs font-medium text-ai"
          [title]="'discovery.suggestion.aiHint' | transloco"
          data-testid="suggestion-type"
        >
          <hlm-icon
            [name]="
              suggestion().type === 'CLARIFYING_QUESTION' ? 'lucideCircleHelp' : 'lucideSparkles'
            "
            size="12px"
            aria-hidden="true"
          />
          {{ 'discovery.suggestion.type.' + suggestion().type | transloco }}
        </span>
        @if (suggestion().type !== 'CLARIFYING_QUESTION') {
          <app-priority-badge [priority]="displayPriority()" />
          @if (displayStoryPoints() !== null) {
            <span
              class="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground tabular-nums"
              data-testid="suggestion-points"
            >
              {{ 'discovery.panel.points' | transloco: { n: displayStoryPoints() } }}
            </span>
          }
        }
        @if (suggestion().relatedTopic; as topic) {
          <span
            class="ml-auto max-w-[14rem] truncate text-xs text-muted-foreground"
            [title]="topic"
          >
            {{ topic }}
          </span>
        }
      </header>

      <!-- Body (scrolls when long) -->
      <div class="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-4 py-3">
        <!-- What the connected code says, before the proposal itself: it changes the decision.
             A conflict reads amber (look closer); an existing capability, nothing found or an
             inconclusive check stay neutral. -->
        @if (codeBanner(); as banner) {
          <div
            #codeBlock
            class="mb-3 rounded-xl border px-3 py-2.5"
            [class]="
              banner.kind === 'conflicts'
                ? 'border-pending-border bg-pending-soft'
                : 'border-border bg-muted/60'
            "
            role="note"
            [attr.data-testid]="banner.testId"
          >
            <p
              class="flex items-center gap-1.5 text-xs font-semibold"
              [class.text-pending]="banner.kind === 'conflicts'"
              [class.text-foreground]="banner.kind !== 'conflicts'"
            >
              <hlm-icon [name]="banner.icon" size="14px" class="shrink-0" aria-hidden="true" />
              {{ banner.labelKey | transloco }}
            </p>
            @if (banner.note) {
              <p
                class="mt-1 text-sm leading-relaxed text-foreground"
                data-testid="suggestion-code-note"
              >
                {{ banner.note }}
              </p>
            }
            @if (banner.references.length > 0) {
              <app-code-references
                class="mt-2 block"
                [references]="banner.references"
                chipTestId="suggestion-code-ref"
              />
            }
            @if (banner.verified) {
              <p
                class="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground"
                data-testid="suggestion-code-verified"
              >
                <hlm-icon name="lucideFileSearch" size="12px" class="shrink-0" aria-hidden="true" />
                {{ 'discovery.suggestion.code.verifiedInCode' | transloco }}
                @if (verifiedAt(); as at) {
                  · <time [attr.datetime]="at">{{ at | date: 'HH:mm' }}</time>
                }
              </p>
            }
          </div>
        }

        @if (verifyState() === 'FAILED') {
          <div
            #failedBlock
            class="mb-3 flex flex-col items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2.5"
            data-testid="suggestion-verify-error"
          >
            <p class="flex min-w-0 items-start gap-1.5 text-sm text-foreground">
              <hlm-icon
                name="lucideTriangleAlert"
                size="14px"
                class="mt-0.5 shrink-0 text-destructive"
                aria-hidden="true"
              />
              <span>{{ 'discovery.suggestion.code.failed' | transloco }}</span>
            </p>
            @if (canVerify()) {
              <button
                hlmBtn
                size="sm"
                variant="outline"
                type="button"
                (click)="verify.emit()"
                data-testid="suggestion-verify-retry"
              >
                <hlm-icon name="lucideRefreshCw" size="13px" aria-hidden="true" />
                {{ 'discovery.suggestion.code.retry' | transloco }}
              </button>
            }
          </div>
        }

        @switch (suggestion().type) {
          @case ('CLARIFYING_QUESTION') {
            <p class="text-[15px] font-medium leading-relaxed text-foreground">
              {{ suggestion().question }}
            </p>
            <p class="mt-2 text-xs text-muted-foreground">
              {{ 'discovery.suggestion.questionHint' | transloco }}
            </p>
          }
          @case ('UPDATE_STORY') {
            <!-- BEFORE / AFTER: the current story (read-only) beside the proposed
                 (editable) version, every changed field highlighted. -->
            <p class="mb-2.5 text-sm">
              <span class="text-muted-foreground"
                >{{ 'discovery.suggestion.updates' | transloco }} </span
              ><span class="font-medium text-foreground">{{
                targetStory()?.title ?? ('discovery.suggestion.storyNotFound' | transloco)
              }}</span>
            </p>
            <div class="grid gap-3 sm:grid-cols-2">
              <div class="rounded-xl bg-muted/60 p-3">
                <p class="mb-1.5 text-xs font-medium text-muted-foreground">
                  {{ 'discovery.suggestion.current' | transloco }}
                </p>
                @if (targetStory(); as cur) {
                  <p class="text-sm font-medium leading-snug">{{ cur.title }}</p>
                  <p class="mt-1 text-sm leading-relaxed text-muted-foreground">
                    {{ 'discovery.story.as' | transloco
                    }}<span class="text-foreground">{{ cur.role }}</span
                    >{{ 'discovery.story.want' | transloco
                    }}<span class="text-foreground">{{ cur.action }}</span
                    >{{ 'discovery.story.soThat' | transloco
                    }}<span class="text-foreground">{{ cur.benefit }}</span
                    >.
                  </p>
                } @else {
                  <p class="text-xs text-muted-foreground">
                    {{ 'discovery.suggestion.storyNotFound' | transloco }}
                  </p>
                }
              </div>
              <div class="rounded-xl border border-ai-border p-3">
                <p class="mb-1.5 text-xs font-medium text-ai">
                  {{ 'discovery.suggestion.proposed' | transloco }}
                </p>
                <ng-container [ngTemplateOutlet]="storyBody" />
              </div>
            </div>
            @if (!editing() && hasChanges()) {
              <p class="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                <span
                  class="inline-block h-2.5 w-4 rounded-sm bg-ai-soft ring-1 ring-ai-border"
                ></span>
                {{ 'discovery.suggestion.changedHint' | transloco }}
              </p>
            }
            <!-- UPDATE_STORY edits BOTH the story content AND its acceptance
                 criteria (product-owner confirmed): keep the criteria editor
                 prominent below the before/after diff. -->
            <ng-container [ngTemplateOutlet]="criteriaEditor" />
          }
          @case ('EDGE_CASE') {
            <!-- A new criterion to add to an existing story (read-only target). -->
            @if (targetStory(); as cur) {
              <p class="mb-2.5 text-sm">
                <span class="text-muted-foreground"
                  >{{ 'discovery.suggestion.forStory' | transloco }} </span
                ><span class="font-medium text-foreground">{{ cur.title }}</span>
              </p>
            } @else {
              <p class="mb-2.5 text-sm text-muted-foreground">
                {{ 'discovery.suggestion.storyNotFound' | transloco }}
              </p>
            }
            <div class="rounded-xl border border-ai-border p-3">
              <p class="mb-2 text-xs font-medium text-ai">
                {{ 'discovery.suggestion.scenarioToAdd' | transloco }}
              </p>
              <ng-container [ngTemplateOutlet]="edgeCaseBody" />
            </div>
          }
          @default {
            <ng-container [ngTemplateOutlet]="storyBody" />
            <ng-container [ngTemplateOutlet]="criteriaEditor" />
          }
        }

        <!-- Read-only criteria preview: only when not editing and a valid one exists.
             EDGE_CASE renders its own criterion above, so exclude it here. -->
        @if (!editing() && suggestion().type !== 'EDGE_CASE' && criteria().length > 0) {
          <div class="mt-4">
            <p class="mb-2 text-xs font-medium text-muted-foreground">
              {{ 'discovery.suggestion.criteriaCount' | transloco: { count: criteria().length } }}
            </p>
            <ul class="flex flex-col gap-2" data-testid="suggestion-criteria">
              @for (criterion of criteria(); track $index) {
                <li class="rounded-lg bg-muted/60 px-3 py-2.5">
                  <app-gherkin-steps [criterion]="criterion" />
                </li>
              }
            </ul>
          </div>
        }

        <!-- Evidence: the client's own words and who said them when. Opens that bubble in the
             transcript when it is loaded; otherwise the quote stands on its own. -->
        @if (evidence(); as ev) {
          @if (evidenceSegment(); as seg) {
            <button
              type="button"
              class="-mx-2 mt-3 flex w-[calc(100%+1rem)] cursor-pointer items-start gap-2 rounded-lg px-2 py-1.5 text-left text-xs leading-relaxed transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              [title]="'discovery.suggestion.evidence.show' | transloco"
              (click)="showEvidence.emit(seg)"
              data-testid="suggestion-evidence"
              [attr.data-evidence-segment]="seg.sessionId + ':' + seg.sequence"
            >
              <hlm-icon
                name="lucideQuote"
                size="13px"
                class="mt-0.5 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
              <span class="min-w-0">
                <q class="text-foreground" data-testid="suggestion-evidence-quote">{{
                  ev.quote
                }}</q>
                <span class="text-muted-foreground">
                  —
                  @if (speakerLabel(seg); as who) {
                    <span data-testid="suggestion-evidence-speaker">{{ who }}</span> ·
                  }
                  <time class="tabular-nums" [attr.datetime]="seg.occurredAt">{{
                    seg.occurredAt | date: 'HH:mm'
                  }}</time>
                </span>
                <span class="sr-only"
                  >. {{ 'discovery.suggestion.evidence.show' | transloco }}</span
                >
              </span>
            </button>
          } @else {
            <p
              class="mt-3 flex items-start gap-2 text-xs leading-relaxed"
              data-testid="suggestion-evidence"
            >
              <hlm-icon
                name="lucideQuote"
                size="13px"
                class="mt-0.5 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
              <q class="min-w-0 text-foreground" data-testid="suggestion-evidence-quote">{{
                ev.quote
              }}</q>
            </p>
          }
        }

        @if (suggestion().targetStoryId && suggestion().type !== 'NEW_STORY') {
          <button
            type="button"
            class="mt-3 inline-flex items-center gap-1 rounded-md text-xs font-medium text-primary hover:underline"
            (click)="openTarget.emit(suggestion().targetStoryId!)"
            data-testid="suggestion-open-target"
          >
            <hlm-icon name="lucideArrowUpRight" size="13px" aria-hidden="true" />
            {{ 'discovery.suggestion.viewTarget' | transloco }}
          </button>
        }
      </div>

      <!-- Announces the verification to screen readers; the visual state lives in the banner and the button. -->
      <p class="sr-only" role="status" aria-live="polite" data-testid="suggestion-verify-status">
        {{ verifyAnnouncement() }}
      </p>

      @if (canDecide()) {
        <footer class="flex flex-wrap items-center gap-2 border-t border-border/70 px-4 py-3">
          @if (isQuestion()) {
            <button
              hlmBtn
              size="sm"
              type="button"
              [disabled]="busy()"
              (click)="onAccept(false)"
              data-testid="suggestion-accept"
            >
              @if (busy()) {
                <hlm-spinner class="h-3.5 w-3.5" />
              }
              {{ 'discovery.suggestion.resolve' | transloco }}
            </button>
          } @else {
            <!-- Approving needs STORY_APPROVE: without it nobody is offered an action they cannot take,
                 and saving as a draft is the primary action. -->
            @if (canApprove()) {
              <button
                hlmBtn
                class="w-full sm:w-auto"
                size="sm"
                type="button"
                [disabled]="busy()"
                [attr.aria-label]="'discovery.suggestion.approveAria' | transloco"
                (click)="onAccept(true)"
                data-testid="suggestion-accept"
              >
                @if (busy()) {
                  <hlm-spinner class="h-3.5 w-3.5" />
                }
                {{ 'discovery.suggestion.approve' | transloco }}
              </button>
            }
            <button
              hlmBtn
              class="w-full sm:w-auto"
              size="sm"
              [variant]="canApprove() ? 'outline' : 'default'"
              type="button"
              [disabled]="busy()"
              [attr.aria-label]="'discovery.suggestion.saveDraftAria' | transloco"
              (click)="onAccept(false)"
              [attr.data-testid]="canApprove() ? 'suggestion-save-draft' : 'suggestion-accept'"
            >
              @if (busy() && !canApprove()) {
                <hlm-spinner class="h-3.5 w-3.5" />
              }
              {{ 'discovery.suggestion.saveDraft' | transloco }}
            </button>
          }
          @if (!isQuestion()) {
            <button
              hlmBtn
              size="sm"
              variant="outline"
              type="button"
              [disabled]="busy()"
              (click)="toggleEditing()"
              data-testid="suggestion-edit"
            >
              {{
                (editing() ? 'discovery.suggestion.cancelEdit' : 'discovery.suggestion.edit')
                  | transloco
              }}
            </button>
          }
          @if (canVerify() && verifyState() !== 'FAILED') {
            <button
              hlmBtn
              size="sm"
              variant="ghost"
              type="button"
              class="text-muted-foreground"
              [disabled]="busy() || verifyState() === 'VERIFYING'"
              [attr.aria-busy]="verifyState() === 'VERIFYING'"
              (click)="verify.emit()"
              data-testid="suggestion-verify"
            >
              @if (verifyState() === 'VERIFYING') {
                <hlm-spinner class="h-3.5 w-3.5" />
                {{ 'discovery.suggestion.code.verifying' | transloco }}
              } @else {
                <hlm-icon name="lucideFileSearch" size="14px" aria-hidden="true" />
                {{
                  (verifyState() === 'VERIFIED'
                    ? 'discovery.suggestion.code.verifyAgain'
                    : 'discovery.suggestion.code.verify'
                  ) | transloco
                }}
              }
            </button>
          }
          <!-- Discard is irreversible: kept apart from Edit/Cancel and visually quiet. -->
          <button
            hlmBtn
            size="sm"
            variant="ghost"
            type="button"
            class="ml-auto text-muted-foreground"
            [disabled]="busy()"
            (click)="dismiss.emit()"
            data-testid="suggestion-dismiss"
          >
            {{ 'discovery.suggestion.dismiss' | transloco }}
          </button>
        </footer>
      }
    </article>

    <!-- Story body: editable story fields (NEW_STORY / UPDATE_STORY proposed side). -->
    <ng-template #storyBody>
      @if (editing()) {
        <div class="flex flex-col gap-3">
          <label class="flex flex-col gap-1">
            <span class="text-xs font-medium text-muted-foreground">{{
              'discovery.suggestion.titleField' | transloco
            }}</span>
            <textarea
              hlmInput
              rows="1"
              class="min-h-10 font-medium"
              [ngModel]="model().title"
              (ngModelChange)="patch({ title: $event })"
              data-testid="edit-title"
            ></textarea>
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-xs font-medium text-muted-foreground">{{
              'discovery.suggestion.roleField' | transloco
            }}</span>
            <textarea
              hlmInput
              rows="1"
              class="min-h-10"
              [ngModel]="model().role"
              (ngModelChange)="patch({ role: $event })"
              data-testid="edit-role"
            ></textarea>
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-xs font-medium text-muted-foreground">{{
              'discovery.suggestion.actionField' | transloco
            }}</span>
            <textarea
              hlmInput
              rows="2"
              [ngModel]="model().action"
              (ngModelChange)="patch({ action: $event })"
              data-testid="edit-action"
            ></textarea>
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-xs font-medium text-muted-foreground">{{
              'discovery.suggestion.benefitField' | transloco
            }}</span>
            <textarea
              hlmInput
              rows="2"
              [ngModel]="model().benefit"
              (ngModelChange)="patch({ benefit: $event })"
              data-testid="edit-benefit"
            ></textarea>
          </label>
          <div class="flex flex-wrap items-end gap-3">
            <div class="flex flex-col gap-1">
              <span class="text-xs font-medium text-muted-foreground">{{
                'discovery.suggestion.priorityField' | transloco
              }}</span>
              <app-select
                [options]="priorityOptions()"
                [value]="model().priority"
                (valueChange)="patch({ priority: $any($event) })"
                [ariaLabel]="'discovery.suggestion.priorityField' | transloco"
                data-testid="edit-priority"
              />
            </div>
            <label class="flex flex-col gap-1">
              <span class="text-xs font-medium text-muted-foreground">{{
                'discovery.suggestion.points' | transloco
              }}</span>
              <input
                hlmInput
                class="w-24"
                type="number"
                min="0"
                [ngModel]="model().storyPoints"
                (ngModelChange)="patch({ storyPoints: $event })"
                data-testid="edit-points"
              />
            </label>
          </div>
        </div>
      } @else {
        <p
          class="text-base font-semibold leading-snug text-foreground"
          [class]="changedClass('title')"
        >
          {{ suggestion().draftTitle }}
        </p>
        <p
          class="mt-1.5 text-sm leading-relaxed text-muted-foreground"
          data-testid="story-sentence"
        >
          {{ 'discovery.story.as' | transloco
          }}<span class="font-medium text-foreground" [class]="changedClass('role')">{{
            suggestion().draftRole
          }}</span
          >{{ 'discovery.story.want' | transloco
          }}<span class="font-medium text-foreground" [class]="changedClass('action')">{{
            suggestion().draftAction
          }}</span
          >{{ 'discovery.story.soThat' | transloco
          }}<span class="text-foreground" [class]="changedClass('benefit')">{{
            suggestion().draftBenefit
          }}</span
          >.
        </p>
      }
    </ng-template>

    <!-- Edge-case body: a single editable criterion (scenario/given/when/then). -->
    <ng-template #edgeCaseBody>
      @if (editing()) {
        <div data-testid="edge-criterion-edit">
          <ng-container
            [ngTemplateOutlet]="criterionFields"
            [ngTemplateOutletContext]="{ criterion: model().criteria[0], index: 0 }"
          />
        </div>
      } @else if (firstCriterion(); as c) {
        <app-gherkin-steps [criterion]="c" />
      } @else {
        <p class="text-sm text-muted-foreground">
          {{ 'discovery.suggestion.noCriterion' | transloco }}
        </p>
      }
    </ng-template>

    <!-- NEW_STORY criteria list editor: add / edit / remove. -->
    <ng-template #criteriaEditor>
      @if (editing()) {
        <div class="mt-4 flex flex-col gap-2.5" data-testid="criteria-editor">
          <p class="text-xs font-medium text-muted-foreground">
            {{ 'discovery.suggestion.criteria' | transloco }}
          </p>
          @for (criterion of model().criteria; track $index) {
            <div class="rounded-xl bg-muted/60 p-3">
              <div class="mb-2 flex items-center justify-between">
                <span class="text-xs font-medium text-muted-foreground">
                  {{ 'discovery.suggestion.criterion' | transloco }} {{ $index + 1 }}
                </span>
                <button
                  type="button"
                  class="grid h-8 w-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                  (click)="removeCriterion($index)"
                  [attr.aria-label]="'discovery.suggestion.removeCriterion' | transloco"
                  data-testid="remove-criterion"
                >
                  <hlm-icon name="lucideTrash2" size="14px" />
                </button>
              </div>
              <ng-container
                [ngTemplateOutlet]="criterionFields"
                [ngTemplateOutletContext]="{ criterion, index: $index }"
              />
            </div>
          }
          <button
            type="button"
            class="inline-flex items-center gap-1.5 self-start rounded-md border border-dashed border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            (click)="addCriterion()"
            data-testid="add-criterion"
          >
            <hlm-icon name="lucidePlus" size="13px" />
            {{ 'discovery.suggestion.addCriterion' | transloco }}
          </button>
        </div>
      }
    </ng-template>

    <!-- Shared editable G/W/T fields for one criterion: the keyword stays visible as a
         label in a fixed gutter, so a filled field never loses its meaning. -->
    <ng-template #criterionFields let-criterion="criterion" let-index="index">
      <div class="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3 gap-y-2">
        <label
          class="pt-2.5 text-[11px] font-semibold uppercase leading-4 tracking-wide text-muted-foreground"
          [attr.for]="fieldId(index, 'scenario')"
          >{{ 'discovery.suggestion.scenario' | transloco }}</label
        >
        <textarea
          hlmInput
          rows="1"
          class="min-h-10"
          [id]="fieldId(index, 'scenario')"
          [placeholder]="'discovery.suggestion.scenarioPlaceholder' | transloco"
          [ngModel]="criterion.scenario"
          (ngModelChange)="patchCriterion(index, { scenario: $event })"
          data-testid="criterion-scenario"
        ></textarea>
        @for (step of steps; track step.key) {
          <label
            class="pt-2.5 text-[11px] font-semibold uppercase leading-4 tracking-wide text-muted-foreground"
            [attr.for]="fieldId(index, step.key)"
            >{{ step.label | transloco }}</label
          >
          <textarea
            hlmInput
            rows="1"
            class="min-h-10"
            [id]="fieldId(index, step.key)"
            [ngModel]="criterion[step.key]"
            (ngModelChange)="patchCriterionStep(index, step.key, $event)"
            [attr.data-testid]="'criterion-' + step.key"
          ></textarea>
        }
      </div>
    </ng-template>
  `,
})
export class SuggestionCard {
  readonly suggestion = input.required<SuggestionResponse>();
  readonly targetStory = input<DisplayStory | undefined>(undefined);
  /** False renders the card read-only (viewer without decide rights). */
  readonly canDecide = input(true);
  /** True when the viewer holds STORY_APPROVE: only then is "Aprobar" offered next to the draft save. */
  readonly canApprove = input(false);
  /** True while this suggestion's accept/dismiss (incl. its retry) is in flight. */
  readonly busy = input(false);
  /**
   * The loaded transcript segment the evidence points at (speaker and time), or null when it is
   * not in the feed — then the quote shows without a link.
   */
  readonly evidenceSegment = input<EvidenceSegment | null>(null);
  /**
   * Whether the analyst may verify the suggestion in the code: the project has a ready repository
   * and they can read integrations and decide suggestions.
   */
  readonly canVerify = input(false);
  readonly accept = output<AcceptSuggestionRequest>();
  readonly dismiss = output<void>();
  /** Asks the page to verify this suggestion in the pure source code (also the retry). */
  readonly verify = output<void>();
  /** Asks the page to reveal the target story in the side panel. */
  readonly openTarget = output<string>();
  /** Asks the page to scroll the feed to the evidence's transcript bubble. */
  readonly showEvidence = output<EvidenceSegment>();

  protected readonly editing = signal(false);
  protected readonly steps = [
    { key: 'given', label: 'discovery.suggestion.criteriaGiven' },
    { key: 'when', label: 'discovery.suggestion.criteriaWhen' },
    { key: 'then', label: 'discovery.suggestion.criteriaThen' },
  ] as const;

  private readonly transloco = inject(TranslocoService);
  private readonly translate = translateFn(this.transloco);

  private readonly injector = inject(Injector);
  private readonly codeBlock = viewChild<ElementRef<HTMLElement>>('codeBlock');
  private readonly failedBlock = viewChild<ElementRef<HTMLElement>>('failedBlock');

  constructor() {
    // The result lands at the top of a scrollable body while the button that asked for it is in the
    // footer: bring it into view when the verification ends.
    effect(() => {
      const state = this.verifyState();
      if (state !== 'VERIFIED' && state !== 'FAILED') return;
      afterNextRender(
        () => {
          const block = state === 'FAILED' ? this.failedBlock() : this.codeBlock();
          block?.nativeElement.scrollIntoView?.({ block: 'nearest' });
        },
        { injector: this.injector },
      );
    });
  }

  protected readonly verifyState = computed(() => verifyStateOf(this.suggestion()));

  protected readonly verifiedAt = computed(() => this.suggestion().code?.verifiedAt ?? null);

  /**
   * The code banner: a deep verdict when the analyst verified, else the quick finding. Nothing
   * when the code was checked and said nothing worth a banner.
   */
  protected readonly codeBanner = computed<CodeBanner | null>(() => {
    const code = this.suggestion().code;
    const kind = codeBannerKind(code);
    if (!code || !kind) return null;
    return {
      kind,
      ...BANNERS[kind],
      note: code.note,
      references: Array.isArray(code.references) ? code.references : [],
      verified: !!code.verdict,
    };
  });

  /** What a screen reader hears as the verification moves. */
  protected readonly verifyAnnouncement = computed(() => {
    const t = this.translate();
    if (!t) return '';
    switch (this.verifyState()) {
      case 'VERIFYING':
        return t('discovery.suggestion.code.verifying');
      case 'FAILED':
        return t('discovery.suggestion.code.failed');
      case 'VERIFIED': {
        const kind = this.codeBanner()?.kind;
        return kind ? t('discovery.suggestion.code.done') + ' ' + t(BANNERS[kind].labelKey) : '';
      }
      default:
        return '';
    }
  });

  /** The transcript evidence, shown only for a suggestion raised in a session. */
  protected readonly evidence = computed(() => {
    const { sessionId, evidence } = this.suggestion();
    return sessionId && evidence?.quote?.trim() ? evidence : null;
  });

  /** Options for the edit-mode priority select, highest first. */
  protected readonly priorityOptions = computed<SelectOption[]>(() => {
    const t = this.translate();
    return [...PRIORITIES]
      .reverse()
      .map((p) => ({ value: p, label: t ? t('discovery.suggestion.priority.' + p) : p }));
  });

  /** Proposed acceptance criteria, normalized for the read-only preview. */
  protected readonly criteria = computed(() =>
    suggestionCriteria(this.suggestion().draftAcceptanceCriteria),
  );
  /** The single edge-case criterion (first normalized criterion), or undefined. */
  protected readonly firstCriterion = computed(() => this.criteria()[0]);

  /**
   * The editable working copy, re-seeded from the draft whenever the shown
   * suggestion changes (carousel navigation). Edits are local until accept.
   */
  protected readonly model = linkedSignal<EditableSuggestion>(() =>
    draftToEditable(this.suggestion()),
  );

  /** Priority shown on the header chip — the edited value while editing, else the draft. */
  protected readonly displayPriority = computed<SuggestionPriority>(() =>
    this.editing() ? this.model().priority : (this.suggestion().draftPriority ?? 'MEDIUM'),
  );

  /**
   * Story points shown on the header chip (next to priority) — the edited value
   * while editing, else the draft. Null when the suggestion carries none, so the
   * chip is hidden (e.g. EDGE_CASE / UPDATE_STORY without points).
   */
  protected readonly displayStoryPoints = computed<number | null>(() =>
    this.editing() ? this.model().storyPoints : this.suggestion().draftStoryPoints,
  );

  /** Questions are "resolved", not approved: they produce no story, so they have one action. */
  protected readonly isQuestion = computed(() => this.suggestion().type === 'CLARIFYING_QUESTION');

  /** True when an UPDATE_STORY proposal differs from its target in any story field. */
  protected readonly hasChanges = computed(() =>
    (['title', 'role', 'action', 'benefit'] as const).some((f) => this.isChanged(f)),
  );

  protected toggleEditing(): void {
    if (this.editing()) {
      // Cancel: discard edits by re-seeding from the draft.
      this.model.set(draftToEditable(this.suggestion()));
    }
    this.editing.set(!this.editing());
  }

  protected patch(partial: Partial<EditableSuggestion>): void {
    this.model.update((m) => ({ ...m, ...partial }));
  }

  protected patchCriterion(index: number, partial: Partial<EditableCriterion>): void {
    this.model.update((m) => ({
      ...m,
      criteria: m.criteria.map((c, i) => (i === index ? { ...c, ...partial } : c)),
    }));
  }

  protected patchCriterionStep(index: number, key: 'given' | 'when' | 'then', value: string): void {
    this.patchCriterion(index, { [key]: value });
  }

  protected addCriterion(): void {
    this.model.update((m) => ({ ...m, criteria: [...m.criteria, emptyEditableCriterion()] }));
  }

  protected removeCriterion(index: number): void {
    this.model.update((m) => ({ ...m, criteria: m.criteria.filter((_, i) => i !== index) }));
  }

  /** Who said the evidence, named like the transcript bubbles ("Ana (Cliente)", "Hablante 2"). */
  protected speakerLabel(segment: EvidenceSegment): string | null {
    // Re-render on language change, and never translate before the language file is loaded.
    if (!this.translate()) return null;
    return evidenceSpeakerLabel(
      segment.speaker,
      (n) => this.transloco.translate('discovery.speaker', { n }),
      (side) => this.transloco.translate('discovery.speakers.side.' + side),
    );
  }

  /** A stable, unique id for a criterion field so its gutter label can point at it. */
  protected fieldId(index: number, field: string): string {
    return `sg-${this.suggestion().id}-c${index}-${field}`;
  }

  /** True when the proposed field differs from the target story (UPDATE_STORY highlight). */
  protected isChanged(field: StoryField): boolean {
    if (this.suggestion().type !== 'UPDATE_STORY') return false;
    const target = this.targetStory();
    if (!target) return false;
    const draft: Record<StoryField, string | null> = {
      title: this.suggestion().draftTitle,
      role: this.suggestion().draftRole,
      action: this.suggestion().draftAction,
      benefit: this.suggestion().draftBenefit,
    };
    return (draft[field] ?? '') !== (target[field] ?? '');
  }

  /** Highlight for a changed field on the proposed side of an UPDATE_STORY diff. */
  protected changedClass(field: StoryField): string {
    return this.isChanged(field)
      ? 'rounded-sm bg-ai-soft px-0.5 text-foreground ring-1 ring-ai-border'
      : '';
  }

  /** Accepts the draft (or the edits) and approves the resulting story, or saves it as a draft. */
  protected onAccept(approve: boolean): void {
    const flag = approve && !this.isQuestion() ? { approve: true } : {};
    if (!this.editing()) {
      this.accept.emit(flag);
      return;
    }
    this.accept.emit({ ...editableToAcceptRequest(this.suggestion(), this.model()), ...flag });
    this.editing.set(false);
  }
}
