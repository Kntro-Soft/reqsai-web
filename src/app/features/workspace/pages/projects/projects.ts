import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { provideIcons } from '@ng-icons/core';
import { lucideChevronRight, lucideFolder } from '@ng-icons/lucide';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { AuthStore } from '../../../../core/auth/auth.store';
import { WorkspaceStore } from '../../data/workspace.store';
import {
  HlmButton,
  HlmCard,
  HlmCardContent,
  HlmCardDescription,
  HlmCardHeader,
  HlmCardTitle,
  HlmIcon,
  HlmInput,
  HlmLabel,
  HlmSpinner,
} from '../../../../shared/ui';

function toList(csv: string): string[] {
  return csv
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

@Component({
  selector: 'app-projects',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    HlmButton,
    HlmCard,
    HlmCardHeader,
    HlmCardTitle,
    HlmCardDescription,
    HlmCardContent,
    HlmInput,
    HlmLabel,
    HlmSpinner,
    HlmIcon,
    TranslocoPipe,
  ],
  viewProviders: [provideIcons({ lucideFolder, lucideChevronRight })],
  template: `
    <div class="flex flex-col gap-6">
      <div class="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 class="text-2xl font-bold tracking-tight">{{ 'projects.title' | transloco }}</h1>
          <p class="text-sm text-muted-foreground">{{ 'projects.subtitle' | transloco }}</p>
        </div>
        <button hlmBtn type="button" (click)="showForm.set(!showForm())">
          {{ (showForm() ? 'common.cancel' : 'projects.new') | transloco }}
        </button>
      </div>

      @if (showForm()) {
        <div hlmCard>
          <div hlmCardHeader>
            <h2 hlmCardTitle>{{ 'projects.formTitle' | transloco }}</h2>
            <p hlmCardDescription>{{ 'projects.formSubtitle' | transloco }}</p>
          </div>
          <div hlmCardContent>
            <form [formGroup]="form" (ngSubmit)="submit()" class="grid gap-4 md:grid-cols-2">
              <div class="flex flex-col gap-2 md:col-span-2">
                <label hlmLabel for="name">{{ 'projects.name' | transloco }}</label>
                <input hlmInput id="name" formControlName="name" placeholder="Mobile App" />
              </div>
              <div class="flex flex-col gap-2 md:col-span-2">
                <label hlmLabel for="description">{{ 'projects.description' | transloco }}</label>
                <input hlmInput id="description" formControlName="description" />
              </div>
              <div class="flex flex-col gap-2">
                <label hlmLabel for="programmingLanguages">{{
                  'projects.programmingLanguages' | transloco
                }}</label>
                <input
                  hlmInput
                  id="programmingLanguages"
                  formControlName="programmingLanguages"
                  placeholder="TypeScript, Java"
                />
              </div>
              <div class="flex flex-col gap-2">
                <label hlmLabel for="frameworks">{{ 'projects.frameworks' | transloco }}</label>
                <input
                  hlmInput
                  id="frameworks"
                  formControlName="frameworks"
                  placeholder="Angular, Spring"
                />
              </div>
              <div class="flex flex-col gap-2">
                <label hlmLabel for="clientPlatforms">{{
                  'projects.clientPlatforms' | transloco
                }}</label>
                <input
                  hlmInput
                  id="clientPlatforms"
                  formControlName="clientPlatforms"
                  placeholder="Web"
                />
              </div>
              <div class="flex flex-col gap-2">
                <label hlmLabel for="databases">{{ 'projects.databases' | transloco }}</label>
                <input
                  hlmInput
                  id="databases"
                  formControlName="databases"
                  placeholder="PostgreSQL"
                />
              </div>
              <div class="flex flex-col gap-2">
                <label hlmLabel for="architecture">{{ 'projects.architecture' | transloco }}</label>
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

              @if (errorMessage()) {
                <p class="text-sm text-destructive md:col-span-2" data-testid="form-error">
                  {{ errorMessage() }}
                </p>
              }

              <button
                hlmBtn
                type="submit"
                [disabled]="form.invalid || loading()"
                class="md:col-span-2"
              >
                @if (loading()) {
                  <hlm-spinner class="h-4 w-4" />
                }
                {{ 'projects.createCta' | transloco }}
              </button>
            </form>
          </div>
        </div>
      }

      @switch (store.projectsState()) {
        @case ('loading') {
          <div class="flex justify-center py-10"><hlm-spinner class="h-6 w-6" /></div>
        }
        @case ('error') {
          <p class="text-sm text-destructive">{{ 'projects.loadError' | transloco }}</p>
        }
        @default {
          @if (store.projects().length === 0 && !showForm()) {
            <div
              hlmCard
              class="flex flex-col items-center gap-3 py-16 text-center"
              data-testid="projects-empty"
            >
              <span class="grid h-12 w-12 place-items-center rounded-xl bg-primary/10 text-primary">
                <hlm-icon name="lucideFolder" size="22px" />
              </span>
              <div>
                <p class="font-medium">{{ 'projects.emptyTitle' | transloco }}</p>
                <p class="text-sm text-muted-foreground">{{ 'projects.emptyBody' | transloco }}</p>
              </div>
              <button hlmBtn size="sm" type="button" (click)="showForm.set(true)">
                {{ 'projects.createCta' | transloco }}
              </button>
            </div>
          } @else {
            <ul class="grid gap-3 sm:grid-cols-2">
              @for (project of store.projects(); track project.id) {
                <li>
                  <a
                    hlmCard
                    [routerLink]="['/projects', project.id, 'sessions']"
                    class="group flex items-center gap-4 p-4 transition-colors hover:border-primary/40 hover:bg-accent/40"
                    data-testid="project-row"
                  >
                    <span
                      class="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"
                    >
                      <hlm-icon name="lucideFolder" size="18px" />
                    </span>
                    <span class="min-w-0 flex-1">
                      <span class="block truncate font-medium">{{ project.name }}</span>
                      <span class="block truncate text-sm text-muted-foreground">
                        {{ project.architecture }} · {{ project.domain }}
                      </span>
                    </span>
                    <hlm-icon
                      name="lucideChevronRight"
                      size="18px"
                      class="text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground"
                    />
                  </a>
                </li>
              }
            </ul>
          }
        }
      }
    </div>
  `,
})
export class Projects {
  private readonly fb = inject(FormBuilder);
  private readonly authStore = inject(AuthStore);
  private readonly transloco = inject(TranslocoService);
  protected readonly store = inject(WorkspaceStore);

  protected readonly showForm = signal(false);
  protected readonly loading = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required]],
    description: [''],
    programmingLanguages: ['', [Validators.required]],
    frameworks: ['', [Validators.required]],
    clientPlatforms: ['', [Validators.required]],
    databases: ['', [Validators.required]],
    architecture: ['', [Validators.required]],
    domain: ['', [Validators.required]],
  });

  constructor() {
    // Load projects whenever the active organization becomes available.
    effect(() => {
      const orgId = this.authStore.organizationId();
      if (orgId) this.store.loadProjects(orgId);
    });
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
        programmingLanguages: toList(raw.programmingLanguages),
        frameworks: toList(raw.frameworks),
        clientPlatforms: toList(raw.clientPlatforms),
        databases: toList(raw.databases),
        architecture: raw.architecture,
        domain: raw.domain,
      })
      .subscribe({
        next: () => {
          this.loading.set(false);
          this.showForm.set(false);
          this.form.reset();
        },
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
