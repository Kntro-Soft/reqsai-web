import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { AuthStore } from '../../../../core/auth/auth.store';
import { WorkspaceStore } from '../../data/workspace.store';
import {
  HlmButton,
  HlmCard,
  HlmCardContent,
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
    HlmButton,
    HlmCard,
    HlmCardHeader,
    HlmCardTitle,
    HlmCardContent,
    HlmInput,
    HlmLabel,
    HlmSpinner,
  ],
  template: `
    <div class="flex flex-col gap-6">
      <div class="flex items-center justify-between">
        <h1 class="text-2xl font-semibold tracking-tight">Proyectos</h1>
        <button
          hlmBtn
          variant="outline"
          size="sm"
          type="button"
          (click)="showForm.set(!showForm())"
        >
          {{ showForm() ? 'Cancelar' : 'Nuevo proyecto' }}
        </button>
      </div>

      @if (showForm()) {
        <div hlmCard>
          <div hlmCardHeader><h2 hlmCardTitle>Nuevo proyecto</h2></div>
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
          @if (store.projects().length === 0) {
            <p class="text-muted-foreground" data-testid="projects-empty">
              Aún no hay proyectos. Crea el primero.
            </p>
          } @else {
            <ul class="grid gap-3 sm:grid-cols-2">
              @for (project of store.projects(); track project.id) {
                <li hlmCard class="p-4" data-testid="project-row">
                  <p class="font-medium">{{ project.name }}</p>
                  <p class="text-sm text-muted-foreground">
                    {{ project.architecture }} · {{ project.domain }}
                  </p>
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
