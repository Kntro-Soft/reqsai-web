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
      <div class="flex items-center justify-between">
        <h1 class="text-2xl font-semibold tracking-tight">Sesiones de descubrimiento</h1>
        <button
          hlmBtn
          variant="outline"
          size="sm"
          type="button"
          (click)="showForm.set(!showForm())"
        >
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
          @if (store.sessions().length === 0) {
            <p class="text-muted-foreground" data-testid="sessions-empty">
              Aún no hay sesiones. Crea la primera.
            </p>
          } @else {
            <ul class="flex flex-col gap-3">
              @for (session of store.sessions(); track session.id) {
                <li hlmCard class="flex items-center justify-between p-4" data-testid="session-row">
                  <a [routerLink]="[session.id]" class="font-medium hover:underline">
                    {{ session.title }}
                  </a>
                  <span hlmBadge [variant]="statusVariant(session.status)">{{
                    statusLabel(session.status)
                  }}</span>
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
