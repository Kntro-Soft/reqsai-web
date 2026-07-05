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
import { lucideCircleHelp, lucideSparkles } from '@ng-icons/lucide';
import {
  AcceptSuggestionRequest,
  DisplayStory,
  SuggestionPriority,
  SuggestionResponse,
  suggestionCriteria,
} from '../../data/discovery.models';
import { HlmButton, HlmIcon, HlmInput, HlmSpinner } from '../../../../shared/ui';

const PRIORITIES: SuggestionPriority[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

/**
 * One AI suggestion rendered per type (draft story, story update diff, edge
 * case, clarifying question) with Accept / Dismiss and inline editing.
 * Read-only when `canDecide` is false. `openTarget` asks the page to reveal
 * the target story in the side panel.
 */
@Component({
  selector: 'app-suggestion-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgTemplateOutlet, FormsModule, HlmButton, HlmInput, HlmIcon, HlmSpinner, TranslocoPipe],
  viewProviders: [provideIcons({ lucideCircleHelp, lucideSparkles })],
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
            [class]="priorityClass(ePriority())"
          >
            {{ 'discovery.suggestion.priority.' + ePriority() | transloco }}
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
            <!-- "Updates: <target title>" -->
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
                  <p class="mt-1 text-xs leading-relaxed text-muted-foreground">
                    {{ 'discovery.story.as' | transloco }} {{ cur.role
                    }}{{ 'discovery.story.want' | transloco }} {{ cur.action
                    }}{{ 'discovery.story.soThat' | transloco }} {{ cur.benefit }}.
                  </p>
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
            @if (targetStory(); as cur) {
              <p class="mb-2.5 text-sm">
                <span class="font-medium text-muted-foreground"
                  >{{ 'discovery.suggestion.forStory' | transloco }} </span
                ><span class="font-medium text-foreground">{{ cur.title }}</span>
              </p>
            }
            <div class="rounded-xl border border-primary/40 p-3">
              <p class="mb-1 text-[11px] font-medium uppercase text-primary">
                {{ 'discovery.suggestion.scenarioToAdd' | transloco }}
              </p>
              <ng-container [ngTemplateOutlet]="storyBody" />
            </div>
          }
          @default {
            <ng-container [ngTemplateOutlet]="storyBody" />
          }
        }

        <!-- Acceptance criteria preview: structured Given/When/Then per item, an
             optional scenario as a subtle heading. Only when a valid one exists. -->
        @if (!editing() && criteria().length > 0) {
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
            {{ 'discovery.suggestion.accept' | transloco }}
          </button>
          @if (suggestion().type !== 'CLARIFYING_QUESTION') {
            <button
              hlmBtn
              size="sm"
              variant="outline"
              type="button"
              [disabled]="busy()"
              (click)="editing.set(!editing())"
            >
              {{
                (editing() ? 'discovery.suggestion.done' : 'discovery.suggestion.edit') | transloco
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

    <ng-template #storyBody>
      @if (editing()) {
        <div class="flex flex-col gap-2.5">
          <div class="flex flex-col gap-1">
            <span class="text-xs text-muted-foreground">{{
              (suggestion().type === 'EDGE_CASE'
                ? 'discovery.suggestion.scenario'
                : 'discovery.suggestion.titleField'
              ) | transloco
            }}</span>
            <input hlmInput class="h-9" [ngModel]="eTitle()" (ngModelChange)="eTitle.set($event)" />
          </div>
          <div class="grid gap-2 sm:grid-cols-3">
            <input
              hlmInput
              class="h-9"
              [placeholder]="'discovery.suggestion.role' | transloco"
              [ngModel]="eRole()"
              (ngModelChange)="eRole.set($event)"
            />
            <input
              hlmInput
              class="h-9"
              [placeholder]="'discovery.suggestion.action' | transloco"
              [ngModel]="eAction()"
              (ngModelChange)="eAction.set($event)"
            />
            <input
              hlmInput
              class="h-9"
              [placeholder]="'discovery.suggestion.benefit' | transloco"
              [ngModel]="eBenefit()"
              (ngModelChange)="eBenefit.set($event)"
            />
          </div>
          @if (suggestion().type !== 'EDGE_CASE') {
            <div class="flex items-end gap-2">
              <div class="flex flex-col gap-1">
                <span class="text-xs text-muted-foreground">{{
                  'discovery.suggestion.priorityField' | transloco
                }}</span>
                <select
                  class="h-9 rounded-md border border-input bg-background px-2 text-sm"
                  [ngModel]="ePriority()"
                  (ngModelChange)="ePriority.set($event)"
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
                  [ngModel]="ePoints()"
                  (ngModelChange)="ePoints.set($event)"
                />
              </div>
            </div>
          }
        </div>
      } @else if (suggestion().type === 'EDGE_CASE') {
        <div class="text-sm leading-relaxed">
          <p class="font-medium">{{ eTitle() }}</p>
          <p class="mt-1 text-muted-foreground">
            <span class="text-foreground">{{ 'discovery.suggestion.given' | transloco }}</span>
            {{ eRole() }},
            <span class="text-foreground">{{ 'discovery.suggestion.when' | transloco }}</span>
            {{ eAction() }},
            <span class="text-foreground">{{ 'discovery.suggestion.then' | transloco }}</span>
            {{ eBenefit() }}.
          </p>
        </div>
      } @else {
        <p class="text-sm font-medium">{{ eTitle() }}</p>
        <!-- Como / quiero / para — each part on its own labelled row. -->
        <dl class="mt-2 flex flex-col gap-1.5">
          <div class="flex items-baseline gap-2">
            <dt
              class="w-16 shrink-0 text-[10px] font-semibold uppercase tracking-wide text-primary"
            >
              {{ 'discovery.suggestion.role' | transloco }}
            </dt>
            <dd class="text-sm leading-snug text-foreground">{{ eRole() }}</dd>
          </div>
          <div class="flex items-baseline gap-2">
            <dt
              class="w-16 shrink-0 text-[10px] font-semibold uppercase tracking-wide text-primary"
            >
              {{ 'discovery.suggestion.action' | transloco }}
            </dt>
            <dd class="text-sm leading-snug text-foreground">{{ eAction() }}</dd>
          </div>
          <div class="flex items-baseline gap-2">
            <dt
              class="w-16 shrink-0 text-[10px] font-semibold uppercase tracking-wide text-primary"
            >
              {{ 'discovery.suggestion.benefit' | transloco }}
            </dt>
            <dd class="text-sm leading-snug text-muted-foreground">{{ eBenefit() }}</dd>
          </div>
        </dl>
      }
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

  /** Proposed acceptance criteria, normalized (array or newline string) for the checklist preview. */
  protected readonly criteria = computed(() => suggestionCriteria(this.suggestion().draftAcceptanceCriteria));

  protected readonly eTitle = linkedSignal(() => this.suggestion().draftTitle ?? '');
  protected readonly eRole = linkedSignal(() => this.suggestion().draftRole ?? '');
  protected readonly eAction = linkedSignal(() => this.suggestion().draftAction ?? '');
  protected readonly eBenefit = linkedSignal(() => this.suggestion().draftBenefit ?? '');
  protected readonly ePriority = linkedSignal<SuggestionPriority>(
    () => this.suggestion().draftPriority ?? 'MEDIUM',
  );
  protected readonly ePoints = linkedSignal<number | null>(
    () => this.suggestion().draftStoryPoints,
  );

  protected onAccept(): void {
    if (!this.editing()) {
      this.accept.emit({});
      return;
    }
    this.accept.emit({
      editedTitle: this.eTitle() || undefined,
      editedRole: this.eRole() || undefined,
      editedAction: this.eAction() || undefined,
      editedBenefit: this.eBenefit() || undefined,
      editedPriority: this.ePriority(),
      editedStoryPoints: this.ePoints() ?? undefined,
    });
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
