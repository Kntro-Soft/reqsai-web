import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  inject,
  input,
  signal,
} from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
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
  GlossaryTermRequest,
  GlossaryTermResponse,
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

/** Max lengths the backend enforces on a term and its definition. */
const TERM_MAX = 200;
const DEFINITION_MAX = 4000;

const MENU_POS: ConnectedPosition[] = [
  { originX: 'end', originY: 'bottom', overlayX: 'end', overlayY: 'top', offsetY: 4 },
  { originX: 'end', originY: 'top', overlayX: 'end', overlayY: 'bottom', offsetY: -4 },
];

/**
 * The project glossary as a Members-style table: a debounced server-side search over
 * term/definition, real server pagination, a "New term" button, and per-row edit (PUT) /
 * delete (DELETE). Create and edit share one form modal; delete asks for confirmation in
 * another. A duplicate term fails 409 and the message shows inside the modal.
 */
@Component({
  selector: 'app-project-glossary',
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
          <h1 class="text-2xl font-bold tracking-tight">{{ 'glossaryPage.title' | transloco }}</h1>
          <p class="mt-1 text-sm text-muted-foreground">
            {{ 'glossaryPage.subtitle' | transloco }}
          </p>
        </div>
        <button
          *appHasPermission="'GLOSSARY_TERM_WRITE'"
          hlmBtn
          size="sm"
          type="button"
          (click)="openCreate()"
          data-testid="glossary-new"
        >
          <hlm-icon name="lucidePlus" size="15px" />
          {{ 'glossaryPage.new' | transloco }}
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
          [placeholder]="'glossaryPage.searchPlaceholder' | transloco"
          class="h-10 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          autocomplete="off"
          spellcheck="false"
          data-testid="glossary-filter"
        />
      </div>

      @if (state() === 'loading') {
        <div
          class="min-h-0 flex-1 overflow-auto rounded-2xl border border-border"
          data-testid="glossary-skeleton"
        >
          @for (i of skeletonRows; track i) {
            <div class="flex items-center gap-3 border-b border-border px-4 py-3 last:border-0">
              <hlm-skeleton class="h-4 w-32 shrink-0" />
              <hlm-skeleton class="h-3 flex-1" />
            </div>
          }
        </div>
      } @else if (state() === 'error') {
        <p class="shrink-0 text-sm text-destructive">{{ 'glossaryPage.loadError' | transloco }}</p>
      } @else if (terms().length === 0) {
        <div
          class="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-border px-4 py-10 text-center"
          data-testid="glossary-empty"
        >
          <p class="max-w-sm text-sm text-muted-foreground">
            {{ (query() ? 'glossaryPage.noMatches' : 'glossaryPage.emptyBody') | transloco }}
          </p>
          @if (!query()) {
            <button
              *appHasPermission="'GLOSSARY_TERM_WRITE'"
              hlmBtn
              size="sm"
              type="button"
              (click)="openCreate()"
              data-testid="glossary-empty-new"
            >
              <hlm-icon name="lucidePlus" size="15px" />
              {{ 'glossaryPage.new' | transloco }}
            </button>
          }
        </div>
      } @else {
        <div class="min-h-0 flex-1 overflow-auto rounded-2xl border border-border">
          <table class="w-full min-w-[640px] text-sm">
            <thead>
              <tr
                class="sticky top-0 z-10 border-b border-border bg-card text-left text-xs text-muted-foreground"
              >
                <th class="px-4 py-2.5 font-medium">{{ 'glossaryPage.colTerm' | transloco }}</th>
                <th class="px-3 py-2.5 font-medium">
                  {{ 'glossaryPage.colDefinition' | transloco }}
                </th>
                <th class="px-3 py-2.5 whitespace-nowrap font-medium">
                  {{ 'glossaryPage.colCreated' | transloco }}
                </th>
                <th class="px-3 py-2.5 whitespace-nowrap font-medium">
                  {{ 'glossaryPage.colUpdated' | transloco }}
                </th>
                <th
                  *appHasPermission="['GLOSSARY_TERM_WRITE', 'GLOSSARY_TERM_DELETE']"
                  class="w-12 px-3 py-2.5"
                ></th>
              </tr>
            </thead>
            <tbody>
              @for (t of terms(); track t.id) {
                <tr class="border-b border-border last:border-0" data-testid="glossary-row">
                  <td class="px-4 py-3 align-top font-medium">{{ t.term }}</td>
                  <td class="px-3 py-3 align-top leading-relaxed text-muted-foreground">
                    {{ t.definition }}
                  </td>
                  <td class="px-3 py-3 align-top whitespace-nowrap text-muted-foreground">
                    {{ formatDate(t.createdAt) }}
                  </td>
                  <td class="px-3 py-3 align-top whitespace-nowrap text-muted-foreground">
                    {{ formatDate(t.updatedAt) }}
                  </td>
                  <td
                    *appHasPermission="['GLOSSARY_TERM_WRITE', 'GLOSSARY_TERM_DELETE']"
                    class="px-3 py-3 text-right align-top"
                  >
                    <button
                      type="button"
                      cdkOverlayOrigin
                      #menuOrigin="cdkOverlayOrigin"
                      (click)="menuFor.set(menuFor() === t.id ? null : t.id)"
                      [attr.aria-label]="'glossaryPage.menuAria' | transloco"
                      class="grid h-8 w-8 cursor-pointer place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    >
                      <hlm-icon name="lucideEllipsis" size="16px" />
                    </button>
                    <ng-template
                      cdkConnectedOverlay
                      [cdkConnectedOverlayOrigin]="menuOrigin"
                      [cdkConnectedOverlayOpen]="menuFor() === t.id"
                      [cdkConnectedOverlayPositions]="menuPositions"
                      (overlayOutsideClick)="menuFor.set(null)"
                      (detach)="menuFor.set(null)"
                    >
                      <div
                        role="menu"
                        class="w-max min-w-40 overflow-hidden rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-xl"
                      >
                        <button
                          *appHasPermission="'GLOSSARY_TERM_WRITE'"
                          role="menuitem"
                          type="button"
                          (click)="askEdit(t); menuFor.set(null)"
                          class="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors hover:bg-accent hover:text-foreground"
                        >
                          <hlm-icon name="lucidePencil" size="15px" />
                          {{ 'glossaryPage.edit' | transloco }}
                        </button>
                        <button
                          *appHasPermission="'GLOSSARY_TERM_DELETE'"
                          role="menuitem"
                          type="button"
                          (click)="askDelete(t); menuFor.set(null)"
                          class="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-sm text-destructive transition-colors hover:bg-destructive/10"
                        >
                          <hlm-icon name="lucideTrash2" size="15px" />
                          {{ 'glossaryPage.delete' | transloco }}
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
            <span>{{ 'glossaryPage.total' | transloco: { count: total() } }}</span>
            <span>{{
              'glossaryPage.pageOf' | transloco: { page: page() + 1, total: totalPages() }
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
              data-testid="glossary-prev"
            >
              {{ 'glossaryPage.prev' | transloco }}
            </button>
            <button
              hlmBtn
              size="sm"
              variant="outline"
              type="button"
              [disabled]="page() >= totalPages() - 1 || state() === 'loading'"
              (click)="goToPage(page() + 1)"
              data-testid="glossary-next"
            >
              {{ 'glossaryPage.next' | transloco }}
            </button>
          </div>
        </div>
      }

      <!-- Create / edit -->
      <app-modal [(open)]="formOpen">
        <span modalTitle>
          {{ (editTarget() ? 'glossaryPage.editTitle' : 'glossaryPage.addTitle') | transloco }}
        </span>
        <form
          id="glossary-form"
          [formGroup]="form"
          (ngSubmit)="save()"
          (keydown.control.enter)="save()"
          (keydown.meta.enter)="save()"
          novalidate
          class="flex flex-col gap-4"
          data-testid="term-form"
        >
          @if (!editTarget()) {
            <p>{{ 'glossaryPage.addDesc' | transloco }}</p>
          }
          <div class="flex flex-col gap-1.5">
            <label hlmLabel for="term">{{ 'glossaryPage.fieldTerm' | transloco }}</label>
            <input
              hlmInput
              id="term"
              formControlName="term"
              autocomplete="off"
              data-autofocus
              [placeholder]="'glossaryPage.placeholderTerm' | transloco"
              [attr.aria-invalid]="termError() ? 'true' : null"
              [attr.aria-describedby]="termError() ? 'term-error' : null"
              data-testid="term-input"
            />
            @if (termError(); as key) {
              <p id="term-error" class="text-xs text-destructive" data-testid="term-error">
                {{ key | transloco: { max: termMax } }}
              </p>
            }
          </div>
          <div class="flex flex-col gap-1.5">
            <label hlmLabel for="definition">{{
              'glossaryPage.fieldDefinition' | transloco
            }}</label>
            <textarea
              hlmInput
              id="definition"
              rows="4"
              formControlName="definition"
              [placeholder]="'glossaryPage.placeholderDefinition' | transloco"
              [attr.aria-invalid]="definitionError() ? 'true' : null"
              [attr.aria-describedby]="definitionError() ? 'definition-error' : null"
              data-testid="definition-input"
            ></textarea>
            @if (definitionError(); as key) {
              <p
                id="definition-error"
                class="text-xs text-destructive"
                data-testid="definition-error"
              >
                {{ key | transloco: { max: definitionMax } }}
              </p>
            }
          </div>
          @if (formError()) {
            <p
              role="alert"
              class="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
              data-testid="term-form-error"
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
          data-testid="term-cancel"
        >
          {{ 'common.cancel' | transloco }}
        </button>
        <button
          modalFooter
          hlmBtn
          size="sm"
          type="submit"
          form="glossary-form"
          [disabled]="submitting()"
          data-testid="term-submit"
        >
          @if (submitting()) {
            <hlm-spinner class="h-4 w-4" />
          }
          {{ (editTarget() ? 'glossaryPage.save' : 'glossaryPage.submit') | transloco }}
        </button>
      </app-modal>

      <!-- Delete -->
      <app-modal [(open)]="deleteOpen">
        <span modalTitle>{{ 'glossaryPage.deleteTitle' | transloco }}</span>
        @if (deleteTarget(); as t) {
          <p>
            {{ 'glossaryPage.deleteBefore' | transloco }}
            <span class="font-medium text-foreground">{{ t.term }}</span>
            {{ 'glossaryPage.deleteAfter' | transloco }}
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
          {{ 'glossaryPage.delete' | transloco }}
        </button>
      </app-modal>
    </div>
  `,
})
export class ProjectGlossary implements OnInit, OnDestroy {
  private readonly api = inject(ProjectContextApiService);
  private readonly auth = inject(AuthStore);
  private readonly fb = inject(FormBuilder);
  private readonly transloco = inject(TranslocoService);
  private readonly toast = inject(ToastService);

  readonly projectId = input.required<string>();

  protected readonly skeletonRows = [0, 1, 2, 3];
  protected readonly menuPositions = MENU_POS;
  protected readonly pageSize = 20;

  protected readonly terms = signal<GlossaryTermResponse[]>([]);
  protected readonly state = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly query = signal('');
  protected readonly page = signal(0);
  protected readonly totalPages = signal(1);
  protected readonly total = signal(0);
  protected readonly menuFor = signal<string | null>(null);

  private searchTimer: ReturnType<typeof setTimeout> | null = null;

  protected readonly termMax = TERM_MAX;
  protected readonly definitionMax = DEFINITION_MAX;

  protected readonly submitting = signal(false);
  protected readonly formError = signal<string | null>(null);
  protected readonly formOpen = signal(false);
  /** The term being edited; null while the modal creates a new one. */
  protected readonly editTarget = signal<GlossaryTermResponse | null>(null);

  protected readonly actioning = signal(false);
  protected readonly deleteOpen = signal(false);
  protected readonly deleteTarget = signal<GlossaryTermResponse | null>(null);

  protected readonly form = this.fb.nonNullable.group({
    term: ['', [Validators.required, Validators.maxLength(TERM_MAX)]],
    definition: ['', [Validators.required, Validators.maxLength(DEFINITION_MAX)]],
  });

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
      .listGlossaryTerms(orgId, this.projectId(), {
        page: this.page(),
        size: this.pageSize,
        search: this.query(),
      })
      .subscribe({
        next: (res) => {
          this.terms.set(res.content);
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

  protected askEdit(term: GlossaryTermResponse): void {
    this.openForm(term);
  }

  private openForm(term: GlossaryTermResponse | null): void {
    this.editTarget.set(term);
    this.formError.set(null);
    this.form.reset({ term: term?.term ?? '', definition: term?.definition ?? '' });
    this.formOpen.set(true);
  }

  /** i18n key of the first problem on the term field, once the user has touched it. */
  protected termError(): string | null {
    return this.fieldError(this.form.controls.term, 'glossaryPage.termRequired');
  }

  protected definitionError(): string | null {
    return this.fieldError(this.form.controls.definition, 'glossaryPage.definitionRequired');
  }

  private fieldError(control: AbstractControl, requiredKey: string): string | null {
    if (!control.touched || !control.errors) return null;
    return control.errors['required'] ? requiredKey : 'glossaryPage.tooLong';
  }

  /** Creates the term, or saves the edit when a row opened the modal. */
  protected save(): void {
    const orgId = this.auth.organizationId();
    if (!orgId || this.submitting()) return;
    const raw = this.trimmed(this.form.getRawValue());
    if (!raw.term || !raw.definition || this.form.invalid) {
      if (!raw.term) this.form.controls.term.setErrors({ required: true });
      if (!raw.definition) this.form.controls.definition.setErrors({ required: true });
      this.form.markAllAsTouched();
      return;
    }
    const target = this.editTarget();
    this.submitting.set(true);
    this.formError.set(null);
    const request = target
      ? this.api.updateGlossaryTerm(orgId, this.projectId(), target.id, raw)
      : this.api.createGlossaryTerm(orgId, this.projectId(), raw);
    request.subscribe({
      next: (saved) => {
        this.submitting.set(false);
        this.formOpen.set(false);
        if (target) {
          this.terms.update((list) => list.map((t) => (t.id === saved.id ? saved : t)));
          this.toast.success(this.transloco.translate('glossaryPage.updated'));
        } else {
          this.toast.success(this.transloco.translate('glossaryPage.created'));
          // Sort is term-asc and paginated server-side, so reload rather than
          // guess where the new term lands on the current page.
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

  protected askDelete(term: GlossaryTermResponse): void {
    this.deleteTarget.set(term);
    this.deleteOpen.set(true);
  }

  protected confirmDelete(): void {
    const orgId = this.auth.organizationId();
    const target = this.deleteTarget();
    if (!orgId || !target || this.actioning()) return;
    this.actioning.set(true);
    this.api.deleteGlossaryTerm(orgId, this.projectId(), target.id).subscribe({
      next: () => {
        this.actioning.set(false);
        this.deleteOpen.set(false);
        this.toast.success(this.transloco.translate('glossaryPage.deleted'));
        // Reload the page: a delete may empty the last page, so step back if so.
        if (this.terms().length === 1 && this.page() > 0) this.page.set(this.page() - 1);
        this.load();
      },
      error: (err) => {
        this.actioning.set(false);
        this.deleteOpen.set(false);
        this.toast.error(messageForError(err, this.transloco));
      },
    });
  }

  private trimmed(raw: { term: string; definition: string }): GlossaryTermRequest {
    return { term: raw.term.trim(), definition: raw.definition.trim() };
  }

  protected formatDate(iso: string | null | undefined): string {
    if (!iso) return '—';
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString();
  }
}
