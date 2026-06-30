import { ChangeDetectionStrategy, Component, inject, signal, WritableSignal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { provideIcons } from '@ng-icons/core';
import { lucideArrowLeft, lucideChevronDown, lucideX } from '@ng-icons/lucide';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { AuthStore } from '../../../../core/auth/auth.store';
import { WorkspaceStore } from '../../data/workspace.store';
import { Logo } from '../../../../shared/components/logo/logo';
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
    RouterLink,
    Logo,
    HlmButton,
    HlmIcon,
    HlmInput,
    HlmLabel,
    HlmSpinner,
    TranslocoPipe,
  ],
  viewProviders: [provideIcons({ lucideArrowLeft, lucideChevronDown, lucideX })],
  template: `
    <div class="relative flex min-h-dvh flex-col bg-background text-foreground">
      <header
        class="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border px-4 md:px-6"
      >
        <a
          routerLink="/projects"
          class="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <hlm-icon name="lucideArrowLeft" size="16px" />
          {{ 'common.back' | transloco }}
        </a>
        <span class="text-sm font-medium">{{ 'projectCreate.title' | transloco }}</span>
        <app-logo [size]="24" [showText]="false" />
      </header>

      <main class="flex flex-1 justify-center px-4 py-10">
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
                    <div
                      class="flex flex-wrap items-center gap-1.5 rounded-md border border-input bg-background px-2 py-1.5"
                    >
                      @for (tag of f.list(); track tag; let i = $index) {
                        <span
                          class="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground"
                        >
                          {{ tag }}
                          <button
                            type="button"
                            (click)="removeChip(f.list, i)"
                            class="text-muted-foreground hover:text-foreground"
                            [attr.aria-label]="'common.remove' | transloco"
                          >
                            <hlm-icon name="lucideX" size="12px" />
                          </button>
                        </span>
                      }
                      <input
                        #chipInput
                        type="text"
                        (keydown)="onChipKey($event, f.list, chipInput)"
                        (blur)="addChip(f.list, chipInput)"
                        [placeholder]="f.placeholder"
                        class="min-w-[6rem] flex-1 bg-transparent py-0.5 text-sm outline-none placeholder:text-muted-foreground"
                      />
                    </div>
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

  protected onChipKey(
    event: KeyboardEvent,
    list: WritableSignal<string[]>,
    input: HTMLInputElement,
  ): void {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      this.addChip(list, input);
    }
  }

  protected addChip(list: WritableSignal<string[]>, input: HTMLInputElement): void {
    const value = input.value.trim();
    if (value && !list().includes(value)) list.update((tags) => [...tags, value]);
    input.value = '';
  }

  protected removeChip(list: WritableSignal<string[]>, index: number): void {
    list.update((tags) => tags.filter((_, i) => i !== index));
  }

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
          this.errorMessage.set(
            this.transloco.translate(
              err.status === 400 ? 'projects.errorNameInUse' : 'projects.errorGeneric',
            ),
          );
        },
      });
  }
}
