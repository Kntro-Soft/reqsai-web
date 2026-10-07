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
import { Router, RouterLink } from '@angular/router';
import { provideIcons } from '@ng-icons/core';
import {
  lucideArrowLeft,
  lucideArrowUpRight,
  lucidePlus,
  lucideTrash2,
  lucideUpload,
} from '@ng-icons/lucide';
import { HttpErrorResponse } from '@angular/common/http';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { DiscoveryApiService } from '../../data/discovery-api.service';
import { IntegrationsApiService } from '../../../workspace/data/integrations-api.service';
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
import { Modal } from '../../../../shared/components/modal/modal';
import { Select, SelectOption } from '../../../../shared/components/select/select';
import { ToastService } from '../../../../shared/toast/toast.service';
import { messageForError } from '../../../../core/errors/error-message';
import { FeatureFlags } from '../../../../core/features/feature-flags';
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
  isRowChanged,
  rowToRequest,
} from './story-form.helpers';
import { OriginBadge, StoryStatusBadge } from '../../components/story-badges/story-badges';

/**
 * Story detail / edit page. The saved title leads, with the story's review status
 * (draft = awaiting review, approved = validated) and origin (AI from a session,
 * linked back to it, or manual) underneath. The core fields read top-down as the
 * story sentence in auto-growing fields and persist via PUT ("Guardar"), enabled
 * only once something changed. Criteria are Gherkin rows managed inline — each
 * saves individually (POST for a new row, PUT for an existing one), flags unsaved
 * edits, and removes via DELETE (a not-yet-saved new row is just dropped).
 */
@Component({
  selector: 'app-story-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    Modal,
    Select,
    OriginBadge,
    StoryStatusBadge,
    HlmButton,
    HlmIcon,
    HlmInput,
    HlmLabel,
    HlmSkeleton,
    HlmSpinner,
    TranslocoPipe,
  ],
  viewProviders: [
    provideIcons({ lucideArrowLeft, lucideArrowUpRight, lucidePlus, lucideTrash2, lucideUpload }),
  ],
  template: `
    <div class="flex flex-col gap-6">
      <div class="flex flex-col gap-3">
        <a
          [routerLink]="['/projects', projectId(), 'stories']"
          class="flex w-fit items-center gap-1.5 rounded-md text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          data-testid="story-detail-back"
        >
          <hlm-icon name="lucideArrowLeft" size="15px" />
          {{ 'storyForm.back' | transloco }}
        </a>
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div class="min-w-0 flex-1">
            <!-- The page is about THIS story: its saved title leads, with its review
                 status and origin right under it. -->
            <h1 class="text-2xl font-bold tracking-tight text-balance" data-testid="story-heading">
              {{ story()?.title || ('storyForm.editTitle' | transloco) }}
            </h1>
            @if (story(); as st) {
              <div class="mt-2 flex flex-wrap items-center gap-2" data-testid="story-provenance">
                <app-story-status-badge [status]="st.status" />
                <app-origin-badge [sessionId]="st.sessionId" />
                @if (st.sessionId) {
                  <a
                    [routerLink]="['/projects', projectId(), 'sessions']"
                    [queryParams]="{ session: st.sessionId }"
                    class="inline-flex items-center gap-1 rounded-md text-xs font-medium text-primary hover:underline"
                    data-testid="story-source-session"
                  >
                    {{ 'storyForm.viewSession' | transloco }}
                    <hlm-icon name="lucideArrowUpRight" size="12px" aria-hidden="true" />
                  </a>
                }
              </div>
              <p class="mt-1.5 text-xs text-muted-foreground">
                {{ 'stories.statusHint.' + statusKey(st.status) | transloco }}
              </p>
            }
          </div>
          @if (state() === 'ready') {
            <div class="flex shrink-0 items-center gap-2">
              @if (integrationsEnabled) {
                <button
                  hlmBtn
                  size="sm"
                  variant="outline"
                  type="button"
                  (click)="pushToJira()"
                  [disabled]="pushing()"
                  data-testid="story-push-jira"
                >
                  @if (pushing()) {
                    <hlm-spinner class="h-4 w-4" />
                  } @else {
                    <hlm-icon name="lucideUpload" size="15px" />
                  }
                  {{ 'integrations.push.pushStory' | transloco }}
                </button>
              }
              <button
                hlmBtn
                size="sm"
                variant="ghost"
                type="button"
                (click)="deleteOpen.set(true)"
                class="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                data-testid="story-delete"
              >
                <hlm-icon name="lucideTrash2" size="15px" />
                {{ 'stories.delete' | transloco }}
              </button>
            </div>
          }
        </div>
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
        <div class="flex flex-wrap items-center gap-3" role="alert">
          <p class="text-sm text-destructive">{{ 'storyForm.loadError' | transloco }}</p>
          <button hlmBtn size="sm" variant="outline" type="button" (click)="reload()">
            {{ 'discovery.retry' | transloco }}
          </button>
        </div>
      } @else {
        <!-- Core fields: the story as its sentence, one full-width line per part. -->
        <form
          [formGroup]="form"
          (ngSubmit)="save()"
          class="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5"
        >
          <h2 class="text-base font-semibold">{{ 'storyForm.storySection' | transloco }}</h2>
          <div class="flex flex-col gap-1.5">
            <label hlmLabel for="title">{{ 'storyForm.fieldTitle' | transloco }}</label>
            <input
              hlmInput
              id="title"
              formControlName="title"
              [attr.aria-invalid]="form.controls.title.invalid && form.controls.title.touched"
              aria-describedby="title-error"
              data-testid="story-title"
            />
            @if (form.controls.title.invalid && form.controls.title.touched) {
              <p id="title-error" class="text-xs text-destructive">
                {{ 'storyForm.required' | transloco }}
              </p>
            }
          </div>
          @for (part of storyParts; track part.control) {
            <div class="grid gap-1.5 sm:grid-cols-[9rem_minmax(0,1fr)] sm:items-start sm:gap-4">
              <label hlmLabel [for]="part.control" class="leading-snug sm:pt-2.5">
                {{ part.label | transloco }}
                <span class="mt-0.5 block text-xs font-normal text-muted-foreground">{{
                  part.lead | transloco
                }}</span>
              </label>
              @let control = form.controls[part.control];
              <div class="flex min-w-0 flex-col gap-1">
                <textarea
                  hlmInput
                  rows="1"
                  class="min-h-10"
                  [id]="part.control"
                  [formControlName]="part.control"
                  [attr.aria-invalid]="control.invalid && control.touched"
                  [attr.aria-describedby]="part.control + '-error'"
                  [attr.data-testid]="'story-' + part.control"
                ></textarea>
                @if (control.invalid && control.touched) {
                  <p [id]="part.control + '-error'" class="text-xs text-destructive">
                    {{ 'storyForm.required' | transloco }}
                  </p>
                }
              </div>
            </div>
          }
          <div class="flex flex-wrap items-end gap-3 border-t border-border pt-4">
            <div class="flex flex-col gap-1.5">
              <span hlmLabel>{{ 'storyForm.fieldPriority' | transloco }}</span>
              <app-select
                [options]="priorityOptions()"
                [value]="form.controls.priority.value"
                (valueChange)="setPriority($event)"
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
            <div class="ml-auto flex items-center gap-3">
              @if (form.dirty) {
                <span class="text-xs font-medium text-pending" data-testid="story-unsaved">
                  {{ 'storyForm.unsaved' | transloco }}
                </span>
              }
              <button
                hlmBtn
                size="sm"
                type="submit"
                [disabled]="form.invalid || form.pristine || saving()"
                data-testid="story-save"
              >
                @if (saving()) {
                  <hlm-spinner class="h-4 w-4" />
                }
                {{ 'storyForm.save' | transloco }}
              </button>
            </div>
          </div>
          @if (formError()) {
            <p class="text-sm text-destructive" role="alert" data-testid="story-form-error">
              {{ formError() }}
            </p>
          }
        </form>

        <!-- Acceptance criteria (managed inline, each saved on its own). -->
        <section class="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 class="text-base font-semibold">
                {{ 'storyForm.criteriaTitle' | transloco }}
                <span class="ml-1 text-sm font-normal text-muted-foreground tabular-nums">{{
                  criteria().length
                }}</span>
              </h2>
              <p class="mt-0.5 text-xs text-muted-foreground">
                {{ 'storyForm.criteriaHint' | transloco }}
              </p>
            </div>
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

          <ol class="flex flex-col">
            @for (row of criteria(); track $index; let i = $index) {
              @let changed = rowChanged(i);
              <li
                class="flex flex-col gap-3 border-t border-border py-4 first:border-t-0 first:pt-0 last:pb-0"
                data-testid="criteria-row"
              >
                <div class="flex items-center gap-2">
                  <span class="text-xs font-medium text-muted-foreground">
                    {{ 'discovery.suggestion.criterion' | transloco }} {{ i + 1 }}
                  </span>
                  @if (!row.id) {
                    <span
                      class="rounded-full bg-pending-soft px-2 py-0.5 text-[11px] font-medium text-pending"
                      >{{ 'storyForm.criteriaNew' | transloco }}</span
                    >
                  } @else if (changed) {
                    <span
                      class="rounded-full bg-pending-soft px-2 py-0.5 text-[11px] font-medium text-pending"
                      data-testid="criteria-unsaved"
                      >{{ 'storyForm.unsaved' | transloco }}</span
                    >
                  }
                  <button
                    type="button"
                    (click)="removeRow(i)"
                    [disabled]="rowBusy() === i"
                    [attr.aria-label]="'storyForm.criteriaRemove' | transloco"
                    class="ml-auto grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                    data-testid="criteria-remove"
                  >
                    <hlm-icon name="lucideTrash2" size="15px" />
                  </button>
                </div>
                <!-- Gherkin layout: the keyword stays in a gutter beside each step. -->
                <div class="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3 gap-y-2">
                  <label
                    class="pt-2.5 text-[11px] font-semibold uppercase leading-4 tracking-wide text-muted-foreground"
                    [for]="'crit-' + i + '-scenario'"
                    >{{ 'discovery.suggestion.scenario' | transloco }}</label
                  >
                  <input
                    hlmInput
                    [id]="'crit-' + i + '-scenario'"
                    [value]="row.scenario"
                    (input)="patch(i, 'scenario', $any($event.target).value)"
                    [placeholder]="'discovery.suggestion.scenarioPlaceholder' | transloco"
                    data-testid="criteria-scenario"
                  />
                  @for (step of steps; track step.key) {
                    <label
                      class="pt-2.5 text-[11px] font-semibold uppercase leading-4 tracking-wide text-muted-foreground"
                      [for]="'crit-' + i + '-' + step.key"
                      >{{ step.label | transloco }}</label
                    >
                    <textarea
                      hlmInput
                      rows="1"
                      class="min-h-10"
                      [id]="'crit-' + i + '-' + step.key"
                      [value]="row[step.key]"
                      (input)="patch(i, step.key, $any($event.target).value)"
                      [attr.data-testid]="'criteria-' + step.key"
                    ></textarea>
                  }
                </div>
                <div class="flex justify-end">
                  <button
                    hlmBtn
                    size="sm"
                    [variant]="changed ? 'default' : 'outline'"
                    type="button"
                    [disabled]="rowBusy() === i || !changed"
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
              </li>
            }
          </ol>
        </section>
      }
    </div>

    <!-- Delete this story -->
    <app-modal [(open)]="deleteOpen">
      <span modalTitle>{{ 'stories.deleteConfirmTitle' | transloco }}</span>
      <p>{{ 'stories.deleteConfirmBody' | transloco }}</p>
      <button
        modalFooter
        hlmBtn
        size="sm"
        variant="ghost"
        type="button"
        (click)="deleteOpen.set(false)"
      >
        {{ 'common.cancel' | transloco }}
      </button>
      <button
        modalFooter
        hlmBtn
        size="sm"
        variant="destructive"
        type="button"
        (click)="confirmDelete()"
        [disabled]="deleting()"
        data-testid="story-delete-confirm"
      >
        @if (deleting()) {
          <hlm-spinner class="h-4 w-4" />
        }
        {{ 'stories.delete' | transloco }}
      </button>
    </app-modal>
  `,
})
export class StoryDetail implements OnInit {
  private readonly api = inject(DiscoveryApiService);
  private readonly integrations = inject(IntegrationsApiService);
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly transloco = inject(TranslocoService);
  private readonly toast = inject(ToastService);

  /** Both bound from the route via withComponentInputBinding(). */
  readonly projectId = input.required<string>();
  readonly storyId = input.required<string>();

  /** "Push to Jira" belongs to the `integrations` feature. */
  protected readonly integrationsEnabled = inject(FeatureFlags).isEnabled('integrations');

  protected readonly state = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly saving = signal(false);
  protected readonly pushing = signal(false);
  protected readonly deleteOpen = signal(false);
  protected readonly deleting = signal(false);
  protected readonly formError = signal<string | null>(null);
  protected readonly criteria = signal<CriterionRow[]>([]);
  /** The loaded/last-saved story (drives the heading, status and origin). */
  protected readonly story = signal<UserStoryResponse | null>(null);
  /** Last saved version of each persisted criterion, keyed by id (unsaved-edit flags). */
  private readonly savedCriteria = signal<ReadonlyMap<string, CriterionRow>>(new Map());

  /** The three parts of the story sentence, in reading order. */
  protected readonly storyParts = [
    { control: 'role', label: 'storyForm.fieldRole', lead: 'storyForm.leadRole' },
    { control: 'action', label: 'storyForm.fieldAction', lead: 'storyForm.leadAction' },
    { control: 'benefit', label: 'storyForm.fieldBenefit', lead: 'storyForm.leadBenefit' },
  ] as const;
  protected readonly steps = [
    { key: 'given', label: 'storyForm.criteriaGiven' },
    { key: 'when', label: 'storyForm.criteriaWhen' },
    { key: 'then', label: 'storyForm.criteriaThen' },
  ] as const;
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

  protected reload(): void {
    this.load();
  }

  protected setPriority(value: string): void {
    this.form.controls.priority.setValue(value as StoryPriority);
    this.form.controls.priority.markAsDirty();
  }

  /** Status key for the status hint (unknown values read as DRAFT, like the badge). */
  protected statusKey(status: string | null | undefined): string {
    const key = (status ?? 'DRAFT').toUpperCase();
    return ['DRAFT', 'APPROVED', 'REJECTED', 'MERGED', 'EXPORTED'].includes(key) ? key : 'DRAFT';
  }

  /** True when the row at `index` has edits not yet saved (or was never saved). */
  protected rowChanged(index: number): boolean {
    const row = this.criteria()[index];
    if (!row) return false;
    return isRowChanged(row, row.id ? this.savedCriteria().get(row.id) : undefined);
  }

  private rememberSaved(rows: readonly CriterionRow[]): void {
    this.savedCriteria.update((map) => {
      const next = new Map(map);
      for (const row of rows) if (row.id) next.set(row.id, { ...row });
      return next;
    });
  }

  private seed(story: UserStoryResponse): void {
    this.story.set(story);
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
    this.savedCriteria.set(new Map());
    this.rememberSaved(rows);
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
      next: (updated) => {
        this.saving.set(false);
        this.form.markAsPristine();
        this.story.update((current) => ({ ...(current ?? updated), ...updated }));
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

  /**
   * Pushes this story to Jira as an issue. On success toasts the created issue key
   * and opens its Jira URL. A missing project mapping (INTEGRATION_TARGET_NOT_CONFIGURED)
   * gets a helpful message pointing the user to the project's integration settings.
   */
  protected pushToJira(): void {
    if (this.pushing()) return;
    this.pushing.set(true);
    this.integrations.pushStory(this.projectId(), this.storyId()).subscribe({
      next: (result) => {
        this.pushing.set(false);
        this.toast.success(
          this.transloco.translate('integrations.push.pushed', { key: result.jiraIssueKey }),
        );
        if (result.jiraIssueUrl) {
          window.open(result.jiraIssueUrl, '_blank', 'noopener');
        }
      },
      error: (err: unknown) => {
        this.pushing.set(false);
        this.toast.error(this.pushErrorMessage(err));
      },
    });
  }

  /**
   * Permanently deletes this story after a confirm, then returns to the backlog list.
   * A failure keeps the page open and surfaces the localized error via a toast.
   */
  protected confirmDelete(): void {
    if (this.deleting()) return;
    this.deleting.set(true);
    this.api.deleteStory(this.projectId(), this.storyId()).subscribe({
      next: () => {
        this.deleting.set(false);
        this.deleteOpen.set(false);
        this.toast.success(this.transloco.translate('stories.deleted'));
        void this.router.navigate(['/projects', this.projectId(), 'stories']);
      },
      error: (err: unknown) => {
        this.deleting.set(false);
        this.toast.error(messageForError(err, this.transloco));
      },
    });
  }

  /** A missing Jira mapping gets a settings-pointing message; otherwise the shared chain. */
  private pushErrorMessage(err: unknown): string {
    if (
      err instanceof HttpErrorResponse &&
      (err.error as { code?: unknown } | null)?.code === 'INTEGRATION_TARGET_NOT_CONFIGURED'
    ) {
      return this.transloco.translate('integrations.push.notConfigured');
    }
    return messageForError(err, this.transloco);
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
        const savedRow = criterionToRow(saved);
        this.criteria.update((list) => list.map((r, i) => (i === index ? savedRow : r)));
        this.rememberSaved([savedRow]);
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
