import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { AuthStore } from '../../../../core/auth/auth.store';
import { WorkspaceStore } from '../../data/workspace.store';
import {
  HlmButton,
  HlmCard,
  HlmCardContent,
  HlmCardDescription,
  HlmCardHeader,
  HlmCardTitle,
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
  ],
  template: `
    <div class="flex flex-col gap-6">
      <div class="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 class="text-2xl font-bold tracking-tight">Proyectos</h1>
          <p class="text-sm text-muted-foreground">
            Gestiona los proyectos de tu organización y sus sesiones de descubrimiento.
          </p>
        </div>
        <button hlmBtn type="button" (click)="showForm.set(!showForm())">
          {{ showForm() ? 'Cancelar' : 'Nuevo proyecto' }}
        </button>
      </div>

      @if (showForm()) {
        <div hlmCard>
          <div hlmCardHeader>
            <h2 hlmCardTitle>Nuevo proyecto</h2>
            <p hlmCardDescription>Define el stack para afinar las sugerencias de la IA.</p>
          </div>
          <div hlmCardContent>
            <form [formGroup]="form" (ngSubmit)="submit()" class="grid gap-4 md:grid-cols-2">
              <div class="flex flex-col gap-2 md:col-span-2">
                <label hlmLabel for="name">Nombre</label>
                <input hlmInput id="name" formControlName="name" placeholder="Mobile App" />
              </div>
              <div class="flex flex-col gap-2 md:col-span-2">
                <label hlmLabel for="description">Descripción</label>
                <input hlmInput id="description" formControlName="description" />
              </div>
              <div class="flex flex-col gap-2">
                <label hlmLabel for="programmingLanguages">Lenguajes (coma)</label>
                <input
                  hlmInput
                  id="programmingLanguages"
                  formControlName="programmingLanguages"
                  placeholder="TypeScript, Java"
                />
              </div>
              <div class="flex flex-col gap-2">
                <label hlmLabel for="frameworks">Frameworks (coma)</label>
                <input
                  hlmInput
                  id="frameworks"
                  formControlName="frameworks"
                  placeholder="Angular, Spring"
                />
              </div>
              <div class="flex flex-col gap-2">
                <label hlmLabel for="clientPlatforms">Plataformas (coma)</label>
                <input
                  hlmInput
                  id="clientPlatforms"
                  formControlName="clientPlatforms"
                  placeholder="Web"
                />
              </div>
              <div class="flex flex-col gap-2">
                <label hlmLabel for="databases">Bases de datos (coma)</label>
                <input
                  hlmInput
                  id="databases"
                  formControlName="databases"
                  placeholder="PostgreSQL"
                />
              </div>
              <div class="flex flex-col gap-2">
                <label hlmLabel for="architecture">Arquitectura</label>
                <input
                  hlmInput
                  id="architecture"
                  formControlName="architecture"
                  placeholder="Hexagonal"
                />
              </div>
              <div class="flex flex-col gap-2">
                <label hlmLabel for="domain">Dominio</label>
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
                Crear proyecto
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
          <p class="text-sm text-destructive">No se pudieron cargar los proyectos.</p>
        }
        @default {
          @if (store.projects().length === 0 && !showForm()) {
            <div
              hlmCard
              class="flex flex-col items-center gap-3 py-16 text-center"
              data-testid="projects-empty"
            >
              <span class="grid h-12 w-12 place-items-center rounded-xl bg-primary/10 text-primary">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <path
                    d="M4 7V5a2 2 0 0 1 2-2h3l2 2h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z"
                  />
                </svg>
              </span>
              <div>
                <p class="font-medium">Aún no hay proyectos</p>
                <p class="text-sm text-muted-foreground">
                  Crea tu primer proyecto para empezar a descubrir requisitos.
                </p>
              </div>
              <button hlmBtn size="sm" type="button" (click)="showForm.set(true)">
                Crear proyecto
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
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                      >
                        <path
                          d="M4 7V5a2 2 0 0 1 2-2h3l2 2h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z"
                        />
                      </svg>
                    </span>
                    <span class="min-w-0 flex-1">
                      <span class="block truncate font-medium">{{ project.name }}</span>
                      <span class="block truncate text-sm text-muted-foreground">
                        {{ project.architecture }} · {{ project.domain }}
                      </span>
                    </span>
                    <svg
                      class="text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground"
                      xmlns="http://www.w3.org/2000/svg"
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    >
                      <path d="m9 18 6-6-6-6" />
                    </svg>
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
            err.status === 400
              ? 'Revisa los datos: el nombre podría estar repetido.'
              : 'No se pudo crear el proyecto. Intenta de nuevo.',
          );
        },
      });
  }
}
