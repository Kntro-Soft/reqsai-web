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
import {
  GlossaryTermRequest,
  GlossaryTermResponse,
  ProjectContextApiService,
} from '../../data/project-context-api.service';
import { isConflict } from '../../data/duplicate-error';
import { Modal } from '../../../../shared/components/modal/modal';
import { ToastService } from '../../../../shared/toast/toast.service';
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

/**
 * The project glossary as a Members-style table: an add card, a client-side
 * search over term/definition, and per-row edit (PUT) / delete (DELETE) with a
 * confirm modal. A duplicate term fails 409 and surfaces a clear message.
 */
@Component({
  selector: 'app-project-glossary',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    OverlayModule,
    Modal,
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
  template: `
    <div class="flex flex-col gap-6">
      <div>
        <h1 class="text-2xl font-bold tracking-tight">{{ 'glossaryPage.title' | transloco }}</h1>
        <p class="mt-1 text-sm text-muted-foreground">{{ 'glossaryPage.subtitle' | transloco }}</p>
      </div>

      <!-- Add -->
      <section class="overflow-hidden rounded-2xl border border-border">
        <div class="flex flex-col gap-1 p-5">
          <h2 class="text-base font-semibold">{{ 'glossaryPage.addTitle' | transloco }}</h2>
          <p class="text-sm text-muted-foreground">{{ 'glossaryPage.addDesc' | transloco }}</p>
        </div>
        <form
          [formGroup]="form"
          (ngSubmit)="add()"
          class="flex flex-col gap-3 border-t border-border bg-muted/30 p-5"
        >
          <div class="flex flex-col gap-1.5">
            <label hlmLabel for="term">{{ 'glossaryPage.fieldTerm' | transloco }}</label>
            <input
              hlmInput
              id="term"
              formControlName="term"
              [placeholder]="'glossaryPage.placeholderTerm' | transloco"
              data-testid="term-input"
            />
          </div>
          <div class="flex flex-col gap-1.5">
            <label hlmLabel for="definition">{{
              'glossaryPage.fieldDefinition' | transloco
            }}</label>
            <textarea
              hlmInput
              id="definition"
              rows="3"
              formControlName="definition"
              [placeholder]="'glossaryPage.placeholderDefinition' | transloco"
              data-testid="definition-input"
            ></textarea>
          </div>
          <div class="flex justify-end">
            <button
              hlmBtn
              size="sm"
              type="submit"
              [disabled]="form.invalid || submitting()"
              data-testid="term-submit"
            >
              @if (submitting()) {
                <hlm-spinner class="h-4 w-4" />
              } @else {
                <hlm-icon name="lucidePlus" size="15px" />
              }
              {{ 'glossaryPage.submit' | transloco }}
            </button>
          </div>
          @if (formError()) {
            <p class="text-sm text-destructive" data-testid="term-form-error">{{ formError() }}</p>
          }
        </form>
      </section>

      <!-- Search -->
      <div class="flex items-center gap-2 rounded-md border border-input bg-background px-3">
        <hlm-icon name="lucideSearch" size="15px" class="shrink-0 text-muted-foreground" />
        <input
          type="text"
          [value]="query()"
          (input)="query.set($any($event.target).value)"
          [placeholder]="'glossaryPage.searchPlaceholder' | transloco"
          class="h-10 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          autocomplete="off"
          spellcheck="false"
          data-testid="glossary-filter"
        />
      </div>

      @if (state() === 'loading') {
        <div
          class="overflow-hidden rounded-2xl border border-border"
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
        <p class="text-sm text-destructive">{{ 'glossaryPage.loadError' | transloco }}</p>
      } @else if (rows().length === 0) {
        <p
          class="rounded-2xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground"
          data-testid="glossary-empty"
        >
          {{
            (terms().length === 0 ? 'glossaryPage.emptyBody' : 'glossaryPage.noMatches') | transloco
          }}
        </p>
      } @else {
        <div class="overflow-hidden rounded-2xl border border-border">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-border text-left text-xs text-muted-foreground">
                <th class="px-4 py-2.5 font-medium">{{ 'glossaryPage.colTerm' | transloco }}</th>
                <th class="px-3 py-2.5 font-medium">
                  {{ 'glossaryPage.colDefinition' | transloco }}
                </th>
                <th class="px-3 py-2.5 whitespace-nowrap font-medium">
                  {{ 'glossaryPage.colUpdated' | transloco }}
                </th>
                <th class="w-12 px-3 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              @for (t of rows(); track t.id) {
                <tr class="border-b border-border last:border-0" data-testid="glossary-row">
                  <td class="px-4 py-3 align-top font-medium">{{ t.term }}</td>
                  <td class="px-3 py-3 align-top leading-relaxed text-muted-foreground">
                    {{ t.definition }}
                  </td>
                  <td class="px-3 py-3 align-top whitespace-nowrap text-muted-foreground">
                    {{ formatDate(t.updatedAt ?? t.createdAt) }}
                  </td>
                  <td class="px-3 py-3 text-right align-top">
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
                          role="menuitem"
                          type="button"
                          (click)="askEdit(t); menuFor.set(null)"
                          class="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors hover:bg-accent hover:text-foreground"
                        >
                          <hlm-icon name="lucidePencil" size="15px" />
                          {{ 'glossaryPage.edit' | transloco }}
                        </button>
                        <button
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
      }

      <!-- Edit -->
      <app-modal [(open)]="editOpen">
        <span modalTitle>{{ 'glossaryPage.editTitle' | transloco }}</span>
        <form [formGroup]="editForm" class="flex flex-col gap-4">
          <div class="flex flex-col gap-1.5">
            <label hlmLabel for="edit-term">{{ 'glossaryPage.fieldTerm' | transloco }}</label>
            <input hlmInput id="edit-term" formControlName="term" data-testid="edit-term-input" />
          </div>
          <div class="flex flex-col gap-1.5">
            <label hlmLabel for="edit-definition">
              {{ 'glossaryPage.fieldDefinition' | transloco }}
            </label>
            <textarea
              hlmInput
              id="edit-definition"
              rows="4"
              formControlName="definition"
            ></textarea>
          </div>
          @if (editError()) {
            <p class="text-sm text-destructive" data-testid="edit-error">{{ editError() }}</p>
          }
        </form>
        <button
          modalFooter
          hlmBtn
          size="sm"
          variant="ghost"
          type="button"
          (click)="editOpen.set(false)"
        >
          {{ 'common.cancel' | transloco }}
        </button>
        <button
          modalFooter
          hlmBtn
          size="sm"
          type="button"
          (click)="saveEdit()"
          [disabled]="editForm.invalid || actioning()"
          data-testid="edit-save"
        >
          @if (actioning()) {
            <hlm-spinner class="h-4 w-4" />
          }
          {{ 'glossaryPage.save' | transloco }}
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
export class ProjectGlossary implements OnInit {
  private readonly api = inject(ProjectContextApiService);
  private readonly auth = inject(AuthStore);
  private readonly fb = inject(FormBuilder);
  private readonly transloco = inject(TranslocoService);
  private readonly toast = inject(ToastService);

  readonly projectId = input.required<string>();

  protected readonly skeletonRows = [0, 1, 2, 3];
  protected readonly menuPositions = MENU_POS;

  protected readonly terms = signal<GlossaryTermResponse[]>([]);
  protected readonly state = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly query = signal('');
  protected readonly menuFor = signal<string | null>(null);

  protected readonly submitting = signal(false);
  protected readonly formError = signal<string | null>(null);

  protected readonly actioning = signal(false);
  protected readonly editOpen = signal(false);
  protected readonly editError = signal<string | null>(null);
  protected readonly editTarget = signal<GlossaryTermResponse | null>(null);
  protected readonly deleteOpen = signal(false);
  protected readonly deleteTarget = signal<GlossaryTermResponse | null>(null);

  protected readonly form = this.fb.nonNullable.group({
    term: ['', [Validators.required, Validators.maxLength(200)]],
    definition: ['', [Validators.required, Validators.maxLength(4000)]],
  });
  protected readonly editForm = this.fb.nonNullable.group({
    term: ['', [Validators.required, Validators.maxLength(200)]],
    definition: ['', [Validators.required, Validators.maxLength(4000)]],
  });

  protected readonly rows = computed(() => {
    const q = this.query().trim().toLowerCase();
    if (!q) return this.terms();
    return this.terms().filter(
      (t) => t.term.toLowerCase().includes(q) || t.definition.toLowerCase().includes(q),
    );
  });

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    const orgId = this.auth.organizationId();
    if (!orgId) {
      this.state.set('error');
      return;
    }
    this.state.set('loading');
    this.api.listGlossaryTerms(orgId, this.projectId()).subscribe({
      next: (page) => {
        this.terms.set(page.content);
        this.state.set('ready');
      },
      error: () => this.state.set('error'),
    });
  }

  protected add(): void {
    const orgId = this.auth.organizationId();
    if (!orgId || this.form.invalid || this.submitting()) return;
    this.submitting.set(true);
    this.formError.set(null);
    const body = this.trimmed(this.form.getRawValue());
    this.api.createGlossaryTerm(orgId, this.projectId(), body).subscribe({
      next: (created) => {
        this.submitting.set(false);
        this.terms.update((list) => [created, ...list]);
        this.form.reset();
        this.toast.success(this.transloco.translate('glossaryPage.created'));
      },
      error: (err: unknown) => {
        this.submitting.set(false);
        const message = this.errorMessage(err, 'glossaryPage.errorCreate');
        this.formError.set(message);
        this.toast.error(message);
      },
    });
  }

  protected askEdit(term: GlossaryTermResponse): void {
    this.editTarget.set(term);
    this.editError.set(null);
    this.editForm.reset({ term: term.term, definition: term.definition });
    this.editOpen.set(true);
  }

  protected saveEdit(): void {
    const orgId = this.auth.organizationId();
    const target = this.editTarget();
    if (!orgId || !target || this.editForm.invalid || this.actioning()) return;
    this.actioning.set(true);
    this.editError.set(null);
    const body = this.trimmed(this.editForm.getRawValue());
    this.api.updateGlossaryTerm(orgId, this.projectId(), target.id, body).subscribe({
      next: (updated) => {
        this.actioning.set(false);
        this.terms.update((list) => list.map((t) => (t.id === updated.id ? updated : t)));
        this.editOpen.set(false);
        this.toast.success(this.transloco.translate('glossaryPage.updated'));
      },
      error: (err: unknown) => {
        this.actioning.set(false);
        this.editError.set(this.errorMessage(err, 'glossaryPage.errorUpdate'));
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
        this.terms.update((list) => list.filter((t) => t.id !== target.id));
        this.deleteOpen.set(false);
        this.toast.success(this.transloco.translate('glossaryPage.deleted'));
      },
      error: () => {
        this.actioning.set(false);
        this.deleteOpen.set(false);
        this.toast.error(this.transloco.translate('glossaryPage.errorDelete'));
      },
    });
  }

  private trimmed(raw: { term: string; definition: string }): GlossaryTermRequest {
    return { term: raw.term.trim(), definition: raw.definition.trim() };
  }

  /** Maps an error to a message; a 409 duplicate surfaces the "already exists" copy. */
  private errorMessage(err: unknown, fallbackKey: string): string {
    if (isConflict(err)) return this.transloco.translate('glossaryPage.errorDuplicate');
    return this.transloco.translate(fallbackKey);
  }

  protected formatDate(iso: string | null | undefined): string {
    if (!iso) return '—';
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString();
  }
}
