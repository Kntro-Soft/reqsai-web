import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { provideIcons } from '@ng-icons/core';
import { lucideChevronDown } from '@ng-icons/lucide';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { AuthStore } from '../../../../core/auth/auth.store';
import { WorkspaceStore } from '../../data/workspace.store';
import { messageForError } from '../../../../core/errors/error-message';
import { AnimatedBackdrop } from '../../../../shared/components/animated-backdrop/animated-backdrop';
import { CreatePageHeader } from '../../../../shared/components/create-page-header/create-page-header';
import { ChipInput } from '../../../../shared/components/chip-input/chip-input';
import { HlmButton, HlmIcon, HlmInput, HlmLabel, HlmSpinner } from '../../../../shared/ui';

/**
 * Dedicated "new project" page (no app shell): only the name is required; the technical profile is
 * optional context under "advanced", with the list fields entered as chips. The backend accepts a
 * name-only project.
 */
@Component({
  selector: 'app-project-create',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    AnimatedBackdrop,
    CreatePageHeader,
    ChipInput,
    HlmButton,
    HlmIcon,
    HlmInput,
    HlmLabel,
    HlmSpinner,
    TranslocoPipe,
  ],
  viewProviders: [provideIcons({ lucideChevronDown })],
  template: `
    <div
      class="relative isolate flex min-h-dvh flex-col overflow-hidden bg-background text-foreground"
    >
      <!-- Decorative, interactive background matching the onboarding composition. -->
      <app-animated-backdrop />

      <app-create-page-header backHref="/projects" [logoSize]="24" />

      <main
        class="relative z-10 flex flex-1 justify-center px-4 py-10"
        [class.items-center]="!showAdvanced()"
        [class.items-start]="showAdvanced()"
      >
        <div class="w-full max-w-2xl">
          <div class="mb-6">
            <h1 class="text-2xl font-bold tracking-tight">
              {{ 'projectCreate.title' | transloco }}
            </h1>
            <p class="mt-1 text-sm text-muted-foreground">
              {{ 'projectCreate.subtitle' | transloco }}
            </p>
          </div>

          <form [formGroup]="form" (ngSubmit)="submit()" class="flex flex-col gap-5">
            <div class="flex flex-col gap-2">
              <label hlmLabel for="name">{{ 'projects.name' | transloco }}</label>
              <input hlmInput id="name" formControlName="name" placeholder="Mobile App" />
            </div>

            <button
              type="button"
              (click)="showAdvanced.set(!showAdvanced())"
              class="flex items-center gap-1.5 self-start text-sm text-muted-foreground hover:text-foreground"
            >
              <hlm-icon
                name="lucideChevronDown"
                size="15px"
                class="transition-transform"
                [class.rotate-180]="showAdvanced()"
              />
              {{ 'projectCreate.advanced' | transloco }}
            </button>

            @if (showAdvanced()) {
              <div class="flex flex-col gap-4 rounded-xl border border-border p-4">
                <p class="text-xs text-muted-foreground">
                  {{ 'projectCreate.advancedHint' | transloco }}
                </p>

                <div class="flex flex-col gap-2">
                  <label hlmLabel for="description">{{ 'projects.description' | transloco }}</label>
                  <input hlmInput id="description" formControlName="description" />
                </div>

                @for (f of chipFields; track f.key) {
                  <div class="flex flex-col gap-2">
                    <span hlmLabel>{{ f.labelKey | transloco }}</span>
                    <app-chip-input
                      [value]="f.list()"
                      (valueChange)="f.list.set($event)"
                      [placeholder]="f.placeholder"
                    />
                  </div>
                }

                <div class="grid gap-4 sm:grid-cols-2">
                  <div class="flex flex-col gap-2">
                    <label hlmLabel for="architecture">{{
                      'projects.architecture' | transloco
                    }}</label>
                    <input
                      hlmInput
                      id="architecture"
                      formControlName="architecture"
                      placeholder="Hexagonal"
                    />
                  </div>
                  <div class="flex flex-col gap-2">
                    <label hlmLabel for="domain">{{ 'projects.domain' | transloco }}</label>
                    <input hlmInput id="domain" formControlName="domain" placeholder="Fintech" />
                  </div>
                </div>
              </div>
            }

            @if (errorMessage()) {
              <p class="text-sm text-destructive" data-testid="form-error">{{ errorMessage() }}</p>
            }

            <button hlmBtn type="submit" [disabled]="form.invalid || loading()" class="w-full">
              @if (loading()) {
                <hlm-spinner class="h-4 w-4" />
              }
              {{ 'projects.createCta' | transloco }}
            </button>
          </form>
        </div>
      </main>
    </div>
  `,
})
export class ProjectCreate {
  private readonly fb = inject(FormBuilder);
  private readonly authStore = inject(AuthStore);
  private readonly store = inject(WorkspaceStore);
  private readonly router = inject(Router);
  private readonly transloco = inject(TranslocoService);

  protected readonly loading = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly showAdvanced = signal(false);

  protected readonly programmingLanguages = signal<string[]>([]);
  protected readonly frameworks = signal<string[]>([]);
  protected readonly clientPlatforms = signal<string[]>([]);
  protected readonly databases = signal<string[]>([]);

  protected readonly chipFields = [
    {
      key: 'lang',
      labelKey: 'projects.programmingLanguages',
      placeholder: 'TypeScript',
      list: this.programmingLanguages,
    },
    { key: 'fw', labelKey: 'projects.frameworks', placeholder: 'Angular', list: this.frameworks },
    {
      key: 'plat',
      labelKey: 'projects.clientPlatforms',
      placeholder: 'Web',
      list: this.clientPlatforms,
    },
    { key: 'db', labelKey: 'projects.databases', placeholder: 'PostgreSQL', list: this.databases },
  ];

  protected readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(150)]],
    description: ['', [Validators.maxLength(2000)]],
    architecture: ['', [Validators.maxLength(100)]],
    domain: ['', [Validators.maxLength(100)]],
  });

  protected submit(): void {
    const orgId = this.authStore.organizationId();
    if (this.form.invalid || this.loading() || !orgId) return;
    this.loading.set(true);
    this.errorMessage.set(null);

    const raw = this.form.getRawValue();
    this.store
      .createProject(orgId, {
        name: raw.name,
        description: raw.description || undefined,
        programmingLanguages: this.programmingLanguages(),
        frameworks: this.frameworks(),
        clientPlatforms: this.clientPlatforms(),
        databases: this.databases(),
        architecture: raw.architecture || undefined,
        domain: raw.domain || undefined,
      })
      .subscribe({
        next: (project) => void this.router.navigate(['/projects', project.id]),
        error: (err: HttpErrorResponse) => {
          this.loading.set(false);
          this.errorMessage.set(messageForError(err, this.transloco));
        },
      });
  }
}
