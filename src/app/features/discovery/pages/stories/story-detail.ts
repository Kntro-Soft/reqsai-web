import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { provideIcons } from '@ng-icons/core';
import { lucideArrowLeft, lucidePlus, lucideTrash2 } from '@ng-icons/lucide';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { DiscoveryApiService } from '../../data/discovery-api.service';
import {
  AcceptanceCriterionResponse,
  StoryPriority,
  UpdateUserStoryRequest,
  UserStoryResponse,
} from '../../data/discovery.models';
import {
  duplicateStorySimilarityPercent,
  isConflict,
  problemCode,
} from '../../data/duplicate-error';
import { Select, SelectOption } from '../../../../shared/components/select/select';
import { ToastService } from '../../../../shared/toast/toast.service';
import { messageForError } from '../../../../core/errors/error-message';
import { translateFn } from '../../../../core/i18n/translate-fn';
import {
  HlmButton,
  HlmIcon,
  HlmInput,
  HlmLabel,
  HlmSkeleton,
  HlmSpinner,
} from '../../../../shared/ui';
import {
  CriterionRow,
  criterionToRow,
  emptyCriterionRow,
  isCompleteRow,
  rowToRequest,
} from './story-form.helpers';

/**
 * Story detail / edit page. Loads a story with its acceptance criteria; the core
 * fields are edited and persisted via PUT ("Guardar"), while criteria are managed
 * inline — each row saves individually (POST for a new row, PUT for an existing
 * one) and removes via DELETE (a not-yet-saved new row is just dropped). Back link
 * returns to the backlog list.
 */
@Component({
  selector: 'app-story-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    Select,
    HlmButton,
    HlmIcon,
    HlmInput,
    HlmLabel,
    HlmSkeleton,
    HlmSpinner,
    TranslocoPipe,
  ],
  viewProviders: [provideIcons({ lucideArrowLeft, lucidePlus, lucideTrash2 })],
  template: `
    <div class="flex flex-col gap-6">
      <div class="flex flex-col gap-3">
        <a
          [routerLink]="['/projects', projectId(), 'stories']"
          class="flex w-fit items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          data-testid="story-detail-back"
        >
          <hlm-icon name="lucideArrowLeft" size="15px" />
          {{ 'storyForm.back' | transloco }}
        </a>
        <h1 class="text-2xl font-bold tracking-tight">{{ 'storyForm.editTitle' | transloco }}</h1>
      </div>

      @if (state() === 'loading') {
        <section
          class="flex flex-col gap-4 rounded-2xl border border-border p-5"
          data-testid="story-detail-skeleton"
        >
          <hlm-skeleton class="h-10 w-full max-w-sm rounded-md" />
          <hlm-skeleton class="h-24 w-full rounded-md" />
          <hlm-skeleton class="h-24 w-full rounded-md" />
        </section>
      } @else if (state() === 'error') {
        <p class="text-sm text-destructive">{{ 'storyForm.loadError' | transloco }}</p>
      } @else {
        <!-- Core fields -->
        <form
          [formGroup]="form"
          (ngSubmit)="save()"
          class="flex flex-col gap-4 rounded-2xl border border-border p-5"
        >
          <div class="flex flex-col gap-1.5">
            <label hlmLabel for="title">{{ 'storyForm.fieldTitle' | transloco }}</label>
            <input hlmInput id="title" formControlName="title" data-testid="story-title" />
          </div>
          <div class="grid gap-3 sm:grid-cols-3">
            <div class="flex flex-col gap-1.5">
              <label hlmLabel for="role">{{ 'storyForm.fieldRole' | transloco }}</label>
              <textarea hlmInput id="role" rows="2" formControlName="role"></textarea>
            </div>
            <div class="flex flex-col gap-1.5">
              <label hlmLabel for="action">{{ 'storyForm.fieldAction' | transloco }}</label>
              <textarea hlmInput id="action" rows="2" formControlName="action"></textarea>
            </div>
            <div class="flex flex-col gap-1.5">
              <label hlmLabel for="benefit">{{ 'storyForm.fieldBenefit' | transloco }}</label>
              <textarea hlmInput id="benefit" rows="2" formControlName="benefit"></textarea>
            </div>
          </div>
          <div class="flex flex-wrap items-end gap-3">
            <div class="flex flex-col gap-1.5">
              <span hlmLabel>{{ 'storyForm.fieldPriority' | transloco }}</span>
              <app-select
                [options]="priorityOptions()"
                [value]="form.controls.priority.value"
                (valueChange)="form.controls.priority.setValue($any($event))"
                [ariaLabel]="'storyForm.fieldPriority' | transloco"
              />
            </div>
            <div class="flex flex-col gap-1.5">
              <label hlmLabel for="points">{{ 'storyForm.fieldPoints' | transloco }}</label>
              <input
                hlmInput
                id="points"
                type="number"
                min="0"
                class="w-28"
                formControlName="storyPoints"
              />
            </div>
            <button
              hlmBtn
              size="sm"
              type="submit"
              class="ml-auto"
              [disabled]="form.invalid || saving()"
              data-testid="story-save"
            >
              @if (saving()) {
                <hlm-spinner class="h-4 w-4" />
              }
              {{ 'storyForm.save' | transloco }}
            </button>
          </div>
          @if (formError()) {
            <p class="text-sm text-destructive" data-testid="story-form-error">{{ formError() }}</p>
          }
        </form>

        <!-- Acceptance criteria (managed inline) -->
        <section class="flex flex-col gap-3 rounded-2xl border border-border p-5">
          <div class="flex items-center justify-between">
            <h2 class="text-base font-semibold">{{ 'storyForm.criteriaTitle' | transloco }}</h2>
            <button
              hlmBtn
              size="sm"
              variant="outline"
              type="button"
              (click)="addRow()"
              data-testid="criteria-add"
            >
              <hlm-icon name="lucidePlus" size="14px" />
              {{ 'storyForm.criteriaAdd' | transloco }}
            </button>
          </div>

          @if (criteria().length === 0) {
            <p
              class="rounded-xl border border-dashed border-border px-3 py-4 text-sm text-muted-foreground"
            >
              {{ 'storyForm.criteriaEmpty' | transloco }}
            </p>
          }

          @for (row of criteria(); track $index; let i = $index) {
            <div
              class="flex flex-col gap-2.5 rounded-xl border border-border bg-muted/20 p-3"
              data-testid="criteria-row"
            >
              <div class="flex items-start gap-2">
                <input
                  hlmInput
                  class="flex-1"
                  [value]="row.scenario"
                  (input)="patch(i, 'scenario', $any($event.target).value)"
                  [placeholder]="'storyForm.criteriaScenario' | transloco"
                  data-testid="criteria-scenario"
                />
                <button
                  type="button"
                  (click)="removeRow(i)"
                  [attr.aria-label]="'storyForm.criteriaRemove' | transloco"
                  class="mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                  data-testid="criteria-remove"
                >
                  <hlm-icon name="lucideTrash2" size="15px" />
                </button>
              </div>
              <div class="grid gap-2 sm:grid-cols-3">
                <label hlmLabel class="flex flex-col gap-1 text-xs">
                  {{ 'storyForm.criteriaGiven' | transloco }}
                  <textarea
                    hlmInput
                    rows="2"
                    [value]="row.given"
                    (input)="patch(i, 'given', $any($event.target).value)"
                    data-testid="criteria-given"
                  ></textarea>
                </label>
                <label hlmLabel class="flex flex-col gap-1 text-xs">
                  {{ 'storyForm.criteriaWhen' | transloco }}
                  <textarea
                    hlmInput
                    rows="2"
                    [value]="row.when"
                    (input)="patch(i, 'when', $any($event.target).value)"
                    data-testid="criteria-when"
                  ></textarea>
                </label>
                <label hlmLabel class="flex flex-col gap-1 text-xs">
                  {{ 'storyForm.criteriaThen' | transloco }}
                  <textarea
                    hlmInput
                    rows="2"
                    [value]="row.then"
                    (input)="patch(i, 'then', $any($event.target).value)"
                    data-testid="criteria-then"
                  ></textarea>
                </label>
              </div>
              <div class="flex justify-end">
                <button
                  hlmBtn
                  size="sm"
                  variant="outline"
                  type="button"
                  [disabled]="rowBusy() === i"
                  (click)="saveRow(i)"
                  data-testid="criteria-save"
                >
                  @if (rowBusy() === i) {
                    <hlm-spinner class="h-4 w-4" />
                  }
                  {{
                    (row.id ? 'storyForm.criteriaUpdate' : 'storyForm.criteriaCreate') | transloco
                  }}
                </button>
              </div>
            </div>
          }
        </section>
      }
    </div>
  `,
})
export class StoryDetail implements OnInit {
  private readonly api = inject(DiscoveryApiService);
  private readonly fb = inject(FormBuilder);
  private readonly transloco = inject(TranslocoService);
  private readonly toast = inject(ToastService);

  /** Both bound from the route via withComponentInputBinding(). */
  readonly projectId = input.required<string>();
  readonly storyId = input.required<string>();

  protected readonly state = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly saving = signal(false);
  protected readonly formError = signal<string | null>(null);
  protected readonly criteria = signal<CriterionRow[]>([]);
  /** Index of the criterion row currently saving/deleting, or null. */
  protected readonly rowBusy = signal<number | null>(null);

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
    return (['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const).map((p) => ({
      value: p,
      label: t('stories.priority.' + p),
    }));
  });

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.state.set('loading');
    this.api.getStory(this.projectId(), this.storyId()).subscribe({
      next: (story) => {
        this.seed(story);
        this.state.set('ready');
      },
      error: () => this.state.set('error'),
    });
  }

  private seed(story: UserStoryResponse): void {
    this.form.reset({
      title: story.title,
      role: story.role,
      action: story.action,
      benefit: story.benefit,
      priority: (story.priority as StoryPriority) ?? 'MEDIUM',
      storyPoints: story.storyPoints,
    });
    const rows = (story.acceptanceCriteria ?? [])
      .filter((c): c is AcceptanceCriterionResponse => !!c && 'id' in c)
      .map(criterionToRow);
    this.criteria.set(rows);
  }

  protected save(): void {
    if (this.form.invalid || this.saving()) return;
    this.saving.set(true);
    this.formError.set(null);
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
    this.api.updateStory(this.projectId(), this.storyId(), body).subscribe({
      next: () => {
        this.saving.set(false);
        this.toast.success(this.transloco.translate('storyForm.saved'));
      },
      error: (err: unknown) => {
        this.saving.set(false);
        const message = this.errorMessage(err);
        this.formError.set(message);
        this.toast.error(message);
      },
    });
  }

  protected addRow(): void {
    this.criteria.update((list) => [...list, emptyCriterionRow()]);
  }

  protected patch(index: number, key: keyof CriterionRow, value: string): void {
    this.criteria.update((list) =>
      list.map((row, i) => (i === index ? { ...row, [key]: value } : row)),
    );
  }

  /** Removes a row: DELETE an existing criterion, or just drop an unsaved one. */
  protected removeRow(index: number): void {
    const row = this.criteria()[index];
    if (!row) return;
    if (!row.id) {
      this.criteria.update((list) => list.filter((_, i) => i !== index));
      return;
    }
    this.rowBusy.set(index);
    this.api.deleteCriterion(this.projectId(), this.storyId(), row.id).subscribe({
      next: () => {
        this.rowBusy.set(null);
        this.criteria.update((list) => list.filter((_, i) => i !== index));
        this.toast.success(this.transloco.translate('storyForm.criteriaDeleted'));
      },
      error: (err) => {
        this.rowBusy.set(null);
        this.toast.error(messageForError(err, this.transloco));
      },
    });
  }

  /** Saves a row: POST when new, PUT when it already has an id. */
  protected saveRow(index: number): void {
    const row = this.criteria()[index];
    if (!row || this.rowBusy() !== null) return;
    if (!isCompleteRow(row)) {
      this.toast.error(this.transloco.translate('storyForm.criteriaIncomplete'));
      return;
    }
    this.rowBusy.set(index);
    const request = rowToRequest(row);
    const call = row.id
      ? this.api.updateCriterion(this.projectId(), this.storyId(), row.id, request)
      : this.api.addCriterion(this.projectId(), this.storyId(), request);
    call.subscribe({
      next: (saved) => {
        this.rowBusy.set(null);
        this.criteria.update((list) =>
          list.map((r, i) => (i === index ? criterionToRow(saved) : r)),
        );
        this.toast.success(this.transloco.translate('storyForm.criteriaSaved'));
      },
      error: (err) => {
        this.rowBusy.set(null);
        this.toast.error(messageForError(err, this.transloco));
      },
    });
  }

  /** Turns an update error into a message; a duplicate 409 surfaces the similarity score. */
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
