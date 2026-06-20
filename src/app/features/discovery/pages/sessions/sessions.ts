import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { DiscoveryStore } from '../../data/discovery.store';
import { statusLabel, statusVariant } from '../../data/session-ui';
import {
  HlmBadge,
  HlmButton,
  HlmCard,
  HlmCardContent,
  HlmCardHeader,
  HlmCardTitle,
  HlmInput,
  HlmLabel,
  HlmSpinner,
} from '../../../../shared/ui';

@Component({
  selector: 'app-sessions',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    HlmBadge,
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
      <div class="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 class="text-2xl font-bold tracking-tight">Sesiones de descubrimiento</h1>
          <p class="text-sm text-muted-foreground">
            Captura reuniones y genera historias de usuario con IA en tiempo real.
          </p>
        </div>
        <button hlmBtn type="button" (click)="showForm.set(!showForm())">
          {{ showForm() ? 'Cancelar' : 'Nueva sesión' }}
        </button>
      </div>

      @if (showForm()) {
        <div hlmCard>
          <div hlmCardHeader><h2 hlmCardTitle>Nueva sesión</h2></div>
          <div hlmCardContent>
            <form
              [formGroup]="form"
              (ngSubmit)="submit()"
              class="flex flex-col gap-4 sm:flex-row sm:items-end"
            >
              <div class="flex flex-1 flex-col gap-2">
                <label hlmLabel for="title">Título</label>
                <input
                  hlmInput
                  id="title"
                  formControlName="title"
                  placeholder="Sprint 24 — Elicitación"
                />
              </div>
              <div class="flex flex-col gap-2">
                <label hlmLabel for="language">Idioma</label>
                <input hlmInput id="language" formControlName="language" placeholder="es-PE" />
              </div>
              <button hlmBtn type="submit" [disabled]="form.invalid || loading()">
                @if (loading()) {
                  <hlm-spinner class="h-4 w-4" />
                }
                Crear
              </button>
            </form>
            @if (errorMessage()) {
              <p class="mt-2 text-sm text-destructive" data-testid="form-error">
                {{ errorMessage() }}
              </p>
            }
          </div>
        </div>
      }

      @switch (store.sessionsState()) {
        @case ('loading') {
          <div class="flex justify-center py-10"><hlm-spinner class="h-6 w-6" /></div>
        }
        @case ('error') {
          <p class="text-sm text-destructive">No se pudieron cargar las sesiones.</p>
        }
        @default {
          @if (store.sessions().length === 0 && !showForm()) {
            <div
              hlmCard
              class="flex flex-col items-center gap-3 py-16 text-center"
              data-testid="sessions-empty"
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
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3Z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4" />
                </svg>
              </span>
              <div>
                <p class="font-medium">Aún no hay sesiones</p>
                <p class="text-sm text-muted-foreground">
                  Crea una sesión para empezar a capturar requisitos.
                </p>
              </div>
              <button hlmBtn size="sm" type="button" (click)="showForm.set(true)">
                Crear sesión
              </button>
            </div>
          } @else {
            <ul class="flex flex-col gap-3">
              @for (session of store.sessions(); track session.id) {
                <li>
                  <a
                    hlmCard
                    [routerLink]="[session.id]"
                    class="group flex items-center gap-4 p-4 transition-colors hover:border-primary/40 hover:bg-accent/40"
                    data-testid="session-row"
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
                        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3Z" />
                        <path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4" />
                      </svg>
                    </span>
                    <span class="min-w-0 flex-1">
                      <span class="block truncate font-medium">{{ session.title }}</span>
                      <span class="block truncate text-sm text-muted-foreground">{{
                        session.language
                      }}</span>
                    </span>
                    <span hlmBadge [variant]="statusVariant(session.status)">
                      {{ statusLabel(session.status) }}
                    </span>
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
export class Sessions {
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  protected readonly store = inject(DiscoveryStore);

  readonly projectId = input.required<string>();
  protected readonly statusVariant = statusVariant;
  protected readonly statusLabel = statusLabel;

  protected readonly showForm = signal(false);
  protected readonly loading = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly form = this.fb.nonNullable.group({
    title: ['', [Validators.required, Validators.maxLength(200)]],
    language: ['es-PE', [Validators.required, Validators.maxLength(8)]],
  });

  constructor() {
    effect(() => this.store.loadSessions(this.projectId()));
  }

  protected submit(): void {
    if (this.form.invalid || this.loading()) return;
    this.loading.set(true);
    this.errorMessage.set(null);
    this.store.createSession(this.projectId(), this.form.getRawValue()).subscribe({
      next: (session) =>
        void this.router.navigate(['/projects', this.projectId(), 'sessions', session.id]),
      error: (err: HttpErrorResponse) => {
        this.loading.set(false);
        this.errorMessage.set(
          err.status === 400
            ? 'Revisa los datos de la sesión.'
            : 'No se pudo crear la sesión. Intenta de nuevo.',
        );
      },
    });
  }
}
