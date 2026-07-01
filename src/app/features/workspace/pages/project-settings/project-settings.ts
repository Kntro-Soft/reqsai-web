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
import { HttpErrorResponse } from '@angular/common/http';
import { provideIcons } from '@ng-icons/core';
import { lucideCheck, lucideUpload } from '@ng-icons/lucide';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { AuthStore } from '../../../../core/auth/auth.store';
import { WorkspaceApiService } from '../../data/workspace-api.service';
import { Avatar } from '../../../../shared/components/avatar/avatar';
import { ChipInput } from '../../../../shared/components/chip-input/chip-input';
import { ToastService } from '../../../../shared/toast/toast.service';
import {
  HlmButton,
  HlmIcon,
  HlmInput,
  HlmLabel,
  HlmSkeleton,
  HlmSpinner,
} from '../../../../shared/ui';

/** Project settings: a logo card (immediate upload) plus an editable name, description and tech
 * stack. Tech lists use the chip input (no comma parsing). Vercel-style bordered cards. */
@Component({
  selector: 'app-project-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
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
              <hlm-skeleton class="h-16 w-16 shrink-0 rounded-xl" />
            </div>
            <div class="border-t border-border bg-muted/30 px-5 py-3">
              <hlm-skeleton class="h-3 w-52" />
            </div>
          </section>
          <section class="overflow-hidden rounded-2xl border border-border">
            <div class="flex flex-col gap-4 p-5">
              <hlm-skeleton class="h-10 w-full rounded-md" />
              <hlm-skeleton class="h-10 w-full rounded-md" />
              <div class="grid gap-4 sm:grid-cols-2">
                @for (i of skeletonFields; track i) {
                  <hlm-skeleton class="h-10 w-full rounded-md" />
                }
              </div>
            </div>
          </section>
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
              class="group relative shrink-0 cursor-pointer rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              [attr.aria-label]="'orgSettings.logoUpload' | transloco"
            >
              <app-avatar
                [name]="projectName()"
                [seed]="projectId()"
                [imageUrl]="avatarUrl()"
                [size]="64"
              />
              <span
                class="absolute inset-0 grid place-items-center rounded-xl bg-black/50 text-white opacity-0 transition-opacity group-hover:opacity-100"
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

        <!-- Details -->
        <section class="overflow-hidden rounded-2xl border border-border">
          <form [formGroup]="form" (ngSubmit)="save()" class="flex flex-col gap-4 p-5">
            <div class="flex flex-col gap-2">
              <label hlmLabel for="name">{{ 'projects.name' | transloco }}</label>
              <input hlmInput id="name" formControlName="name" />
            </div>
            <div class="flex flex-col gap-2">
              <label hlmLabel for="description">{{ 'projects.description' | transloco }}</label>
              <input hlmInput id="description" formControlName="description" />
            </div>
            <div class="grid gap-4 sm:grid-cols-2">
              <div class="flex flex-col gap-2">
                <span hlmLabel>{{ 'projects.programmingLanguages' | transloco }}</span>
                <app-chip-input
                  [value]="programmingLanguages()"
                  (valueChange)="programmingLanguages.set($event)"
                />
              </div>
              <div class="flex flex-col gap-2">
                <span hlmLabel>{{ 'projects.frameworks' | transloco }}</span>
                <app-chip-input [value]="frameworks()" (valueChange)="frameworks.set($event)" />
              </div>
              <div class="flex flex-col gap-2">
                <span hlmLabel>{{ 'projects.clientPlatforms' | transloco }}</span>
                <app-chip-input
                  [value]="clientPlatforms()"
                  (valueChange)="clientPlatforms.set($event)"
                />
              </div>
              <div class="flex flex-col gap-2">
                <span hlmLabel>{{ 'projects.databases' | transloco }}</span>
                <app-chip-input [value]="databases()" (valueChange)="databases.set($event)" />
              </div>
              <div class="flex flex-col gap-2">
                <label hlmLabel for="architecture">{{ 'projects.architecture' | transloco }}</label>
                <input hlmInput id="architecture" formControlName="architecture" />
              </div>
              <div class="flex flex-col gap-2">
                <label hlmLabel for="domain">{{ 'projects.domain' | transloco }}</label>
                <input hlmInput id="domain" formControlName="domain" />
              </div>
            </div>

            @if (errorMessage()) {
              <p class="text-sm text-destructive" data-testid="form-error">{{ errorMessage() }}</p>
            }

            <div class="mt-2 flex items-center justify-end gap-3">
              @if (saved()) {
                <span class="flex items-center gap-1 text-sm text-emerald-500" data-testid="settings-saved">
                  <hlm-icon name="lucideCheck" size="14px" />
                  {{ 'projectSettings.saved' | transloco }}
                </span>
              }
              <button
                hlmBtn
                type="submit"
                [disabled]="form.invalid || saving()"
                data-testid="settings-save"
              >
                @if (saving()) {
                  <hlm-spinner class="h-4 w-4" />
                }
                {{ 'projectSettings.save' | transloco }}
              </button>
            </div>
          </form>
        </section>
      }
    </div>
  `,
})
export class ProjectSettings implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(WorkspaceApiService);
  private readonly store = inject(AuthStore);
  private readonly transloco = inject(TranslocoService);
  private readonly toast = inject(ToastService);

  readonly projectId = input.required<string>();

  protected readonly skeletonFields = [0, 1, 2, 3, 4, 5];
  protected readonly state = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly saving = signal(false);
  protected readonly saved = signal(false);
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
        this.state.set('ready');
      },
      error: () => this.state.set('error'),
    });
  }

  protected save(): void {
    const orgId = this.store.organizationId();
    if (!orgId || this.form.invalid || this.saving()) return;
    this.saving.set(true);
    this.saved.set(false);
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
          this.saving.set(false);
          this.saved.set(true);
          this.projectName.set(project.name);
          this.toast.success(this.transloco.translate('projectSettings.saved'));
        },
        error: (err: HttpErrorResponse) => {
          this.saving.set(false);
          const message = this.transloco.translate(
            err.status === 400
              ? 'projectSettings.errorValidation'
              : 'projectSettings.errorGeneric',
          );
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
        this.errorMessage.set(
          this.transloco.translate(
            err.status === 400 ? 'orgSettings.logoError' : 'projectSettings.errorGeneric',
          ),
        );
      },
    });
  }
}
