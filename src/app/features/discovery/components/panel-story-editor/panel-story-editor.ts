import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { provideIcons } from '@ng-icons/core';
import {
  lucideArrowUpRight,
  lucideCheck,
  lucidePencilLine,
  lucideRotateCcw,
  lucideX,
} from '@ng-icons/lucide';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { DiscoveryApiService } from '../../data/discovery-api.service';
import { DiscoveryChatStore } from '../../data/discovery-chat.store';
import {
  DisplayStory,
  StoryPriority,
  StoryReviewStatus,
  UpdateUserStoryRequest,
} from '../../data/discovery.models';
import {
  duplicateStorySimilarityPercent,
  isConflict,
  problemCode,
} from '../../data/duplicate-error';
import { reviewTargets } from '../../pages/stories/story-review.helpers';
import { GherkinSteps } from '../gherkin-steps/gherkin-steps';
import { Select, SelectOption } from '../../../../shared/components/select/select';
import { HasPermission } from '../../../../shared/directives/has-permission';
import { ToastService } from '../../../../shared/toast/toast.service';
import { messageForError } from '../../../../core/errors/error-message';
import { translateFn } from '../../../../core/i18n/translate-fn';
import { HlmButton, HlmIcon, HlmInput, HlmLabel, HlmSpinner } from '../../../../shared/ui';

const PRIORITIES: readonly StoryPriority[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

/** Compact button sizing for the narrow side panel (overrides hlmBtn's sm height). */
const COMPACT = 'h-8 gap-1.5 px-2.5 text-xs';

/**
 * The expanded body of a story in the capture page's side panel. It reads like the backlog card
 * (Como … quiero … para …, then the acceptance criteria) and lets the analyst act on the story
 * without leaving the meeting: record the review decision (STORY_APPROVE) or edit the story's
 * core fields inline (STORY_WRITE). Criteria stay on the story page, one link away.
 */
@Component({
  selector: 'app-panel-story-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    GherkinSteps,
    Select,
    HasPermission,
    HlmButton,
    HlmIcon,
    HlmInput,
    HlmLabel,
    HlmSpinner,
    TranslocoPipe,
  ],
  viewProviders: [
    provideIcons({ lucideArrowUpRight, lucideCheck, lucidePencilLine, lucideRotateCcw, lucideX }),
  ],
  template: `
    @if (!editing()) {
      <div data-testid="panel-story-body">
        <p class="text-xs leading-relaxed text-muted-foreground">
          {{ 'discovery.story.as' | transloco }}
          <span class="text-foreground">{{ story().role }}</span
          >{{ 'discovery.story.want' | transloco }}
          <span class="text-foreground">{{ story().action }}</span
          >{{ 'discovery.story.soThat' | transloco }}
          <span class="text-foreground">{{ story().benefit }}</span
          >.
        </p>
        @if (story().acceptanceCriteria.length > 0) {
          <p class="mb-1.5 mt-3 text-xs font-medium text-muted-foreground">
            {{ 'discovery.suggestion.criteria' | transloco }}
          </p>
          <ul class="flex flex-col gap-1.5" data-testid="panel-story-criteria">
            @for (c of story().acceptanceCriteria; track $index) {
              <li class="rounded-lg bg-muted/60 px-2.5 py-2">
                <app-gherkin-steps [criterion]="c" size="sm" />
              </li>
            }
          </ul>
        }

        <!-- A container query keeps the row on one line: in the narrow desktop panel "Editar"
             shows only its icon (named by aria-label); wider panels spell it out. -->
        <div
          class="@container mt-3 flex items-center gap-1.5 border-t border-border/60 pt-3"
          data-testid="panel-story-actions"
        >
          <ng-container *appHasPermission="'STORY_APPROVE'">
            @for (target of reviewOptions(); track target) {
              <button
                hlmBtn
                [variant]="target === 'APPROVED' ? 'default' : 'outline'"
                [class]="compact"
                type="button"
                (click)="review(target)"
                [disabled]="busy()"
                [attr.data-testid]="'panel-story-review-' + target.toLowerCase()"
              >
                @if (reviewing() === target) {
                  <hlm-spinner class="h-3.5 w-3.5" />
                } @else {
                  <hlm-icon [name]="reviewIcons[target]" size="14px" />
                }
                {{ 'stories.review.action.' + target | transloco }}
              </button>
            }
          </ng-container>
          <span class="ml-auto flex items-center gap-0.5">
            <button
              *appHasPermission="'STORY_WRITE'"
              hlmBtn
              variant="ghost"
              [class]="compact"
              type="button"
              (click)="startEdit()"
              [disabled]="busy()"
              [attr.aria-label]="'discovery.panel.edit' | transloco"
              [title]="'discovery.panel.edit' | transloco"
              data-testid="panel-story-edit"
            >
              <hlm-icon name="lucidePencilLine" size="14px" />
              <span class="hidden @min-[21rem]:inline">{{
                'discovery.panel.edit' | transloco
              }}</span>
            </button>
            <a
              hlmBtn
              variant="ghost"
              [class]="compact + ' px-2'"
              [routerLink]="['/projects', projectId(), 'stories', story().id]"
              [attr.aria-label]="'discovery.panel.openStory' | transloco"
              [title]="'discovery.panel.openStory' | transloco"
              data-testid="panel-story-open"
            >
              <hlm-icon name="lucideArrowUpRight" size="14px" />
            </a>
          </span>
        </div>
      </div>
    } @else {
      <form
        [formGroup]="form"
        (ngSubmit)="save()"
        (keydown.escape)="cancelEdit()"
        class="flex flex-col gap-2.5"
        data-testid="panel-story-form"
      >
        <div class="flex flex-col gap-1">
          <label hlmLabel class="text-xs" [for]="fieldId('title')">{{
            'storyForm.fieldTitle' | transloco
          }}</label>
          <input
            hlmInput
            class="h-8 text-sm"
            [id]="fieldId('title')"
            formControlName="title"
            maxlength="200"
            data-testid="panel-story-title-input"
          />
        </div>
        @for (field of sentenceFields; track field.key) {
          <div class="flex flex-col gap-1">
            <label hlmLabel class="text-xs" [for]="fieldId(field.key)">{{
              field.label | transloco
            }}</label>
            <textarea
              hlmInput
              rows="2"
              class="min-h-0 resize-none py-1.5 text-sm leading-snug"
              [id]="fieldId(field.key)"
              [formControlName]="field.key"
              maxlength="500"
              [attr.data-testid]="'panel-story-' + field.key + '-input'"
            ></textarea>
          </div>
        }
        <div class="flex items-end gap-2">
          <div class="flex min-w-0 flex-1 flex-col gap-1">
            <span hlmLabel class="text-xs">{{ 'storyForm.fieldPriority' | transloco }}</span>
            <app-select
              size="sm"
              [options]="priorityOptions()"
              [value]="form.controls.priority.value"
              (valueChange)="setPriority($event)"
              [ariaLabel]="'storyForm.fieldPriority' | transloco"
            />
          </div>
          <div class="flex w-[7.5rem] shrink-0 flex-col gap-1">
            <label hlmLabel class="whitespace-nowrap text-xs" [for]="fieldId('points')">{{
              'storyForm.fieldPoints' | transloco
            }}</label>
            <input
              hlmInput
              type="number"
              min="0"
              class="h-8 text-sm tabular-nums"
              [id]="fieldId('points')"
              formControlName="storyPoints"
              data-testid="panel-story-points-input"
            />
          </div>
        </div>
        @if (error()) {
          <p class="text-xs leading-relaxed text-destructive" role="alert">{{ error() }}</p>
        }
        <div class="flex items-center justify-end gap-1.5 pt-0.5">
          <button
            hlmBtn
            variant="ghost"
            [class]="compact"
            type="button"
            (click)="cancelEdit()"
            [disabled]="saving()"
            data-testid="panel-story-cancel"
          >
            {{ 'common.cancel' | transloco }}
          </button>
          <button
            hlmBtn
            [class]="compact"
            type="submit"
            [disabled]="saving() || form.invalid || form.pristine"
            data-testid="panel-story-save"
          >
            @if (saving()) {
              <hlm-spinner class="h-3.5 w-3.5" />
            }
            {{ 'storyForm.save' | transloco }}
          </button>
        </div>
      </form>
    }
  `,
})
export class PanelStoryEditor {
  private readonly api = inject(DiscoveryApiService);
  private readonly store = inject(DiscoveryChatStore);
  private readonly toast = inject(ToastService);
  private readonly transloco = inject(TranslocoService);
  private readonly fb = inject(FormBuilder);

  readonly projectId = input.required<string>();
  readonly story = input.required<DisplayStory>();

  protected readonly compact = COMPACT;
  protected readonly editing = signal(false);
  protected readonly saving = signal(false);
  protected readonly reviewing = signal<StoryReviewStatus | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly busy = computed(() => this.saving() || this.reviewing() !== null);

  /** Review decisions offered for the story's current status (none once merged or exported). */
  protected readonly reviewOptions = computed(() => reviewTargets(this.story().status));
  protected readonly reviewIcons: Record<StoryReviewStatus, string> = {
    APPROVED: 'lucideCheck',
    REJECTED: 'lucideX',
    DRAFT: 'lucideRotateCcw',
  };

  protected readonly sentenceFields = [
    { key: 'role', label: 'storyForm.fieldRole' },
    { key: 'action', label: 'storyForm.fieldAction' },
    { key: 'benefit', label: 'storyForm.fieldBenefit' },
  ] as const;

  protected readonly form = this.fb.nonNullable.group({
    title: ['', [Validators.required, Validators.maxLength(200)]],
    role: ['', [Validators.required, Validators.maxLength(500)]],
    action: ['', [Validators.required, Validators.maxLength(500)]],
    benefit: ['', [Validators.required, Validators.maxLength(500)]],
    priority: ['MEDIUM' as StoryPriority, [Validators.required]],
    storyPoints: [null as number | null],
  });

  private readonly translate = translateFn(this.transloco);

  protected readonly priorityOptions = computed<SelectOption[]>(() => {
    const t = this.translate();
    if (!t) return [];
    return PRIORITIES.map((p) => ({ value: p, label: t('stories.priority.' + p) }));
  });

  /** Unique ids per card, so labels point at their own fields when several cards are open. */
  protected fieldId(name: string): string {
    return `panel-story-${this.story().id}-${name}`;
  }

  protected startEdit(): void {
    const s = this.story();
    const priority = (s.priority ?? '').toUpperCase() as StoryPriority;
    this.form.reset({
      title: s.title,
      role: s.role,
      action: s.action,
      benefit: s.benefit,
      priority: PRIORITIES.includes(priority) ? priority : 'MEDIUM',
      storyPoints: s.storyPoints ?? null,
    });
    this.error.set(null);
    this.editing.set(true);
  }

  protected cancelEdit(): void {
    if (this.saving()) return;
    this.editing.set(false);
    this.error.set(null);
  }

  protected setPriority(value: string): void {
    this.form.controls.priority.setValue(value as StoryPriority);
    this.form.controls.priority.markAsDirty();
  }

  protected save(): void {
    if (this.form.invalid || this.form.pristine || this.saving()) return;
    const raw = this.form.getRawValue();
    const body: UpdateUserStoryRequest = {
      title: raw.title.trim(),
      role: raw.role.trim(),
      action: raw.action.trim(),
      benefit: raw.benefit.trim(),
      priority: raw.priority,
      storyPoints:
        raw.storyPoints != null && `${raw.storyPoints}` !== '' ? Number(raw.storyPoints) : null,
    };
    this.saving.set(true);
    this.error.set(null);
    this.api.updateStory(this.projectId(), this.story().id, body).subscribe({
      next: (updated) => {
        this.saving.set(false);
        this.store.applyStoryUpdate(updated);
        this.editing.set(false);
        this.toast.success(this.transloco.translate('storyForm.saved'));
      },
      error: (err: unknown) => {
        this.saving.set(false);
        this.error.set(this.errorMessage(err));
      },
    });
  }

  /** Records the review decision; the card's status badge follows from the store. */
  protected review(target: StoryReviewStatus): void {
    if (this.busy()) return;
    this.reviewing.set(target);
    this.api.changeStoryStatus(this.projectId(), this.story().id, target).subscribe({
      next: (updated) => {
        this.reviewing.set(null);
        this.store.applyStoryUpdate(updated);
        this.toast.success(this.transloco.translate('stories.review.done.' + target));
      },
      error: (err: unknown) => {
        this.reviewing.set(null);
        this.toast.error(messageForError(err, this.transloco));
      },
    });
  }

  /** A duplicate 409 names the similarity score, like the story page does. */
  private errorMessage(err: unknown): string {
    if (isConflict(err) && problemCode(err) === 'DUPLICATE_USER_STORY') {
      const percent = duplicateStorySimilarityPercent(err);
      return percent !== null
        ? this.transloco.translate('stories.errorDuplicate', { percent })
        : this.transloco.translate('stories.errorDuplicateNoScore');
    }
    return messageForError(err, this.transloco);
  }
}
