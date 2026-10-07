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
 * Dedicated "new project" page (no app shell): only the name is required (and says so); the
 * technical profile is one clearly optional, collapsible section grouped into business context
 * (domain, architecture) and tech stack (chip lists). Placeholders read as examples ("e.g. …"),
 * never as pre-filled values. The backend accepts a name-only project.
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
              <div class="flex items-baseline justify-between gap-3">
                <label hlmLabel for="name">{{ 'projects.name' | transloco }}</label>
                <span class="text-xs text-muted-foreground">{{
                  'common.required' | transloco
                }}</span>
              </div>
              <input
                hlmInput
                id="name"
                formControlName="name"
                aria-required="true"
                [placeholder]="'projectCreate.namePlaceholder' | transloco"
              />
            </div>

            <!-- Everything below is optional context for the AI, grouped by what it
                 describes instead of eight loose fields. -->
            <button
              type="button"
              (click)="showAdvanced.set(!showAdvanced())"
              [attr.aria-expanded]="showAdvanced()"
              aria-controls="project-tech-profile"
              class="flex w-full items-center justify-between gap-3 rounded-xl border border-border bg-card/70 px-4 py-3 text-left transition-colors hover:bg-secondary/60"
              data-testid="project-create-advanced"
            >
              <span class="min-w-0">
                <span class="flex flex-wrap items-center gap-2 text-sm font-medium text-foreground">
                  {{ 'projectCreate.advanced' | transloco }}
                  <span
                    class="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
                    >{{ 'common.optional' | transloco }}</span
                  >
                </span>
                <span class="mt-0.5 block text-xs text-muted-foreground">
                  {{ 'projectCreate.advancedHint' | transloco }}
                </span>
              </span>
              <hlm-icon
                name="lucideChevronDown"
                size="16px"
                class="shrink-0 text-muted-foreground transition-transform"
                [class.rotate-180]="showAdvanced()"
              />
            </button>

            @if (showAdvanced()) {
              <div
                id="project-tech-profile"
                class="flex flex-col gap-6 rounded-xl border border-border bg-card/70 p-4 sm:p-5"
              >
                <div class="flex flex-col gap-2">
                  <label hlmLabel for="description">{{ 'projects.description' | transloco }}</label>
                  <textarea
                    hlmInput
                    id="description"
                    rows="2"
                    formControlName="description"
                    [placeholder]="'projectCreate.descriptionPlaceholder' | transloco"
                  ></textarea>
                </div>

                <fieldset class="flex flex-col gap-3">
                  <legend hlmLabel class="mb-3 text-sm font-semibold">
                    {{ 'projectCreate.contextGroup' | transloco }}
                  </legend>
                  <div class="grid gap-4 sm:grid-cols-2">
                    <div class="flex flex-col gap-2">
                      <label hlmLabel for="domain">{{ 'projects.domain' | transloco }}</label>
                      <input
                        hlmInput
                        id="domain"
                        formControlName="domain"
                        [placeholder]="'projectCreate.example' | transloco: { value: 'Fintech' }"
                      />
                    </div>
                    <div class="flex flex-col gap-2">
                      <label hlmLabel for="architecture">{{
                        'projects.architecture' | transloco
                      }}</label>
                      <input
                        hlmInput
                        id="architecture"
                        formControlName="architecture"
                        [placeholder]="'projectCreate.example' | transloco: { value: 'Hexagonal' }"
                      />
                    </div>
                  </div>
                </fieldset>

                <fieldset class="flex flex-col gap-3">
                  <legend hlmLabel class="mb-1 text-sm font-semibold">
                    {{ 'projectCreate.stackGroup' | transloco }}
                  </legend>
                  <p id="project-chip-hint" class="text-xs text-muted-foreground">
                    {{ 'projectCreate.chipHint' | transloco }}
                  </p>
                  <div class="grid gap-4 sm:grid-cols-2">
                    @for (f of chipFields; track f.key) {
                      <div class="flex flex-col gap-2">
                        <label hlmLabel [for]="'chip-' + f.key">{{ f.labelKey | transloco }}</label>
                        <app-chip-input
                          [inputId]="'chip-' + f.key"
                          describedBy="project-chip-hint"
                          [value]="f.list()"
                          (valueChange)="f.list.set($event)"
                          [placeholder]="
                            'projectCreate.example' | transloco: { value: f.placeholder }
                          "
                        />
                      </div>
                    }
                  </div>
                </fieldset>
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
