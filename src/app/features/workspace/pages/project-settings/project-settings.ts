import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { provideIcons } from '@ng-icons/core';
import { lucideCheck, lucideUpload } from '@ng-icons/lucide';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { AuthStore } from '../../../../core/auth/auth.store';
import { WorkspaceApiService } from '../../data/workspace-api.service';
import { Avatar } from '../../../../shared/components/avatar/avatar';
import { ChipInput } from '../../../../shared/components/chip-input/chip-input';
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

/** The saveable project fields — one per bordered card. */
type PField =
  | 'name'
  | 'description'
  | 'programmingLanguages'
  | 'frameworks'
  | 'clientPlatforms'
  | 'databases'
  | 'architecture'
  | 'domain';

/** Project settings: a logo card (immediate upload) plus one bordered card per editable field (name,
 * description, tech-stack chip lists, architecture, domain), each with its own footer Save. The
 * backend update is a full PUT, so every card's Save sends the complete current value; only the
 * "changed since load" gating differs per card. Vercel-style, matching org settings. */
@Component({
  selector: 'app-project-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    NgTemplateOutlet,
    ReactiveFormsModule,
    Avatar,
    ChipInput,
    HlmButton,
    HlmIcon,
    HlmInput,
    HlmLabel,
    HlmSkeleton,
    HlmSpinner,
    TranslocoPipe,
  ],
  viewProviders: [provideIcons({ lucideCheck, lucideUpload })],
  template: `
    <div class="flex flex-col gap-6">
      <div>
        <h1 class="text-2xl font-bold tracking-tight">{{ 'projectSettings.title' | transloco }}</h1>
        <p class="mt-1 text-sm text-muted-foreground">
          {{ 'projectSettings.subtitle' | transloco }}
        </p>
      </div>

      @if (state() === 'loading') {
        <div class="flex flex-col gap-6" data-testid="project-settings-skeleton">
          <section class="overflow-hidden rounded-2xl border border-border">
            <div class="flex items-center justify-between gap-4 p-5">
              <div class="flex flex-1 flex-col gap-2">
                <hlm-skeleton class="h-5 w-32" />
                <hlm-skeleton class="h-3 w-72 max-w-full" />
              </div>
              <hlm-skeleton class="h-16 w-16 shrink-0 rounded-full" />
            </div>
            <div class="border-t border-border bg-muted/30 px-5 py-3">
              <hlm-skeleton class="h-3 w-52" />
            </div>
          </section>
          @for (i of skeletonFields; track i) {
            <section class="overflow-hidden rounded-2xl border border-border">
              <div class="flex flex-col gap-3 p-5">
                <hlm-skeleton class="h-5 w-40" />
                <hlm-skeleton class="h-10 w-full max-w-md rounded-md" />
              </div>
              <div class="flex justify-end border-t border-border bg-muted/30 px-5 py-3">
                <hlm-skeleton class="h-8 w-28 rounded-md" />
              </div>
            </section>
          }
        </div>
      } @else if (state() === 'error') {
        <p class="text-sm text-destructive">{{ 'projectSettings.errorGeneric' | transloco }}</p>
      } @else {
        <!-- Logo -->
        <section class="overflow-hidden rounded-2xl border border-border">
          <div class="flex items-center justify-between gap-4 p-5">
            <div class="flex flex-col gap-1">
              <h2 class="text-base font-semibold">{{ 'orgSettings.logo' | transloco }}</h2>
              <p class="text-sm text-muted-foreground">{{ 'orgSettings.logoDesc' | transloco }}</p>
            </div>
            <button
              type="button"
              (click)="fileInput.click()"
              class="group relative shrink-0 cursor-pointer rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              [attr.aria-label]="'orgSettings.logoUpload' | transloco"
            >
              <app-avatar
                [name]="projectName()"
                [seed]="projectId()"
                [imageUrl]="avatarUrl()"
                [size]="64"
              />
              <span
                class="absolute inset-0 grid place-items-center rounded-full bg-black/50 text-white opacity-0 transition-opacity group-hover:opacity-100"
              >
                <hlm-icon name="lucideUpload" size="18px" />
              </span>
            </button>
            <input
              #fileInput
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              class="hidden"
              (change)="onAvatarSelected($event)"
            />
          </div>
          <div class="border-t border-border bg-muted/30 px-5 py-3">
            <span class="text-xs text-muted-foreground">
              @if (uploadingAvatar()) {
                {{ 'orgSettings.logoUploading' | transloco }}
              } @else {
                {{ 'orgSettings.logoHint' | transloco }}
              }
            </span>
          </div>
        </section>

        <div [formGroup]="form" class="flex flex-col gap-6">
          <!-- Name -->
          <section class="overflow-hidden rounded-2xl border border-border">
            <div class="flex flex-col gap-3 p-5">
              <label hlmLabel for="name" class="text-base font-semibold">
                {{ 'projects.name' | transloco }}
              </label>
              <input hlmInput id="name" formControlName="name" class="max-w-md" />
            </div>
            <div
              class="flex items-center justify-end gap-2 border-t border-border bg-muted/30 px-5 py-3"
            >
              <ng-container
                [ngTemplateOutlet]="saveBar"
                [ngTemplateOutletContext]="{
                  field: 'name',
                  dirty: dirtyName(),
                  invalid: form.controls.name.invalid,
                }"
              />
            </div>
          </section>

          <!-- Description -->
          <section class="overflow-hidden rounded-2xl border border-border">
            <div class="flex flex-col gap-3 p-5">
              <label hlmLabel for="description" class="text-base font-semibold">
                {{ 'projects.description' | transloco }}
              </label>
              <input hlmInput id="description" formControlName="description" class="max-w-md" />
            </div>
            <div
              class="flex items-center justify-end gap-2 border-t border-border bg-muted/30 px-5 py-3"
            >
              <ng-container
                [ngTemplateOutlet]="saveBar"
                [ngTemplateOutletContext]="{ field: 'description', dirty: dirtyDescription() }"
              />
            </div>
          </section>

          <!-- Programming languages -->
          <section class="overflow-hidden rounded-2xl border border-border">
            <div class="flex flex-col gap-3 p-5">
              <span hlmLabel class="text-base font-semibold">
                {{ 'projects.programmingLanguages' | transloco }}
              </span>
              <app-chip-input
                [value]="programmingLanguages()"
                (valueChange)="programmingLanguages.set($event)"
              />
            </div>
            <div
              class="flex items-center justify-end gap-2 border-t border-border bg-muted/30 px-5 py-3"
            >
              <ng-container
                [ngTemplateOutlet]="saveBar"
                [ngTemplateOutletContext]="{
                  field: 'programmingLanguages',
                  dirty: dirtyProgrammingLanguages(),
                }"
              />
            </div>
          </section>

          <!-- Frameworks -->
          <section class="overflow-hidden rounded-2xl border border-border">
            <div class="flex flex-col gap-3 p-5">
              <span hlmLabel class="text-base font-semibold">
                {{ 'projects.frameworks' | transloco }}
              </span>
              <app-chip-input [value]="frameworks()" (valueChange)="frameworks.set($event)" />
            </div>
            <div
              class="flex items-center justify-end gap-2 border-t border-border bg-muted/30 px-5 py-3"
            >
              <ng-container
                [ngTemplateOutlet]="saveBar"
                [ngTemplateOutletContext]="{ field: 'frameworks', dirty: dirtyFrameworks() }"
              />
            </div>
          </section>

          <!-- Client platforms -->
          <section class="overflow-hidden rounded-2xl border border-border">
            <div class="flex flex-col gap-3 p-5">
              <span hlmLabel class="text-base font-semibold">
                {{ 'projects.clientPlatforms' | transloco }}
              </span>
              <app-chip-input
                [value]="clientPlatforms()"
                (valueChange)="clientPlatforms.set($event)"
              />
            </div>
            <div
              class="flex items-center justify-end gap-2 border-t border-border bg-muted/30 px-5 py-3"
            >
              <ng-container
                [ngTemplateOutlet]="saveBar"
                [ngTemplateOutletContext]="{ field: 'clientPlatforms', dirty: dirtyClientPlatforms() }"
              />
            </div>
          </section>

          <!-- Databases -->
          <section class="overflow-hidden rounded-2xl border border-border">
            <div class="flex flex-col gap-3 p-5">
              <span hlmLabel class="text-base font-semibold">
                {{ 'projects.databases' | transloco }}
              </span>
              <app-chip-input [value]="databases()" (valueChange)="databases.set($event)" />
            </div>
            <div
              class="flex items-center justify-end gap-2 border-t border-border bg-muted/30 px-5 py-3"
            >
              <ng-container
                [ngTemplateOutlet]="saveBar"
                [ngTemplateOutletContext]="{ field: 'databases', dirty: dirtyDatabases() }"
              />
            </div>
          </section>

          <!-- Architecture -->
          <section class="overflow-hidden rounded-2xl border border-border">
            <div class="flex flex-col gap-3 p-5">
              <label hlmLabel for="architecture" class="text-base font-semibold">
                {{ 'projects.architecture' | transloco }}
              </label>
              <input hlmInput id="architecture" formControlName="architecture" class="max-w-md" />
            </div>
            <div
              class="flex items-center justify-end gap-2 border-t border-border bg-muted/30 px-5 py-3"
            >
              <ng-container
                [ngTemplateOutlet]="saveBar"
                [ngTemplateOutletContext]="{ field: 'architecture', dirty: dirtyArchitecture() }"
              />
            </div>
          </section>

          <!-- Domain -->
          <section class="overflow-hidden rounded-2xl border border-border">
            <div class="flex flex-col gap-3 p-5">
              <label hlmLabel for="domain" class="text-base font-semibold">
                {{ 'projects.domain' | transloco }}
              </label>
              <input hlmInput id="domain" formControlName="domain" class="max-w-md" />
            </div>
            <div
              class="flex items-center justify-end gap-2 border-t border-border bg-muted/30 px-5 py-3"
            >
              <ng-container
                [ngTemplateOutlet]="saveBar"
                [ngTemplateOutletContext]="{ field: 'domain', dirty: dirtyDomain() }"
              />
            </div>
          </section>
        </div>

        @if (errorMessage()) {
          <p class="text-sm text-destructive" data-testid="form-error">{{ errorMessage() }}</p>
        }
      }
    </div>

    <!-- Shared footer save bar: a "Saved" indicator + a Save gated on dirty/invalid/saving. -->
    <ng-template #saveBar let-field="field" let-dirty="dirty" let-invalid="invalid">
      @if (savedField() === field) {
        <span
          class="flex items-center gap-1 text-xs text-emerald-500"
          data-testid="settings-saved"
        >
          <hlm-icon name="lucideCheck" size="13px" />
          {{ 'projectSettings.saved' | transloco }}
        </span>
      }
      <button
        hlmBtn
        size="sm"
        type="button"
        (click)="saveField(field)"
        [disabled]="saving() === field || invalid || !dirty"
        data-testid="settings-save"
      >
        @if (saving() === field) {
          <hlm-spinner class="h-4 w-4" />
        }
        {{ 'projectSettings.save' | transloco }}
      </button>
    </ng-template>
  `,
})
export class ProjectSettings implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(WorkspaceApiService);
  private readonly store = inject(AuthStore);
  private readonly transloco = inject(TranslocoService);
  private readonly toast = inject(ToastService);

  readonly projectId = input.required<string>();

  protected readonly skeletonFields = [0, 1, 2, 3, 4, 5, 6, 7];
  protected readonly state = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly saving = signal<PField | null>(null);
  protected readonly savedField = signal<PField | null>(null);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly projectName = signal('');
  protected readonly uploadingAvatar = signal(false);

  protected readonly programmingLanguages = signal<string[]>([]);
  protected readonly frameworks = signal<string[]>([]);
  protected readonly clientPlatforms = signal<string[]>([]);
  protected readonly databases = signal<string[]>([]);

  private readonly avatarBase = signal<string | null>(null);
  private readonly avatarVersion = signal(0);
  protected readonly avatarUrl = computed(() => {
    const base = this.avatarBase();
    if (!base) return null;
    return this.avatarVersion() ? `${base}?v=${this.avatarVersion()}` : base;
  });

  protected readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(150)]],
    description: [''],
    architecture: [''],
    domain: [''],
  });

  /** Snapshot of the last loaded/saved values; each card's Save is disabled until its field differs. */
  private readonly initial = signal({
    name: '',
    description: '',
    architecture: '',
    domain: '',
    programmingLanguages: [] as string[],
    frameworks: [] as string[],
    clientPlatforms: [] as string[],
    databases: [] as string[],
  });
  /** Live text-form value, mirrored into a signal so the dirty computeds recompute reactively. */
  private readonly value = toSignal(this.form.valueChanges, {
    initialValue: this.form.getRawValue(),
  });

  protected readonly dirtyName = computed(() => this.value().name !== this.initial().name);
  protected readonly dirtyDescription = computed(
    () => this.value().description !== this.initial().description,
  );
  protected readonly dirtyArchitecture = computed(
    () => this.value().architecture !== this.initial().architecture,
  );
  protected readonly dirtyDomain = computed(() => this.value().domain !== this.initial().domain);
  protected readonly dirtyProgrammingLanguages = computed(() =>
    this.listChanged(this.programmingLanguages(), this.initial().programmingLanguages),
  );
  protected readonly dirtyFrameworks = computed(() =>
    this.listChanged(this.frameworks(), this.initial().frameworks),
  );
  protected readonly dirtyClientPlatforms = computed(() =>
    this.listChanged(this.clientPlatforms(), this.initial().clientPlatforms),
  );
  protected readonly dirtyDatabases = computed(() =>
    this.listChanged(this.databases(), this.initial().databases),
  );

  private listChanged(a: string[], b: string[]): boolean {
    return a.length !== b.length || a.some((x, i) => x !== b[i]);
  }

  ngOnInit(): void {
    const orgId = this.store.organizationId();
    if (!orgId) return;
    this.api.getProject(orgId, this.projectId()).subscribe({
      next: (project) => {
        this.projectName.set(project.name);
        this.avatarBase.set(project.avatarUrl);
        this.programmingLanguages.set(project.programmingLanguages);
        this.frameworks.set(project.frameworks);
        this.clientPlatforms.set(project.clientPlatforms);
        this.databases.set(project.databases);
        this.form.patchValue({
          name: project.name,
          description: project.description ?? '',
          architecture: project.architecture ?? '',
          domain: project.domain ?? '',
        });
        this.snapshot();
        this.state.set('ready');
      },
      error: () => this.state.set('error'),
    });
  }

  /** Capture the current form + chip values as the new "unchanged" baseline (re-disables all cards). */
  private snapshot(): void {
    const v = this.form.getRawValue();
    this.initial.set({
      name: v.name,
      description: v.description,
      architecture: v.architecture,
      domain: v.domain,
      programmingLanguages: [...this.programmingLanguages()],
      frameworks: [...this.frameworks()],
      clientPlatforms: [...this.clientPlatforms()],
      databases: [...this.databases()],
    });
  }

  protected saveField(field: PField): void {
    const orgId = this.store.organizationId();
    if (!orgId || this.form.controls.name.invalid || this.saving()) return;
    this.saving.set(field);
    this.savedField.set(null);
    this.errorMessage.set(null);
    const v = this.form.getRawValue();
    this.api
      .updateProject(orgId, this.projectId(), {
        name: v.name,
        description: v.description || undefined,
        programmingLanguages: this.programmingLanguages(),
        frameworks: this.frameworks(),
        clientPlatforms: this.clientPlatforms(),
        databases: this.databases(),
        architecture: v.architecture || undefined,
        domain: v.domain || undefined,
      })
      .subscribe({
        next: (project) => {
          this.saving.set(null);
          this.savedField.set(field);
          this.projectName.set(project.name);
          // Full PUT commits every field, so re-baseline all cards — they disable until changed again.
          this.snapshot();
          this.toast.success(this.transloco.translate('projectSettings.saved'));
        },
        error: (err: HttpErrorResponse) => {
          this.saving.set(null);
          const message = messageForError(err, this.transloco);
          this.errorMessage.set(message);
          this.toast.error(message);
        },
      });
  }

  protected onAvatarSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    const orgId = this.store.organizationId();
    if (!file || !orgId || this.uploadingAvatar()) return;
    this.uploadingAvatar.set(true);
    this.errorMessage.set(null);
    this.api.uploadProjectAvatar(orgId, this.projectId(), file).subscribe({
      next: (project) => {
        this.uploadingAvatar.set(false);
        this.avatarBase.set(project.avatarUrl);
        this.avatarVersion.update((ver) => ver + 1);
      },
      error: (err: HttpErrorResponse) => {
        this.uploadingAvatar.set(false);
        this.errorMessage.set(messageForError(err, this.transloco));
      },
    });
  }
}
