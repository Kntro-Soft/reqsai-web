import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { AuthService } from '../../../../core/auth/auth.service';
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

@Component({
  selector: 'app-sign-in',
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
    <div hlmCard>
      <div hlmCardHeader>
        <h1 hlmCardTitle>Iniciar sesión</h1>
        <p hlmCardDescription>Accede a tu espacio de trabajo de Reqs-AI</p>
      </div>
      <div hlmCardContent>
        <form [formGroup]="form" (ngSubmit)="submit()" class="flex flex-col gap-4">
          <div class="flex flex-col gap-2">
            <label hlmLabel for="email">Correo electrónico</label>
            <input
              hlmInput
              id="email"
              type="email"
              formControlName="email"
              placeholder="tu@empresa.com"
              autocomplete="email"
            />
          </div>

          <div class="flex flex-col gap-2">
            <label hlmLabel for="password">Contraseña</label>
            <input
              hlmInput
              id="password"
              type="password"
              formControlName="password"
              placeholder="••••••••"
              autocomplete="current-password"
            />
          </div>

          @if (errorMessage()) {
            <p class="text-sm text-destructive" data-testid="form-error">{{ errorMessage() }}</p>
          }

          <button hlmBtn type="submit" [disabled]="form.invalid || loading()" class="mt-2">
            @if (loading()) {
              <hlm-spinner class="h-4 w-4" />
            }
            Entrar
          </button>
        </form>

        <p class="mt-4 text-center text-sm">
          <a routerLink="/auth/forgot-password" class="text-muted-foreground hover:underline">
            ¿Olvidaste tu contraseña?
          </a>
        </p>

        <p class="mt-6 text-center text-sm text-muted-foreground">
          ¿No tienes cuenta?
          <a routerLink="/auth/sign-up" class="text-primary font-medium hover:underline">
            Crear cuenta
          </a>
        </p>
      </div>
    </div>
  `,
})
export class SignIn {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly loading = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]],
  });

  protected submit(): void {
    if (this.form.invalid || this.loading()) return;
    this.loading.set(true);
    this.errorMessage.set(null);

    this.auth.login(this.form.getRawValue()).subscribe({
      next: () => void this.router.navigate(['/home']),
      error: (err: HttpErrorResponse) => {
        this.loading.set(false);
        this.errorMessage.set(this.messageFor(err));
      },
    });
  }

  private messageFor(err: HttpErrorResponse): string {
    if (err.status === 401) return 'Correo o contraseña incorrectos.';
    // Backend returns 403 ACCOUNT_NOT_ACTIVE when the email is unverified.
    if (err.status === 403) return 'Verifica tu correo antes de iniciar sesión.';
    return 'No se pudo iniciar sesión. Intenta de nuevo.';
  }
}
