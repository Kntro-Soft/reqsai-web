import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  linkedSignal,
  output,
  signal,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import { provideIcons } from '@ng-icons/core';
import { lucideCircleHelp, lucidePlus, lucideSparkles, lucideTrash2 } from '@ng-icons/lucide';
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
import { HlmButton, HlmIcon, HlmInput, HlmSpinner } from '../../../../shared/ui';

const PRIORITIES: SuggestionPriority[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

/**
 * One AI suggestion rendered per type (draft story, story update diff, edge
 * case, clarifying question) with an inline edit-before-accept flow. Clicking
 * "Edit" opens an editable form inside the card; accepting sends only the
 * changed fields to the backend. Read-only when `canDecide` is false.
 * `openTarget` asks the page to reveal the target story in the side panel.
 */
@Component({
  selector: 'app-suggestion-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgTemplateOutlet, FormsModule, HlmButton, HlmInput, HlmIcon, HlmSpinner, TranslocoPipe],
  viewProviders: [provideIcons({ lucideCircleHelp, lucidePlus, lucideSparkles, lucideTrash2 })],
  template: `
    <div
      class="flex max-h-[70vh] flex-col rounded-2xl border border-primary/30 bg-card shadow-lg"
      data-testid="suggestion-card"
    >
      <!-- Header: type + priority + related topic -->
      <div class="flex flex-wrap items-center gap-2 border-b border-border/70 px-4 pb-2.5 pt-3.5">
        <span
          class="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary"
        >
          @if (suggestion().type === 'CLARIFYING_QUESTION') {
            <hlm-icon name="lucideCircleHelp" size="12px" />
          } @else {
            <hlm-icon name="lucideSparkles" size="12px" />
          }
          {{ 'discovery.suggestion.type.' + suggestion().type | transloco }}
        </span>
        @if (suggestion().type !== 'CLARIFYING_QUESTION') {
          <span
            class="rounded-full px-2 py-0.5 text-[11px] font-medium"
            [class]="priorityClass(displayPriority())"
          >
            {{ 'discovery.suggestion.priority.' + displayPriority() | transloco }}
          </span>
        }
        @if (suggestion().relatedTopic; as topic) {
          <span
            class="max-w-[14rem] truncate rounded-full bg-secondary px-2 py-0.5 text-[11px] text-muted-foreground"
            [title]="topic"
          >
            {{ topic }}
          </span>
        }
      </div>

      <!-- Body (scrolls when long) -->
      <div class="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-4 py-3">
        @switch (suggestion().type) {
          @case ('CLARIFYING_QUESTION') {
            <p class="text-sm leading-relaxed">{{ suggestion().question }}</p>
          }
          @case ('UPDATE_STORY') {
            <!-- BEFORE / AFTER: the current story (read-only) beside the proposed
                 (editable) version, changed fields highlighted. -->
            <p class="mb-2.5 text-sm">
              <span class="font-medium text-muted-foreground"
                >{{ 'discovery.suggestion.updates' | transloco }} </span
              ><span class="font-medium text-foreground">{{
                targetStory()?.title ?? ('discovery.suggestion.storyNotFound' | transloco)
              }}</span>
            </p>
            <div class="grid gap-3 sm:grid-cols-2">
              <div class="rounded-xl border border-border bg-background/40 p-3">
                <p class="mb-1 text-[11px] font-medium uppercase text-muted-foreground">
                  {{ 'discovery.suggestion.current' | transloco }}
                </p>
                @if (targetStory(); as cur) {
                  <p class="text-sm font-medium">{{ cur.title }}</p>
                  <dl class="mt-2 flex flex-col gap-1.5">
                    <div class="flex items-baseline gap-2">
                      <dt class="w-16 shrink-0 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {{ 'discovery.suggestion.role' | transloco }}
                      </dt>
                      <dd class="text-xs leading-snug text-foreground">{{ cur.role }}</dd>
                    </div>
                    <div class="flex items-baseline gap-2">
                      <dt class="w-16 shrink-0 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {{ 'discovery.suggestion.action' | transloco }}
                      </dt>
                      <dd class="text-xs leading-snug text-foreground">{{ cur.action }}</dd>
                    </div>
                    <div class="flex items-baseline gap-2">
                      <dt class="w-16 shrink-0 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {{ 'discovery.suggestion.benefit' | transloco }}
                      </dt>
                      <dd class="text-xs leading-snug text-muted-foreground">{{ cur.benefit }}</dd>
                    </div>
                  </dl>
                } @else {
                  <p class="text-xs text-muted-foreground">
                    {{ 'discovery.suggestion.storyNotFound' | transloco }}
                  </p>
                }
              </div>
              <div class="rounded-xl border border-primary/40 p-3">
                <p class="mb-1 text-[11px] font-medium uppercase text-primary">
                  {{ 'discovery.suggestion.proposed' | transloco }}
                </p>
                <ng-container [ngTemplateOutlet]="storyBody" />
              </div>
            </div>
          }
          @case ('EDGE_CASE') {
            <!-- A new criterion to add to an existing story (read-only target). -->
            @if (targetStory(); as cur) {
              <p class="mb-2.5 text-sm">
                <span class="font-medium text-muted-foreground"
                  >{{ 'discovery.suggestion.forStory' | transloco }} </span
                ><span class="font-medium text-foreground">{{ cur.title }}</span>
              </p>
            } @else {
              <p class="mb-2.5 text-sm text-muted-foreground">
                {{ 'discovery.suggestion.storyNotFound' | transloco }}
              </p>
            }
            <div class="rounded-xl border border-primary/40 p-3">
              <p class="mb-1.5 text-[11px] font-medium uppercase text-primary">
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
          <div class="mt-3">
            <p class="mb-1.5 text-[11px] font-medium uppercase text-muted-foreground">
              {{ 'discovery.suggestion.criteria' | transloco }}
            </p>
            <ul class="flex flex-col gap-2" data-testid="suggestion-criteria">
              @for (criterion of criteria(); track $index) {
                <li
                  class="rounded-lg border border-border bg-background/40 px-2.5 py-1.5 text-xs leading-relaxed"
                >
                  @if (criterion.scenario) {
                    <p class="mb-0.5 font-medium text-foreground">{{ criterion.scenario }}</p>
                  }
                  <p class="text-muted-foreground">
                    <span class="font-semibold text-primary">{{
                      'discovery.suggestion.criteriaGiven' | transloco
                    }}</span>
                    {{ criterion.given }} ·
                    <span class="font-semibold text-primary">{{
                      'discovery.suggestion.criteriaWhen' | transloco
                    }}</span>
                    {{ criterion.when }} ·
                    <span class="font-semibold text-primary">{{
                      'discovery.suggestion.criteriaThen' | transloco
                    }}</span>
                    {{ criterion.then }}
                  </p>
                </li>
              }
            </ul>
          </div>
        }

        @if (suggestion().targetStoryId && suggestion().type !== 'NEW_STORY') {
          <button
            type="button"
            class="mt-2.5 text-xs font-medium text-primary hover:underline"
            (click)="openTarget.emit(suggestion().targetStoryId!)"
            data-testid="suggestion-open-target"
          >
            {{ 'discovery.suggestion.viewTarget' | transloco }}
          </button>
        }
      </div>

      @if (canDecide()) {
        <div class="flex flex-wrap gap-2 border-t border-border/70 px-4 py-3">
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
          <button
            hlmBtn
            size="sm"
            variant="outline"
            type="button"
            [disabled]="busy()"
            (click)="dismiss.emit()"
            data-testid="suggestion-dismiss"
          >
            {{ 'discovery.suggestion.dismiss' | transloco }}
          </button>
        </div>
      }
    </div>

    <!-- Story body: editable story fields (NEW_STORY / UPDATE_STORY proposed side). -->
    <ng-template #storyBody>
      @if (editing()) {
        <div class="flex flex-col gap-2.5">
          <div class="flex flex-col gap-1">
            <span class="text-xs text-muted-foreground">{{
              'discovery.suggestion.titleField' | transloco
            }}</span>
            <input
              hlmInput
              class="h-9"
              [ngModel]="model().title"
              (ngModelChange)="patch({ title: $event })"
              data-testid="edit-title"
            />
          </div>
          <div class="grid gap-2 sm:grid-cols-3">
            <input
              hlmInput
              class="h-9"
              [placeholder]="'discovery.suggestion.role' | transloco"
              [ngModel]="model().role"
              (ngModelChange)="patch({ role: $event })"
              data-testid="edit-role"
            />
            <input
              hlmInput
              class="h-9"
              [placeholder]="'discovery.suggestion.action' | transloco"
              [ngModel]="model().action"
              (ngModelChange)="patch({ action: $event })"
              data-testid="edit-action"
            />
            <input
              hlmInput
              class="h-9"
              [placeholder]="'discovery.suggestion.benefit' | transloco"
              [ngModel]="model().benefit"
              (ngModelChange)="patch({ benefit: $event })"
              data-testid="edit-benefit"
            />
          </div>
          <div class="flex items-end gap-2">
            <div class="flex flex-col gap-1">
              <span class="text-xs text-muted-foreground">{{
                'discovery.suggestion.priorityField' | transloco
              }}</span>
              <select
                class="h-9 rounded-md border border-input bg-background px-2 text-sm"
                [ngModel]="model().priority"
                (ngModelChange)="patch({ priority: $event })"
                data-testid="edit-priority"
              >
                @for (p of priorities; track p) {
                  <option [value]="p">
                    {{ 'discovery.suggestion.priority.' + p | transloco }}
                  </option>
                }
              </select>
            </div>
            <div class="flex flex-col gap-1">
              <span class="text-xs text-muted-foreground">{{
                'discovery.suggestion.points' | transloco
              }}</span>
              <input
                hlmInput
                class="h-9 w-20"
                type="number"
                [ngModel]="model().storyPoints"
                (ngModelChange)="patch({ storyPoints: $event })"
                data-testid="edit-points"
              />
            </div>
          </div>
        </div>
      } @else {
        <p class="text-sm font-medium" [class.text-primary]="isChanged('title')">
          {{ suggestion().draftTitle }}
        </p>
        <dl class="mt-2 flex flex-col gap-1.5">
          <div class="flex items-baseline gap-2">
            <dt class="w-16 shrink-0 text-[10px] font-semibold uppercase tracking-wide text-primary">
              {{ 'discovery.suggestion.role' | transloco }}
            </dt>
            <dd class="text-sm leading-snug text-foreground">{{ suggestion().draftRole }}</dd>
          </div>
          <div class="flex items-baseline gap-2">
            <dt class="w-16 shrink-0 text-[10px] font-semibold uppercase tracking-wide text-primary">
              {{ 'discovery.suggestion.action' | transloco }}
            </dt>
            <dd class="text-sm leading-snug text-foreground">{{ suggestion().draftAction }}</dd>
          </div>
          <div class="flex items-baseline gap-2">
            <dt class="w-16 shrink-0 text-[10px] font-semibold uppercase tracking-wide text-primary">
              {{ 'discovery.suggestion.benefit' | transloco }}
            </dt>
            <dd class="text-sm leading-snug text-muted-foreground">{{ suggestion().draftBenefit }}</dd>
          </div>
        </dl>
      }
    </ng-template>

    <!-- Edge-case body: a single editable criterion (scenario/given/when/then). -->
    <ng-template #edgeCaseBody>
      @if (editing()) {
        <div class="flex flex-col gap-2" data-testid="edge-criterion-edit">
          <ng-container
            [ngTemplateOutlet]="criterionFields"
            [ngTemplateOutletContext]="{ criterion: model().criteria[0], index: 0 }"
          />
        </div>
      } @else if (firstCriterion(); as c) {
        <div class="text-sm leading-relaxed">
          @if (c.scenario) {
            <p class="font-medium">{{ c.scenario }}</p>
          }
          <p class="mt-1 text-muted-foreground">
            <span class="font-semibold text-primary">{{
              'discovery.suggestion.criteriaGiven' | transloco
            }}</span>
            {{ c.given }} ·
            <span class="font-semibold text-primary">{{
              'discovery.suggestion.criteriaWhen' | transloco
            }}</span>
            {{ c.when }} ·
            <span class="font-semibold text-primary">{{
              'discovery.suggestion.criteriaThen' | transloco
            }}</span>
            {{ c.then }}
          </p>
        </div>
      } @else {
        <p class="text-sm text-muted-foreground">
          {{ 'discovery.suggestion.noCriterion' | transloco }}
        </p>
      }
    </ng-template>

    <!-- NEW_STORY criteria list editor: add / edit / remove. -->
    <ng-template #criteriaEditor>
      @if (editing()) {
        <div class="mt-3 flex flex-col gap-2" data-testid="criteria-editor">
          <p class="text-[11px] font-medium uppercase text-muted-foreground">
            {{ 'discovery.suggestion.criteria' | transloco }}
          </p>
          @for (criterion of model().criteria; track $index) {
            <div class="rounded-lg border border-border bg-background/40 p-2.5">
              <div class="mb-1.5 flex items-center justify-between">
                <span class="text-[10px] font-medium uppercase text-muted-foreground">
                  {{ 'discovery.suggestion.criterion' | transloco }} {{ $index + 1 }}
                </span>
                <button
                  type="button"
                  class="text-muted-foreground transition-colors hover:text-destructive"
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

    <!-- Shared editable G/W/T fields for one criterion at the given index. -->
    <ng-template #criterionFields let-criterion="criterion" let-index="index">
      <div class="flex flex-col gap-1.5">
        <input
          hlmInput
          class="h-8 text-xs"
          [placeholder]="'discovery.suggestion.scenario' | transloco"
          [ngModel]="criterion.scenario"
          (ngModelChange)="patchCriterion(index, { scenario: $event })"
          data-testid="criterion-scenario"
        />
        <div class="grid gap-1.5 sm:grid-cols-3">
          <input
            hlmInput
            class="h-8 text-xs"
            [placeholder]="'discovery.suggestion.criteriaGiven' | transloco"
            [ngModel]="criterion.given"
            (ngModelChange)="patchCriterion(index, { given: $event })"
            data-testid="criterion-given"
          />
          <input
            hlmInput
            class="h-8 text-xs"
            [placeholder]="'discovery.suggestion.criteriaWhen' | transloco"
            [ngModel]="criterion.when"
            (ngModelChange)="patchCriterion(index, { when: $event })"
            data-testid="criterion-when"
          />
          <input
            hlmInput
            class="h-8 text-xs"
            [placeholder]="'discovery.suggestion.criteriaThen' | transloco"
            [ngModel]="criterion.then"
            (ngModelChange)="patchCriterion(index, { then: $event })"
            data-testid="criterion-then"
          />
        </div>
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
  protected readonly priorities = PRIORITIES;

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

  /** Questions are "resolved", not "accepted" — accepting just records them as addressed. */
  protected readonly acceptLabel = computed(() =>
    this.suggestion().type === 'CLARIFYING_QUESTION'
      ? 'discovery.suggestion.resolve'
      : this.editing()
        ? 'discovery.suggestion.saveAndAccept'
        : 'discovery.suggestion.accept',
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

  protected addCriterion(): void {
    this.model.update((m) => ({ ...m, criteria: [...m.criteria, emptyEditableCriterion()] }));
  }

  protected removeCriterion(index: number): void {
    this.model.update((m) => ({ ...m, criteria: m.criteria.filter((_, i) => i !== index) }));
  }

  /** True when the proposed field differs from the target story (UPDATE_STORY highlight). */
  protected isChanged(field: 'title' | 'role' | 'action' | 'benefit'): boolean {
    if (this.suggestion().type !== 'UPDATE_STORY') return false;
    const target = this.targetStory();
    if (!target) return false;
    const draft: Record<typeof field, string | null> = {
      title: this.suggestion().draftTitle,
      role: this.suggestion().draftRole,
      action: this.suggestion().draftAction,
      benefit: this.suggestion().draftBenefit,
    };
    return (draft[field] ?? '') !== (target[field] ?? '');
  }

  protected onAccept(): void {
    if (!this.editing()) {
      this.accept.emit({});
      return;
    }
    this.accept.emit(editableToAcceptRequest(this.suggestion(), this.model()));
    this.editing.set(false);
  }

  protected priorityClass(priority: string): string {
    const classes: Record<string, string> = {
      CRITICAL: 'bg-destructive/20 text-destructive',
      HIGH: 'bg-destructive/15 text-destructive',
      MEDIUM: 'bg-amber-500/15 text-amber-600',
      LOW: 'bg-secondary text-muted-foreground',
    };
    return classes[priority] ?? 'bg-secondary text-muted-foreground';
  }
}
