import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { AuthService } from '../../../../core/auth/auth.service';
import { CURRENT_TERMS_VERSION } from '../../../../core/auth/terms';
import { ThemeToggle } from '../../../../shared/components/theme-toggle/theme-toggle';
import { Logo } from '../../../../shared/components/logo/logo';
import { HlmButton, HlmCard, HlmCardContent, HlmSpinner } from '../../../../shared/ui';

/**
 * Terms-of-service gate shown to authenticated users who have not accepted the
 * current version (see termsGuard). Accepting records it and rotates the token.
 */
@Component({
  selector: 'app-terms',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ThemeToggle, Logo, HlmButton, HlmCard, HlmCardContent, HlmSpinner],
  template: `
    <div class="flex min-h-dvh flex-col bg-background text-foreground">
      <header
        class="sticky top-0 z-10 mx-3 mt-3 flex h-14 items-center justify-between gap-3 rounded-2xl border border-border bg-card/80 px-4 shadow-sm backdrop-blur md:mx-4 md:mt-4"
      >
        <app-logo [size]="28" />
        <div class="flex items-center gap-2">
          <app-theme-toggle />
          <button
            type="button"
            (click)="signOut()"
            class="text-sm text-muted-foreground hover:text-foreground"
          >
            Cerrar sesión
          </button>
        </div>
      </header>

      <main class="flex flex-1 items-center justify-center px-4 py-8">
        <div class="flex w-full max-w-2xl flex-col gap-6">
          <div class="flex flex-col items-center gap-3 text-center">
            <span class="grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="26"
                height="26"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
                <path d="M14 2v6h6M9 13h6M9 17h6" />
              </svg>
            </span>
            <div>
              <h1 class="text-2xl font-bold tracking-tight">Términos y Condiciones</h1>
              <p class="mt-1 text-sm text-muted-foreground">
                Para continuar, revisa y acepta nuestros términos de servicio.
              </p>
            </div>
          </div>

          <div hlmCard>
            <div hlmCardContent class="flex flex-col gap-4 pt-6">
              <div
                class="max-h-72 overflow-y-auto rounded-lg border border-border bg-secondary/30 p-4 text-sm leading-relaxed text-muted-foreground"
              >
                <p class="mb-3">
                  Al usar Reqs-AI aceptas estos términos. La plataforma procesa transcripciones de
                  reuniones y genera artefactos de requisitos asistidos por IA; eres responsable del
                  contenido que subes y de contar con los permisos necesarios.
                </p>
                <p class="mb-3">
                  <span class="font-medium text-foreground">Privacidad de datos.</span>
                  Tu información se aísla por organización (tenant) y no se comparte con terceros
                  sin tu consentimiento. Puedes solicitar la eliminación de tus datos en cualquier
                  momento.
                </p>
                <p class="mb-3">
                  <span class="font-medium text-foreground">Uso aceptable.</span>
                  No debes usar el servicio para fines ilegales ni cargar información que infrinja
                  derechos de terceros. El contenido generado por IA es una sugerencia y debe
                  revisarse antes de usarse.
                </p>
                <p>
                  <span class="font-medium text-foreground">Disponibilidad.</span>
                  Hacemos esfuerzos razonables por mantener el servicio disponible, pero se ofrece
                  «tal cual». Estos términos pueden actualizarse; te pediremos aceptarlos de nuevo
                  cuando cambien.
                </p>
              </div>

              <label class="flex items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  data-testid="accept-checkbox"
                  class="mt-0.5 h-4 w-4 accent-[var(--primary)]"
                  [checked]="accepted()"
                  (change)="onToggle($event)"
                />
                <span>
                  He leído y acepto los Términos y Condiciones y la Política de Privacidad de
                  Reqs-AI.
                </span>
              </label>

              @if (errorMessage()) {
                <p class="text-sm text-destructive" data-testid="form-error">
                  {{ errorMessage() }}
                </p>
              }

              <button
                hlmBtn
                type="button"
                data-testid="accept-terms"
                [disabled]="!accepted() || loading()"
                (click)="accept()"
              >
                @if (loading()) {
                  <hlm-spinner class="h-4 w-4" />
                }
                Aceptar y continuar
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  `,
})
export class Terms {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly accepted = signal(false);
  protected readonly loading = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  protected onToggle(event: Event): void {
    this.accepted.set((event.target as HTMLInputElement).checked);
  }

  protected accept(): void {
    if (!this.accepted() || this.loading()) return;
    this.loading.set(true);
    this.errorMessage.set(null);
    this.auth.acceptTerms(CURRENT_TERMS_VERSION).subscribe({
      next: () => void this.router.navigate(['/']),
      error: (err: HttpErrorResponse) => {
        this.loading.set(false);
        this.errorMessage.set(
          err.status === 401
            ? 'Tu sesión expiró. Inicia sesión de nuevo.'
            : 'No se pudo registrar la aceptación. Intenta de nuevo.',
        );
      },
    });
  }

  protected signOut(): void {
    this.auth.logout();
  }
}
