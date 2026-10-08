import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { HttpErrorResponse, HttpEventType } from '@angular/common/http';
import { Subscription } from 'rxjs';
import { provideIcons } from '@ng-icons/core';
import {
  lucideCircleCheck,
  lucideFileText,
  lucideSparkles,
  lucideTrash2,
  lucideTriangleAlert,
  lucideUpload,
} from '@ng-icons/lucide';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { AuthStore } from '../../../../core/auth/auth.store';
import { PermissionsStore } from '../../../../core/authz/permissions.store';
import { messageForError } from '../../../../core/errors/error-message';
import { translateFn } from '../../../../core/i18n/translate-fn';
import { HasPermission } from '../../../../shared/directives/has-permission';
import { Modal } from '../../../../shared/components/modal/modal';
import { Select, SelectOption } from '../../../../shared/components/select/select';
import { ToastService } from '../../../../shared/toast/toast.service';
import {
  HlmButton,
  HlmIcon,
  HlmInput,
  HlmLabel,
  HlmSkeleton,
  HlmSpinner,
} from '../../../../shared/ui';
import {
  ClientDocumentsApiService,
  ProjectDocumentResponse,
} from '../../data/client-documents-api.service';
import {
  DOCUMENT_ACCEPT,
  DOCUMENT_TYPES,
  DocumentProblem,
  DocumentReview,
  DocumentType,
  applyRequestFromReview,
  documentProblem,
  formatBytes,
  reviewFromAnalysis,
  selectedCount,
  toggleAll,
  toggleItem,
  uploadPercent,
} from '../../data/client-documents';

/** Where the upload is: sending the file, then the API extracting and classifying it. */
type UploadPhase = 'uploading' | 'analyzing';

/**
 * Client documents of a project (US22): the analyst uploads a PDF or Word document, ReqsAI extracts
 * its text and the AI classifies it into glossary terms, constraints and a project-context summary.
 * The analyst reviews the proposal (selects terms/constraints, edits the summary) and applies it, or
 * discards it. Applied documents are listed below and feed the AI as project context.
 */
@Component({
  selector: 'app-project-documents',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    TranslocoPipe,
    HasPermission,
    Modal,
    Select,
    HlmButton,
    HlmIcon,
    HlmInput,
    HlmLabel,
    HlmSkeleton,
    HlmSpinner,
  ],
  viewProviders: [
    provideIcons({
      lucideCircleCheck,
      lucideFileText,
      lucideSparkles,
      lucideTrash2,
      lucideTriangleAlert,
      lucideUpload,
    }),
  ],
  host: { class: 'flex min-h-full flex-col' },
  template: `
    <div class="flex flex-col gap-6 pb-6">
      <div>
        <h1 class="text-2xl font-bold tracking-tight">{{ 'clientDocuments.title' | transloco }}</h1>
        <p class="mt-1 text-sm text-muted-foreground">
          {{ 'clientDocuments.subtitle' | transloco }}
        </p>
      </div>

      @if (review(); as r) {
        <!-- Review -->
        <section class="overflow-hidden rounded-2xl border border-border" data-testid="doc-review">
          <div class="flex flex-col gap-1 p-5">
            <h2 class="flex items-center gap-2 text-base font-semibold">
              <hlm-icon name="lucideSparkles" size="16px" class="text-primary" />
              {{ 'clientDocuments.review.title' | transloco }}
            </h2>
            <p class="text-sm text-muted-foreground" data-testid="doc-review-file">
              {{
                'clientDocuments.review.file'
                  | transloco
                    : {
                        name: reviewFile().name,
                        size: reviewFile().size,
                        chars: reviewFile().chars,
                      }
              }}
            </p>
          </div>

          <div class="flex flex-col gap-5 border-t border-border bg-muted/30 p-5">
            @if (!reviewFile().classified) {
              <p
                class="flex items-start gap-2 rounded-lg border border-border bg-background p-3 text-sm"
                role="status"
                data-testid="doc-unclassified"
              >
                <hlm-icon name="lucideTriangleAlert" size="16px" class="mt-0.5 shrink-0" />
                {{ 'clientDocuments.review.unclassified' | transloco }}
              </p>
            }
            @if (reviewFile().truncated) {
              <p
                class="flex items-start gap-2 rounded-lg border border-border bg-background p-3 text-sm"
                role="status"
                data-testid="doc-truncated"
              >
                <hlm-icon name="lucideTriangleAlert" size="16px" class="mt-0.5 shrink-0" />
                {{ 'clientDocuments.review.truncated' | transloco }}
              </p>
            }

            <div class="grid gap-4 sm:grid-cols-2">
              <div class="flex flex-col gap-1.5">
                <label hlmLabel for="doc-name">{{
                  'clientDocuments.review.name' | transloco
                }}</label>
                <input
                  hlmInput
                  id="doc-name"
                  maxlength="255"
                  [value]="r.name"
                  (input)="setName($any($event.target).value)"
                  [disabled]="applying()"
                  data-testid="doc-name"
                />
              </div>
              <div class="flex flex-col gap-1.5">
                <span hlmLabel id="doc-type-label">{{
                  'clientDocuments.review.type' | transloco
                }}</span>
                <app-select
                  [options]="typeOptions()"
                  [value]="r.documentType"
                  (valueChange)="setType($event)"
                  [disabled]="applying()"
                  [ariaLabel]="'clientDocuments.review.type' | transloco"
                  data-testid="doc-type"
                />
              </div>
            </div>

            <div class="flex flex-col gap-1.5">
              <label hlmLabel for="doc-context">{{
                'clientDocuments.review.context' | transloco
              }}</label>
              <textarea
                hlmInput
                id="doc-context"
                rows="5"
                maxlength="4000"
                [value]="r.summary"
                (input)="setSummary($any($event.target).value)"
                [disabled]="applying()"
                data-testid="doc-context"
              ></textarea>
              <p class="text-xs text-muted-foreground">
                {{ 'clientDocuments.review.contextHint' | transloco }}
              </p>
            </div>

            <!-- Glossary -->
            <div class="flex flex-col gap-2" data-testid="doc-glossary">
              <div class="flex flex-wrap items-center justify-between gap-2">
                <h3 class="text-sm font-semibold">
                  {{ 'clientDocuments.review.glossary' | transloco }}
                  <span class="ml-1 font-normal text-muted-foreground">{{
                    'clientDocuments.review.selectedOf'
                      | transloco: { selected: termsSelected(), total: r.glossary.length }
                  }}</span>
                </h3>
                @if (canAddTerms() && selectableTerms() > 0) {
                  <button
                    hlmBtn
                    size="sm"
                    variant="ghost"
                    type="button"
                    (click)="toggleAllTerms()"
                    [disabled]="applying()"
                    data-testid="doc-terms-toggle-all"
                  >
                    {{
                      (termsSelected() === selectableTerms()
                        ? 'clientDocuments.review.clearAll'
                        : 'clientDocuments.review.selectAll'
                      ) | transloco
                    }}
                  </button>
                }
              </div>
              @if (!canAddTerms() && r.glossary.length > 0) {
                <p class="text-xs text-muted-foreground">
                  {{ 'clientDocuments.review.noTermPermission' | transloco }}
                </p>
              }
              @if (r.glossary.length === 0) {
                <p class="text-sm text-muted-foreground" data-testid="doc-glossary-empty">
                  {{ 'clientDocuments.review.noGlossary' | transloco }}
                </p>
              } @else {
                <ul
                  class="flex flex-col divide-y divide-border rounded-xl border border-border bg-background"
                >
                  @for (item of r.glossary; track $index) {
                    <li data-testid="doc-term" [attr.data-exists]="item.exists">
                      <label
                        class="flex items-start gap-3 px-4 py-3 text-sm"
                        [class.cursor-pointer]="!item.exists && canAddTerms()"
                        [class.opacity-60]="item.exists"
                      >
                        <input
                          type="checkbox"
                          class="mt-0.5 h-4 w-4 shrink-0 accent-primary"
                          [checked]="item.selected"
                          [disabled]="item.exists || !canAddTerms() || applying()"
                          (change)="toggleTerm($index)"
                          data-testid="doc-term-checkbox"
                        />
                        <span class="flex min-w-0 flex-1 flex-col gap-0.5">
                          <span class="flex flex-wrap items-center gap-2 font-medium">
                            <span data-testid="doc-term-name">{{ item.value.term }}</span>
                            @if (item.exists) {
                              <span
                                class="rounded-full border border-border px-2 py-0.5 text-xs font-normal text-muted-foreground"
                                data-testid="doc-term-exists"
                                >{{ 'clientDocuments.review.exists' | transloco }}</span
                              >
                            }
                          </span>
                          <span class="leading-relaxed text-muted-foreground">{{
                            item.value.definition
                          }}</span>
                        </span>
                      </label>
                    </li>
                  }
                </ul>
              }
            </div>

            <!-- Constraints -->
            <div class="flex flex-col gap-2" data-testid="doc-constraints">
              <div class="flex flex-wrap items-center justify-between gap-2">
                <h3 class="text-sm font-semibold">
                  {{ 'clientDocuments.review.constraints' | transloco }}
                  <span class="ml-1 font-normal text-muted-foreground">{{
                    'clientDocuments.review.selectedOf'
                      | transloco: { selected: constraintsSelected(), total: r.constraints.length }
                  }}</span>
                </h3>
                @if (canAddConstraints() && selectableConstraints() > 0) {
                  <button
                    hlmBtn
                    size="sm"
                    variant="ghost"
                    type="button"
                    (click)="toggleAllConstraints()"
                    [disabled]="applying()"
                    data-testid="doc-constraints-toggle-all"
                  >
                    {{
                      (constraintsSelected() === selectableConstraints()
                        ? 'clientDocuments.review.clearAll'
                        : 'clientDocuments.review.selectAll'
                      ) | transloco
                    }}
                  </button>
                }
              </div>
              @if (!canAddConstraints() && r.constraints.length > 0) {
                <p class="text-xs text-muted-foreground">
                  {{ 'clientDocuments.review.noConstraintPermission' | transloco }}
                </p>
              }
              @if (r.constraints.length === 0) {
                <p class="text-sm text-muted-foreground" data-testid="doc-constraints-empty">
                  {{ 'clientDocuments.review.noConstraints' | transloco }}
                </p>
              } @else {
                <ul
                  class="flex flex-col divide-y divide-border rounded-xl border border-border bg-background"
                >
                  @for (item of r.constraints; track $index) {
                    <li data-testid="doc-constraint" [attr.data-exists]="item.exists">
                      <label
                        class="flex items-start gap-3 px-4 py-3 text-sm"
                        [class.cursor-pointer]="!item.exists && canAddConstraints()"
                        [class.opacity-60]="item.exists"
                      >
                        <input
                          type="checkbox"
                          class="mt-0.5 h-4 w-4 shrink-0 accent-primary"
                          [checked]="item.selected"
                          [disabled]="item.exists || !canAddConstraints() || applying()"
                          (change)="toggleConstraint($index)"
                          data-testid="doc-constraint-checkbox"
                        />
                        <span
                          class="flex min-w-0 flex-1 flex-wrap items-center gap-2 leading-relaxed"
                        >
                          <span data-testid="doc-constraint-text">{{ item.value }}</span>
                          @if (item.exists) {
                            <span
                              class="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground"
                              data-testid="doc-constraint-exists"
                              >{{ 'clientDocuments.review.exists' | transloco }}</span
                            >
                          }
                        </span>
                      </label>
                    </li>
                  }
                </ul>
              }
            </div>

            @if (applyError()) {
              <p class="text-sm text-destructive" role="alert" data-testid="doc-apply-error">
                {{ applyError() }}
              </p>
            }

            <div class="flex flex-wrap justify-end gap-2">
              <button
                hlmBtn
                size="sm"
                variant="ghost"
                type="button"
                (click)="discard()"
                [disabled]="applying()"
                data-testid="doc-discard"
              >
                {{ 'clientDocuments.review.discard' | transloco }}
              </button>
              <button
                hlmBtn
                size="sm"
                type="button"
                (click)="apply()"
                [disabled]="!canApply()"
                data-testid="doc-apply"
              >
                @if (applying()) {
                  <hlm-spinner class="h-4 w-4" />
                } @else {
                  <hlm-icon name="lucideCircleCheck" size="15px" />
                }
                {{
                  'clientDocuments.review.apply'
                    | transloco: { terms: termsSelected(), constraints: constraintsSelected() }
                }}
              </button>
            </div>
          </div>
        </section>
      } @else {
        <!-- Upload -->
        <section
          *appHasPermission="'DOCUMENT_CREATE'"
          class="overflow-hidden rounded-2xl border border-border"
          data-testid="doc-upload"
        >
          <div class="flex flex-col gap-1 p-5">
            <h2 class="text-base font-semibold">
              {{ 'clientDocuments.upload.title' | transloco }}
            </h2>
            <p class="text-sm text-muted-foreground">
              {{ 'clientDocuments.upload.description' | transloco }}
            </p>
          </div>
          <div class="flex flex-col gap-3 border-t border-border bg-muted/30 p-5">
            <label
              class="flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed px-4 py-8 text-center transition-colors hover:bg-accent"
              [class.border-primary]="dragging()"
              [class.bg-accent]="dragging()"
              [class.border-border]="!dragging()"
              [class.pointer-events-none]="busy()"
              (dragover)="onDragOver($event)"
              (dragleave)="dragging.set(false)"
              (drop)="onDrop($event)"
              data-testid="doc-dropzone"
            >
              <hlm-icon name="lucideFileText" size="24px" class="text-primary" />
              @if (file(); as f) {
                <span class="text-sm font-medium" data-testid="doc-file-name">{{ f.name }}</span>
                <span class="text-xs text-muted-foreground">{{ sizeLabel(f.size) }}</span>
              } @else {
                <span class="text-sm font-medium">{{
                  'clientDocuments.upload.choose' | transloco
                }}</span>
                <span class="text-xs text-muted-foreground">{{
                  'clientDocuments.upload.hint' | transloco
                }}</span>
              }
              <input
                type="file"
                class="sr-only"
                [accept]="accept"
                [disabled]="busy()"
                (change)="onFileInput($event)"
                data-testid="doc-file-input"
              />
            </label>

            @if (problem(); as p) {
              <p class="text-sm text-destructive" role="alert" data-testid="doc-problem">
                {{ 'clientDocuments.upload.problem.' + p | transloco }}
              </p>
            }
            @if (uploadError()) {
              <p class="text-sm text-destructive" role="alert" data-testid="doc-upload-error">
                {{ uploadError() }}
              </p>
            }

            @if (phase(); as current) {
              <div class="flex flex-col gap-2" role="status" data-testid="doc-progress">
                <div class="flex items-center gap-2 text-sm">
                  <hlm-spinner class="h-4 w-4" />
                  @if (current === 'uploading') {
                    {{
                      (progress() === null
                        ? 'clientDocuments.upload.uploadingUnknown'
                        : 'clientDocuments.upload.uploading'
                      ) | transloco: { percent: progress() }
                    }}
                  } @else {
                    {{ 'clientDocuments.upload.analyzing' | transloco }}
                  }
                </div>
                <div class="h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    class="h-full rounded-full bg-primary transition-all"
                    [class.animate-pulse]="current === 'analyzing'"
                    [style.width.%]="current === 'analyzing' ? 100 : (progress() ?? 5)"
                  ></div>
                </div>
              </div>
            }

            <div class="flex justify-end">
              <button
                hlmBtn
                size="sm"
                type="button"
                (click)="analyze()"
                [disabled]="!canAnalyze()"
                data-testid="doc-analyze"
              >
                @if (busy()) {
                  <hlm-spinner class="h-4 w-4" />
                } @else {
                  <hlm-icon name="lucideUpload" size="15px" />
                }
                {{ 'clientDocuments.upload.analyze' | transloco }}
              </button>
            </div>
          </div>
        </section>
      }

      <!-- Stored documents -->
      <section class="flex flex-col gap-3" data-testid="doc-list">
        <h2 class="text-base font-semibold">{{ 'clientDocuments.list.title' | transloco }}</h2>
        @if (listState() === 'loading') {
          <div class="rounded-2xl border border-border" data-testid="doc-list-skeleton">
            @for (i of skeletonRows; track i) {
              <div class="flex items-center gap-3 border-b border-border px-4 py-3 last:border-0">
                <hlm-skeleton class="h-4 w-40 shrink-0" />
                <hlm-skeleton class="h-3 flex-1" />
              </div>
            }
          </div>
        } @else if (listState() === 'error') {
          <p class="text-sm text-destructive">{{ 'clientDocuments.list.loadError' | transloco }}</p>
        } @else if (documents().length === 0) {
          <p
            class="rounded-2xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground"
            data-testid="doc-empty"
          >
            {{ 'clientDocuments.list.empty' | transloco }}
          </p>
        } @else {
          <ul class="flex flex-col divide-y divide-border rounded-2xl border border-border">
            @for (d of documents(); track d.id) {
              <li class="flex items-start gap-3 px-4 py-3" data-testid="doc-row">
                <hlm-icon
                  name="lucideFileText"
                  size="18px"
                  class="mt-0.5 shrink-0 text-muted-foreground"
                />
                <div class="flex min-w-0 flex-1 flex-col gap-1">
                  <div class="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <span class="font-medium" data-testid="doc-row-name">{{ d.name }}</span>
                    <span class="text-xs text-muted-foreground">
                      {{ 'clientDocuments.types.' + d.documentType | transloco }}
                      @if (d.fileName) {
                        · {{ d.fileName }}
                      }
                      @if (d.sizeBytes !== null) {
                        · {{ sizeLabel(d.sizeBytes) }}
                      }
                      · {{ formatDate(d.createdAt) }}
                    </span>
                  </div>
                  <p
                    class="line-clamp-3 text-sm leading-relaxed text-muted-foreground"
                    data-testid="doc-row-summary"
                  >
                    {{ d.summary || ('clientDocuments.list.noSummary' | transloco) }}
                  </p>
                </div>
                <button
                  *appHasPermission="'DOCUMENT_DELETE'"
                  type="button"
                  (click)="askDelete(d)"
                  [attr.aria-label]="'clientDocuments.list.delete' | transloco"
                  class="grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                  data-testid="doc-delete"
                >
                  <hlm-icon name="lucideTrash2" size="16px" />
                </button>
              </li>
            }
          </ul>
        }
      </section>

      <app-modal [(open)]="deleteOpen">
        <span modalTitle>{{ 'clientDocuments.list.deleteTitle' | transloco }}</span>
        @if (deleteTarget(); as d) {
          <p>{{ 'clientDocuments.list.deleteBody' | transloco: { name: d.name } }}</p>
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
          [disabled]="deleting()"
          data-testid="doc-delete-confirm"
        >
          @if (deleting()) {
            <hlm-spinner class="h-4 w-4" />
          }
          {{ 'clientDocuments.list.delete' | transloco }}
        </button>
      </app-modal>
    </div>
  `,
})
export class ProjectDocuments implements OnInit, OnDestroy {
  private readonly api = inject(ClientDocumentsApiService);
  private readonly auth = inject(AuthStore);
  private readonly permissions = inject(PermissionsStore);
  private readonly transloco = inject(TranslocoService);
  private readonly toast = inject(ToastService);

  readonly projectId = input.required<string>();

  protected readonly accept = DOCUMENT_ACCEPT;
  protected readonly skeletonRows = [0, 1, 2];

  // Upload
  protected readonly file = signal<File | null>(null);
  protected readonly problem = signal<DocumentProblem | null>(null);
  protected readonly dragging = signal(false);
  protected readonly phase = signal<UploadPhase | null>(null);
  protected readonly progress = signal<number | null>(null);
  protected readonly uploadError = signal<string | null>(null);
  protected readonly busy = computed(() => this.phase() !== null);
  protected readonly canAnalyze = computed(() => !this.busy() && !!this.file() && !this.problem());
  private upload?: Subscription;

  // Review
  protected readonly review = signal<DocumentReview | null>(null);
  protected readonly reviewFile = signal({
    name: '',
    size: '',
    chars: '',
    classified: true,
    truncated: false,
  });
  protected readonly applying = signal(false);
  protected readonly applyError = signal<string | null>(null);
  protected readonly canAddTerms = computed(() => this.permissions.has('GLOSSARY_TERM_WRITE'));
  protected readonly canAddConstraints = computed(() => this.permissions.has('CONSTRAINT_WRITE'));
  protected readonly termsSelected = computed(() => selectedCount(this.review()?.glossary ?? []));
  protected readonly constraintsSelected = computed(() =>
    selectedCount(this.review()?.constraints ?? []),
  );
  protected readonly selectableTerms = computed(
    () => (this.review()?.glossary ?? []).filter((g) => !g.exists).length,
  );
  protected readonly selectableConstraints = computed(
    () => (this.review()?.constraints ?? []).filter((c) => !c.exists).length,
  );
  protected readonly canApply = computed(() => {
    const r = this.review();
    return !!r && !this.applying() && r.name.trim().length > 0;
  });
  private readonly translate = translateFn(this.transloco);
  protected readonly typeOptions = computed<SelectOption[]>(() => {
    const t = this.translate();
    return DOCUMENT_TYPES.map((type) => ({
      value: type,
      label: t ? t(`clientDocuments.types.${type}`) : type,
    }));
  });

  // List
  protected readonly documents = signal<ProjectDocumentResponse[]>([]);
  protected readonly listState = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly deleteOpen = signal(false);
  protected readonly deleteTarget = signal<ProjectDocumentResponse | null>(null);
  protected readonly deleting = signal(false);

  ngOnInit(): void {
    this.loadDocuments();
  }

  ngOnDestroy(): void {
    this.upload?.unsubscribe();
  }

  // ---- Upload ----

  protected onFileInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.pick(target.files?.item(0) ?? null);
    // Let the same file be picked again after a failed analysis.
    target.value = '';
  }

  protected onDragOver(event: DragEvent): void {
    event.preventDefault();
    if (!this.busy()) this.dragging.set(true);
  }

  protected onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(false);
    if (this.busy()) return;
    this.pick(event.dataTransfer?.files?.item(0) ?? null);
  }

  private pick(file: File | null): void {
    this.file.set(file);
    this.problem.set(file ? documentProblem(file) : null);
    this.uploadError.set(null);
  }

  protected analyze(): void {
    const orgId = this.auth.organizationId();
    const file = this.file();
    if (!orgId || !file || !this.canAnalyze()) return;
    this.phase.set('uploading');
    this.progress.set(null);
    this.uploadError.set(null);
    this.upload = this.api.uploadDocument(orgId, this.projectId(), file).subscribe({
      next: (event) => {
        if (event.type === HttpEventType.UploadProgress) {
          const percent = uploadPercent(event.loaded, event.total);
          this.progress.set(percent);
          if (percent === 100) this.phase.set('analyzing');
        } else if (event.type === HttpEventType.Response && event.body) {
          const analysis = event.body;
          this.phase.set(null);
          this.file.set(null);
          this.reviewFile.set({
            name: analysis.fileName,
            size: formatBytes(analysis.sizeBytes),
            chars: analysis.extractedChars.toLocaleString(this.transloco.getActiveLang()),
            classified: analysis.classified,
            truncated: analysis.truncated,
          });
          this.applyError.set(null);
          this.review.set(
            reviewFromAnalysis(analysis, this.canAddTerms(), this.canAddConstraints()),
          );
        }
      },
      error: (err: HttpErrorResponse) => {
        this.phase.set(null);
        this.progress.set(null);
        const message = messageForError(err, this.transloco);
        this.uploadError.set(message);
        this.toast.error(message);
      },
    });
  }

  // ---- Review ----

  protected setName(name: string): void {
    this.review.update((r) => (r ? { ...r, name } : r));
  }

  protected setType(type: string): void {
    this.review.update((r) => (r ? { ...r, documentType: type as DocumentType } : r));
  }

  protected setSummary(summary: string): void {
    this.review.update((r) => (r ? { ...r, summary } : r));
  }

  protected toggleTerm(index: number): void {
    this.review.update((r) => (r ? { ...r, glossary: toggleItem(r.glossary, index) } : r));
  }

  protected toggleConstraint(index: number): void {
    this.review.update((r) => (r ? { ...r, constraints: toggleItem(r.constraints, index) } : r));
  }

  protected toggleAllTerms(): void {
    this.review.update((r) => (r ? { ...r, glossary: toggleAll(r.glossary) } : r));
  }

  protected toggleAllConstraints(): void {
    this.review.update((r) => (r ? { ...r, constraints: toggleAll(r.constraints) } : r));
  }

  protected apply(): void {
    const orgId = this.auth.organizationId();
    const review = this.review();
    if (!orgId || !review || !this.canApply()) return;
    this.applying.set(true);
    this.applyError.set(null);
    this.api
      .applyDocument(orgId, this.projectId(), review.documentId, applyRequestFromReview(review))
      .subscribe({
        next: (result) => {
          this.applying.set(false);
          this.review.set(null);
          this.toast.success(
            this.transloco.translate('clientDocuments.review.applied', {
              terms: result.glossaryTermsAdded,
              constraints: result.constraintsAdded,
            }),
          );
          this.loadDocuments();
        },
        error: (err: unknown) => {
          this.applying.set(false);
          const message = messageForError(err, this.transloco);
          this.applyError.set(message);
          this.toast.error(message);
        },
      });
  }

  /** Drops the analysis: the pending document and its text are deleted on the server. */
  protected discard(): void {
    const orgId = this.auth.organizationId();
    const review = this.review();
    if (!orgId || !review || this.applying()) return;
    this.review.set(null);
    this.api.deleteDocument(orgId, this.projectId(), review.documentId).subscribe({
      next: () => this.toast.info(this.transloco.translate('clientDocuments.review.discarded')),
      // Already gone (or never stored): nothing left to discard.
      error: () => this.toast.info(this.transloco.translate('clientDocuments.review.discarded')),
    });
  }

  // ---- List ----

  private loadDocuments(): void {
    const orgId = this.auth.organizationId();
    if (!orgId) {
      this.listState.set('error');
      return;
    }
    this.listState.set('loading');
    this.api.listDocuments(orgId, this.projectId()).subscribe({
      next: (docs) => {
        this.documents.set(
          [...docs].sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? '')),
        );
        this.listState.set('ready');
      },
      error: () => this.listState.set('error'),
    });
  }

  protected askDelete(document: ProjectDocumentResponse): void {
    this.deleteTarget.set(document);
    this.deleteOpen.set(true);
  }

  protected confirmDelete(): void {
    const orgId = this.auth.organizationId();
    const target = this.deleteTarget();
    if (!orgId || !target || this.deleting()) return;
    this.deleting.set(true);
    this.api.deleteDocument(orgId, this.projectId(), target.id).subscribe({
      next: () => {
        this.deleting.set(false);
        this.deleteOpen.set(false);
        this.documents.update((list) => list.filter((d) => d.id !== target.id));
        this.toast.success(this.transloco.translate('clientDocuments.list.deleted'));
      },
      error: (err: unknown) => {
        this.deleting.set(false);
        this.deleteOpen.set(false);
        this.toast.error(messageForError(err, this.transloco));
      },
    });
  }

  protected sizeLabel(bytes: number | null): string {
    return formatBytes(bytes);
  }

  protected formatDate(iso: string | null | undefined): string {
    if (!iso) return '—';
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString();
  }
}
