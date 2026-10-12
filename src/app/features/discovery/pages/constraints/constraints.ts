import {
  ChangeDetectionStrategy,
  Component,
  computed,
  OnDestroy,
  OnInit,
  inject,
  input,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { provideIcons } from '@ng-icons/core';
import {
  lucideEllipsis,
  lucidePencil,
  lucidePlus,
  lucideSearch,
  lucideTrash2,
} from '@ng-icons/lucide';
import { ConnectedPosition, OverlayModule } from '@angular/cdk/overlay';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { AuthStore } from '../../../../core/auth/auth.store';
import { HasPermission } from '../../../../shared/directives/has-permission';
import {
  ProjectConstraintRequest,
  ProjectConstraintResponse,
  ProjectContextApiService,
} from '../../data/project-context-api.service';
import { Modal } from '../../../../shared/components/modal/modal';
import { ToastService } from '../../../../shared/toast/toast.service';
import { messageForError } from '../../../../core/errors/error-message';
import {
  HlmButton,
  HlmIcon,
  HlmInput,
  HlmLabel,
  HlmSkeleton,
  HlmSpinner,
} from '../../../../shared/ui';

const MENU_POS: ConnectedPosition[] = [
  { originX: 'end', originY: 'bottom', overlayX: 'end', overlayY: 'top', offsetY: 4 },
  { originX: 'end', originY: 'top', overlayX: 'end', overlayY: 'bottom', offsetY: -4 },
];

/** Max length the backend enforces on a constraint description. */
const MAX_DESCRIPTION = 500;

/**
 * The project constraints as a Members-style table: a debounced server-side search over the
 * description, real server pagination, a "New constraint" button, and per-row edit (PUT) /
 * delete (DELETE). Create and edit share one form modal; delete asks for confirmation in
 * another. A duplicate description fails 409 and the message shows inside the modal.
 */
@Component({
  selector: 'app-project-constraints',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    OverlayModule,
    Modal,
    HasPermission,
    HlmButton,
    HlmIcon,
    HlmInput,
    HlmLabel,
    HlmSkeleton,
    HlmSpinner,
    TranslocoPipe,
  ],
  viewProviders: [
    provideIcons({ lucideEllipsis, lucidePencil, lucidePlus, lucideSearch, lucideTrash2 }),
  ],
  host: { class: 'flex h-full min-h-0 flex-col' },
  template: `
    <div class="flex h-full min-h-0 flex-col gap-6">
      <div class="flex shrink-0 flex-wrap items-start justify-between gap-3">
        <div class="min-w-0">
          <h1 class="text-2xl font-bold tracking-tight">
            {{ 'constraintsPage.title' | transloco }}
          </h1>
          <p class="mt-1 text-sm text-muted-foreground">
            {{ 'constraintsPage.subtitle' | transloco }}
          </p>
        </div>
        <button
          *appHasPermission="'CONSTRAINT_WRITE'"
          hlmBtn
          size="sm"
          type="button"
          (click)="openCreate()"
          data-testid="constraints-new"
        >
          <hlm-icon name="lucidePlus" size="15px" />
          {{ 'constraintsPage.new' | transloco }}
        </button>
      </div>

      <!-- Search -->
      <div
        class="flex shrink-0 items-center gap-2 rounded-md border border-input bg-background px-3"
      >
        <hlm-icon name="lucideSearch" size="15px" class="shrink-0 text-muted-foreground" />
        <input
          type="text"
          [value]="query()"
          (input)="onSearch($any($event.target).value)"
          [placeholder]="'constraintsPage.searchPlaceholder' | transloco"
          class="h-10 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          autocomplete="off"
          spellcheck="false"
          data-testid="constraints-filter"
        />
      </div>

      @if (state() === 'loading') {
        <div
          class="min-h-0 flex-1 overflow-auto rounded-2xl border border-border"
          data-testid="constraints-skeleton"
        >
          @for (i of skeletonRows; track i) {
            <div class="flex items-center gap-3 border-b border-border px-4 py-3 last:border-0">
              <hlm-skeleton class="h-3 flex-1" />
            </div>
          }
        </div>
      } @else if (state() === 'error') {
        <p class="shrink-0 text-sm text-destructive">
          {{ 'constraintsPage.loadError' | transloco }}
        </p>
      } @else if (constraints().length === 0) {
        <div
          class="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-border px-4 py-10 text-center"
          data-testid="constraints-empty"
        >
          <p class="max-w-sm text-sm text-muted-foreground">
            {{ (query() ? 'constraintsPage.noMatches' : 'constraintsPage.emptyBody') | transloco }}
          </p>
          @if (!query()) {
            <button
              *appHasPermission="'CONSTRAINT_WRITE'"
              hlmBtn
              size="sm"
              type="button"
              (click)="openCreate()"
              data-testid="constraints-empty-new"
            >
              <hlm-icon name="lucidePlus" size="15px" />
              {{ 'constraintsPage.new' | transloco }}
            </button>
          }
        </div>
      } @else {
        <div class="min-h-0 flex-1 overflow-auto rounded-2xl border border-border">
          <table class="w-full min-w-[560px] text-sm">
            <thead>
              <tr
                class="sticky top-0 z-10 border-b border-border bg-card text-left text-xs text-muted-foreground"
              >
                <th class="px-4 py-2.5 font-medium">
                  {{ 'constraintsPage.colDescription' | transloco }}
                </th>
                <th class="px-3 py-2.5 whitespace-nowrap font-medium">
                  {{ 'constraintsPage.colCreated' | transloco }}
                </th>
                <th class="px-3 py-2.5 whitespace-nowrap font-medium">
                  {{ 'constraintsPage.colUpdated' | transloco }}
                </th>
                <th *appHasPermission="'CONSTRAINT_WRITE'" class="w-12 px-3 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              @for (c of constraints(); track c.id) {
                <tr class="border-b border-border last:border-0" data-testid="constraint-row">
                  <td class="px-4 py-3 align-top leading-relaxed">{{ c.description }}</td>
                  <td class="px-3 py-3 align-top whitespace-nowrap text-muted-foreground">
                    {{ formatDate(c.createdAt) }}
                  </td>
                  <td class="px-3 py-3 align-top whitespace-nowrap text-muted-foreground">
                    {{ formatDate(c.updatedAt) }}
                  </td>
                  <td *appHasPermission="'CONSTRAINT_WRITE'" class="px-3 py-3 text-right align-top">
                    <button
                      type="button"
                      cdkOverlayOrigin
                      #menuOrigin="cdkOverlayOrigin"
                      (click)="menuFor.set(menuFor() === c.id ? null : c.id)"
                      [attr.aria-label]="'constraintsPage.menuAria' | transloco"
                      class="grid h-8 w-8 cursor-pointer place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    >
                      <hlm-icon name="lucideEllipsis" size="16px" />
                    </button>
                    <ng-template
                      cdkConnectedOverlay
                      [cdkConnectedOverlayOrigin]="menuOrigin"
                      [cdkConnectedOverlayOpen]="menuFor() === c.id"
                      [cdkConnectedOverlayPositions]="menuPositions"
                      (overlayOutsideClick)="menuFor.set(null)"
                      (detach)="menuFor.set(null)"
                    >
                      <div
                        role="menu"
                        class="w-max min-w-40 overflow-hidden rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-xl"
                      >
                        <button
                          role="menuitem"
                          type="button"
                          (click)="askEdit(c); menuFor.set(null)"
                          class="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors hover:bg-accent hover:text-foreground"
                        >
                          <hlm-icon name="lucidePencil" size="15px" />
                          {{ 'constraintsPage.edit' | transloco }}
                        </button>
                        <button
                          role="menuitem"
                          type="button"
                          (click)="askDelete(c); menuFor.set(null)"
                          class="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-sm text-destructive transition-colors hover:bg-destructive/10"
                        >
                          <hlm-icon name="lucideTrash2" size="15px" />
                          {{ 'constraintsPage.delete' | transloco }}
                        </button>
                      </div>
                    </ng-template>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>

        <div class="flex shrink-0 items-center justify-between gap-3">
          <div class="flex flex-col text-sm text-muted-foreground">
            <span>{{ 'constraintsPage.total' | transloco: { count: total() } }}</span>
            <span>{{
              'constraintsPage.pageOf' | transloco: { page: page() + 1, total: totalPages() }
            }}</span>
          </div>
          <div class="flex gap-2">
            <button
              hlmBtn
              size="sm"
              variant="outline"
              type="button"
              [disabled]="page() === 0 || state() === 'loading'"
              (click)="goToPage(page() - 1)"
              data-testid="constraints-prev"
            >
              {{ 'constraintsPage.prev' | transloco }}
            </button>
            <button
              hlmBtn
              size="sm"
              variant="outline"
              type="button"
              [disabled]="page() >= totalPages() - 1 || state() === 'loading'"
              (click)="goToPage(page() + 1)"
              data-testid="constraints-next"
            >
              {{ 'constraintsPage.next' | transloco }}
            </button>
          </div>
        </div>
      }

      <!-- Create / edit -->
      <app-modal [(open)]="formOpen">
        <span modalTitle>
          {{
            (editTarget() ? 'constraintsPage.editTitle' : 'constraintsPage.addTitle') | transloco
          }}
        </span>
        <form
          id="constraint-form"
          [formGroup]="form"
          (ngSubmit)="save()"
          (keydown.control.enter)="save()"
          (keydown.meta.enter)="save()"
          novalidate
          class="flex flex-col gap-4"
          data-testid="constraint-form"
        >
          @if (!editTarget()) {
            <p>{{ 'constraintsPage.addDesc' | transloco }}</p>
          }
          <div class="flex flex-col gap-1.5">
            <label hlmLabel for="description">
              {{ 'constraintsPage.fieldDescription' | transloco }}
            </label>
            <textarea
              hlmInput
              id="description"
              rows="4"
              [maxlength]="maxDescription"
              formControlName="description"
              data-autofocus
              [placeholder]="'constraintsPage.placeholderDescription' | transloco"
              [attr.aria-invalid]="descriptionError() ? 'true' : null"
              [attr.aria-describedby]="
                descriptionError() ? 'description-error description-count' : 'description-count'
              "
              data-testid="constraint-input"
            ></textarea>
            <div class="flex items-start justify-between gap-3">
              <p
                id="description-error"
                class="text-xs text-destructive"
                data-testid="constraint-error"
              >
                @if (descriptionError(); as key) {
                  {{ key | transloco }}
                }
              </p>
              <span
                id="description-count"
                class="ml-auto shrink-0 text-xs tabular-nums text-muted-foreground"
              >
                {{ descriptionLength() }}/{{ maxDescription }}
              </span>
            </div>
          </div>
          @if (formError()) {
            <p
              role="alert"
              class="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
              data-testid="constraint-form-error"
            >
              {{ formError() }}
            </p>
          }
        </form>
        <button
          modalFooter
          hlmBtn
          size="sm"
          variant="ghost"
          type="button"
          (click)="formOpen.set(false)"
          data-testid="constraint-cancel"
        >
          {{ 'common.cancel' | transloco }}
        </button>
        <button
          modalFooter
          hlmBtn
          size="sm"
          type="submit"
          form="constraint-form"
          [disabled]="submitting()"
          data-testid="constraint-submit"
        >
          @if (submitting()) {
            <hlm-spinner class="h-4 w-4" />
          }
          {{ (editTarget() ? 'constraintsPage.save' : 'constraintsPage.submit') | transloco }}
        </button>
      </app-modal>

      <!-- Delete -->
      <app-modal [(open)]="deleteOpen">
        <span modalTitle>{{ 'constraintsPage.deleteTitle' | transloco }}</span>
        @if (deleteTarget(); as c) {
          <p>
            {{ 'constraintsPage.deleteBefore' | transloco }}
          </p>
          <p class="mt-2 rounded-lg border border-border bg-background/40 p-3 text-foreground">
            {{ c.description }}
          </p>
        }
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
          [disabled]="actioning()"
          data-testid="delete-confirm"
        >
          @if (actioning()) {
            <hlm-spinner class="h-4 w-4" />
          }
          {{ 'constraintsPage.delete' | transloco }}
        </button>
      </app-modal>
    </div>
  `,
})
export class ProjectConstraints implements OnInit, OnDestroy {
  private readonly api = inject(ProjectContextApiService);
  private readonly auth = inject(AuthStore);
  private readonly fb = inject(FormBuilder);
  private readonly transloco = inject(TranslocoService);
  private readonly toast = inject(ToastService);

  readonly projectId = input.required<string>();

  protected readonly skeletonRows = [0, 1, 2, 3];
  protected readonly menuPositions = MENU_POS;
  protected readonly maxDescription = MAX_DESCRIPTION;
  protected readonly pageSize = 20;

  protected readonly constraints = signal<ProjectConstraintResponse[]>([]);
  protected readonly state = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly query = signal('');
  protected readonly page = signal(0);
  protected readonly totalPages = signal(1);
  protected readonly total = signal(0);
  protected readonly menuFor = signal<string | null>(null);

  private searchTimer: ReturnType<typeof setTimeout> | null = null;

  protected readonly submitting = signal(false);
  protected readonly formError = signal<string | null>(null);
  protected readonly formOpen = signal(false);
  /** The constraint being edited; null while the modal creates a new one. */
  protected readonly editTarget = signal<ProjectConstraintResponse | null>(null);

  protected readonly actioning = signal(false);
  protected readonly deleteOpen = signal(false);
  protected readonly deleteTarget = signal<ProjectConstraintResponse | null>(null);

  protected readonly form = this.fb.nonNullable.group({
    description: ['', [Validators.required, Validators.maxLength(MAX_DESCRIPTION)]],
  });
  private readonly descriptionValue = toSignal(this.form.controls.description.valueChanges, {
    initialValue: '',
  });
  protected readonly descriptionLength = computed(() => this.descriptionValue().length);

  ngOnInit(): void {
    this.load();
  }

  ngOnDestroy(): void {
    if (this.searchTimer) clearTimeout(this.searchTimer);
  }

  /** Debounced server-side search: resets to the first page and reloads. */
  protected onSearch(value: string): void {
    this.query.set(value);
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => {
      this.page.set(0);
      this.load();
    }, 300);
  }

  protected goToPage(next: number): void {
    if (next < 0 || next >= this.totalPages()) return;
    this.page.set(next);
    this.load();
  }

  private load(): void {
    const orgId = this.auth.organizationId();
    if (!orgId) {
      this.state.set('error');
      return;
    }
    this.state.set('loading');
    this.api
      .listConstraints(orgId, this.projectId(), {
        page: this.page(),
        size: this.pageSize,
        search: this.query(),
      })
      .subscribe({
        next: (res) => {
          this.constraints.set(res.content);
          this.totalPages.set(Math.max(1, res.page?.totalPages ?? 1));
          this.total.set(res.page?.totalElements ?? res.content.length);
          this.state.set('ready');
        },
        error: () => this.state.set('error'),
      });
  }

  protected openCreate(): void {
    this.openForm(null);
  }

  protected askEdit(constraint: ProjectConstraintResponse): void {
    this.openForm(constraint);
  }

  private openForm(constraint: ProjectConstraintResponse | null): void {
    this.editTarget.set(constraint);
    this.formError.set(null);
    this.form.reset({ description: constraint?.description ?? '' });
    this.formOpen.set(true);
  }

  /** i18n key of the problem on the description field, once the user has touched it. */
  protected descriptionError(): string | null {
    const control = this.form.controls.description;
    if (!control.touched || !control.errors) return null;
    return control.errors['required'] ? 'constraintsPage.descriptionRequired' : null;
  }

  /** Creates the constraint, or saves the edit when a row opened the modal. */
  protected save(): void {
    const orgId = this.auth.organizationId();
    if (!orgId || this.submitting()) return;
    const description = this.form.getRawValue().description.trim();
    if (!description || this.form.invalid) {
      if (!description) this.form.controls.description.setErrors({ required: true });
      this.form.markAllAsTouched();
      return;
    }
    const body: ProjectConstraintRequest = { description };
    const target = this.editTarget();
    this.submitting.set(true);
    this.formError.set(null);
    const request = target
      ? this.api.updateConstraint(orgId, this.projectId(), target.id, body)
      : this.api.createConstraint(orgId, this.projectId(), body);
    request.subscribe({
      next: (saved) => {
        this.submitting.set(false);
        this.formOpen.set(false);
        if (target) {
          this.constraints.update((list) => list.map((c) => (c.id === saved.id ? saved : c)));
          this.toast.success(this.transloco.translate('constraintsPage.updated'));
        } else {
          this.toast.success(this.transloco.translate('constraintsPage.created'));
          // Newest-first, paginated server-side: reload the first page.
          this.page.set(0);
          this.load();
        }
      },
      error: (err: unknown) => {
        this.submitting.set(false);
        const message = messageForError(err, this.transloco);
        // The modal shows it inline; a dismissed modal falls back to a toast.
        if (this.formOpen()) this.formError.set(message);
        else this.toast.error(message);
      },
    });
  }

  protected askDelete(constraint: ProjectConstraintResponse): void {
    this.deleteTarget.set(constraint);
    this.deleteOpen.set(true);
  }

  protected confirmDelete(): void {
    const orgId = this.auth.organizationId();
    const target = this.deleteTarget();
    if (!orgId || !target || this.actioning()) return;
    this.actioning.set(true);
    this.api.deleteConstraint(orgId, this.projectId(), target.id).subscribe({
      next: () => {
        this.actioning.set(false);
        this.deleteOpen.set(false);
        this.toast.success(this.transloco.translate('constraintsPage.deleted'));
        // Reload the page: a delete may empty the last page, so step back if so.
        if (this.constraints().length === 1 && this.page() > 0) this.page.set(this.page() - 1);
        this.load();
      },
      error: (err) => {
        this.actioning.set(false);
        this.deleteOpen.set(false);
        this.toast.error(messageForError(err, this.transloco));
      },
    });
  }

  protected formatDate(iso: string | null | undefined): string {
    if (!iso) return '—';
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString();
  }
}
