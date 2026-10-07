import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  linkedSignal,
  output,
  signal,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { provideIcons } from '@ng-icons/core';
import {
  lucideArrowUpRight,
  lucideCircleHelp,
  lucidePlus,
  lucideSparkles,
  lucideTrash2,
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
import { Select, SelectOption } from '../../../../shared/components/select/select';
import { translateFn } from '../../../../core/i18n/translate-fn';
import { HlmButton, HlmIcon, HlmInput, HlmSpinner } from '../../../../shared/ui';
import { GherkinSteps } from '../gherkin-steps/gherkin-steps';
import { PriorityBadge } from '../story-badges/story-badges';

const PRIORITIES: SuggestionPriority[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

/** Story fields an UPDATE_STORY suggestion can change (highlighted on the proposed side). */
type StoryField = 'title' | 'role' | 'action' | 'benefit';

/**
 * One AI suggestion rendered per type (draft story, story update diff, edge
 * case, clarifying question) with an inline edit-before-accept flow. Everything
 * the AI proposed carries the violet "AI" provenance (type chip, card border),
 * so it never reads like content an analyst already validated. The story reads
 * as its canonical sentence ("Como …, quiero …, para …") and criteria as
 * Given/When/Then steps. Clicking "Edit" opens labelled, auto-growing fields;
 * accepting sends only the changed fields to the backend. Read-only when
 * `canDecide` is false. `openTarget` asks the page to reveal the target story.
 */
@Component({
  selector: 'app-suggestion-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    NgTemplateOutlet,
    FormsModule,
    Select,
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
      lucidePlus,
      lucideSparkles,
      lucideTrash2,
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

      @if (canDecide()) {
        <footer class="flex flex-wrap items-center gap-2 border-t border-border/70 px-4 py-3">
          <button
            hlmBtn
            size="sm"
            type="button"
            [disabled]="busy()"
            (click)="onAccept()"
            data-testid="suggestion-accept"
          >
            @if (busy()) {
              <hlm-spinner class="h-3.5 w-3.5" />
            }
            {{ acceptLabel() | transloco }}
          </button>
          @if (suggestion().type !== 'CLARIFYING_QUESTION') {
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
  /** True while this suggestion's accept/dismiss (incl. its retry) is in flight. */
  readonly busy = input(false);
  readonly accept = output<AcceptSuggestionRequest>();
  readonly dismiss = output<void>();
  /** Asks the page to reveal the target story in the side panel. */
  readonly openTarget = output<string>();

  protected readonly editing = signal(false);
  protected readonly steps = [
    { key: 'given', label: 'discovery.suggestion.criteriaGiven' },
    { key: 'when', label: 'discovery.suggestion.criteriaWhen' },
    { key: 'then', label: 'discovery.suggestion.criteriaThen' },
  ] as const;

  private readonly translate = translateFn(inject(TranslocoService));

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

  /** Questions are "resolved", not "accepted" — accepting just records them as addressed. */
  protected readonly acceptLabel = computed(() =>
    this.suggestion().type === 'CLARIFYING_QUESTION'
      ? 'discovery.suggestion.resolve'
      : this.editing()
        ? 'discovery.suggestion.saveAndAccept'
        : 'discovery.suggestion.accept',
  );

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

  protected onAccept(): void {
    if (!this.editing()) {
      this.accept.emit({});
      return;
    }
    this.accept.emit(editableToAcceptRequest(this.suggestion(), this.model()));
    this.editing.set(false);
  }
}
