import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { provideIcons } from '@ng-icons/core';
import { lucideArrowLeft } from '@ng-icons/lucide';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { DiscoveryApiService } from '../../data/discovery-api.service';
import { CreateUserStoryRequest, StoryPriority } from '../../data/discovery.models';
import {
  duplicateStorySimilarityPercent,
  isConflict,
  problemCode,
} from '../../data/duplicate-error';
import { Select, SelectOption } from '../../../../shared/components/select/select';
import { ToastService } from '../../../../shared/toast/toast.service';
import { messageForError } from '../../../../core/errors/error-message';
import { translateFn } from '../../../../core/i18n/translate-fn';
import { HlmButton, HlmIcon, HlmInput, HlmLabel, HlmSpinner } from '../../../../shared/ui';
import { CriteriaEditor } from './criteria-editor';
import { CriterionRow, emptyCriterionRow, partitionNewCriteria } from './story-form.helpers';

/**
 * Dedicated Create page for a user story: the full story form (title/role/action/
 * benefit + priority + story points) plus an inline acceptance-criteria editor.
 * On submit it POSTs the story, then POSTs each complete criterion; a criterion
 * that fails is surfaced without discarding the created story. A 409 duplicate
 * shows the backend similarity score. Navigates to the new story's detail page.
 */
@Component({
  selector: 'app-story-create',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    Select,
    CriteriaEditor,
    HlmButton,
    HlmIcon,
    HlmInput,
    HlmLabel,
    HlmSpinner,
    TranslocoPipe,
  ],
  viewProviders: [provideIcons({ lucideArrowLeft })],
  template: `
    <div class="flex flex-col gap-6">
      <div class="flex flex-col gap-3">
        <a
          [routerLink]="['/projects', projectId(), 'stories']"
          class="flex w-fit items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          data-testid="story-form-back"
        >
          <hlm-icon name="lucideArrowLeft" size="15px" />
          {{ 'storyForm.back' | transloco }}
        </a>
        <div>
          <h1 class="text-2xl font-bold tracking-tight">
            {{ 'storyForm.createTitle' | transloco }}
          </h1>
          <p class="mt-1 text-sm text-muted-foreground">
            {{ 'storyForm.createSubtitle' | transloco }}
          </p>
        </div>
      </div>

      <form [formGroup]="form" (ngSubmit)="submit()" class="flex flex-col gap-6">
        <section class="flex flex-col gap-4 rounded-2xl border border-border p-5">
          <div class="flex flex-col gap-1.5">
            <label hlmLabel for="title">{{ 'storyForm.fieldTitle' | transloco }}</label>
            <input
              hlmInput
              id="title"
              formControlName="title"
              [placeholder]="'storyForm.placeholderTitle' | transloco"
              data-testid="story-title"
            />
          </div>
          <div class="grid gap-3 sm:grid-cols-3">
            <div class="flex flex-col gap-1.5">
              <label hlmLabel for="role">{{ 'storyForm.fieldRole' | transloco }}</label>
              <textarea
                hlmInput
                id="role"
                rows="2"
                formControlName="role"
                [placeholder]="'storyForm.placeholderRole' | transloco"
              ></textarea>
            </div>
            <div class="flex flex-col gap-1.5">
              <label hlmLabel for="action">{{ 'storyForm.fieldAction' | transloco }}</label>
              <textarea
                hlmInput
                id="action"
                rows="2"
                formControlName="action"
                [placeholder]="'storyForm.placeholderAction' | transloco"
              ></textarea>
            </div>
            <div class="flex flex-col gap-1.5">
              <label hlmLabel for="benefit">{{ 'storyForm.fieldBenefit' | transloco }}</label>
              <textarea
                hlmInput
                id="benefit"
                rows="2"
                formControlName="benefit"
                [placeholder]="'storyForm.placeholderBenefit' | transloco"
              ></textarea>
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
                [placeholder]="'storyForm.placeholderPoints' | transloco"
              />
            </div>
          </div>
        </section>

        <section class="rounded-2xl border border-border p-5">
          <app-criteria-editor [(rows)]="criteria" [invalidIndexes]="invalidCriteria()" />
        </section>

        @if (formError()) {
          <p class="text-sm text-destructive" data-testid="story-form-error">{{ formError() }}</p>
        }

        <div class="flex justify-end gap-2">
          <a hlmBtn size="sm" variant="ghost" [routerLink]="['/projects', projectId(), 'stories']">
            {{ 'common.cancel' | transloco }}
          </a>
          <button
            hlmBtn
            size="sm"
            type="submit"
            [disabled]="form.invalid || submitting()"
            data-testid="story-submit"
          >
            @if (submitting()) {
              <hlm-spinner class="h-4 w-4" />
            }
            {{ 'storyForm.create' | transloco }}
          </button>
        </div>
      </form>
    </div>
  `,
})
export class StoryCreate {
  private readonly api = inject(DiscoveryApiService);
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly transloco = inject(TranslocoService);
  private readonly toast = inject(ToastService);

  readonly projectId = input.required<string>();

  protected readonly submitting = signal(false);
  protected readonly formError = signal<string | null>(null);
  protected readonly criteria = signal<CriterionRow[]>([emptyCriterionRow()]);
  protected readonly invalidCriteria = signal<number[]>([]);

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

  protected submit(): void {
    if (this.form.invalid || this.submitting()) return;
    const { requests, incompleteIndexes } = partitionNewCriteria(this.criteria());
    this.invalidCriteria.set(incompleteIndexes);
    if (incompleteIndexes.length > 0) {
      this.formError.set(this.transloco.translate('storyForm.criteriaIncomplete'));
      return;
    }
    this.submitting.set(true);
    this.formError.set(null);
    const raw = this.form.getRawValue();
    const body: CreateUserStoryRequest = {
      title: raw.title.trim(),
      role: raw.role.trim(),
      action: raw.action.trim(),
      benefit: raw.benefit.trim(),
      priority: raw.priority,
      storyPoints:
        raw.storyPoints != null && `${raw.storyPoints}` !== '' ? Number(raw.storyPoints) : null,
    };
    this.api.createStory(this.projectId(), body).subscribe({
      next: (created) => this.persistCriteria(created.id, requests),
      error: (err: unknown) => {
        this.submitting.set(false);
        const message = this.errorMessage(err);
        this.formError.set(message);
        this.toast.error(message);
      },
    });
  }

  /**
   * POSTs each criterion after the story is created. Partial failure is tolerated:
   * the story exists, so we still navigate to its detail page but warn which
   * criteria failed so the analyst can retry them there.
   */
  private persistCriteria(
    storyId: string,
    requests: ReturnType<typeof partitionNewCriteria>['requests'],
  ): void {
    if (requests.length === 0) {
      this.onCreated(storyId, 0);
      return;
    }
    forkJoin(
      requests.map((req, index) =>
        this.api.addCriterion(this.projectId(), storyId, req).pipe(
          map(() => null as number | null),
          catchError(() => of(index)),
        ),
      ),
    ).subscribe((results) => {
      const failed = results.filter((r): r is number => r !== null);
      this.onCreated(storyId, failed.length);
    });
  }

  private onCreated(storyId: string, failedCriteria: number): void {
    this.submitting.set(false);
    if (failedCriteria > 0) {
      this.toast.error(
        this.transloco.translate('storyForm.criteriaPartial', { count: failedCriteria }),
      );
    } else {
      this.toast.success(this.transloco.translate('storyForm.created'));
    }
    void this.router.navigate(['/projects', this.projectId(), 'stories', storyId]);
  }

  /** Turns a create error into a message; a duplicate 409 surfaces the similarity score. */
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
