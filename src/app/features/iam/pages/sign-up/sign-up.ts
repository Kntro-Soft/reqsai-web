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
  selector: 'app-sign-up',
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
        <h1 hlmCardTitle>Crear cuenta</h1>
        <p hlmCardDescription>Empieza a descubrir requisitos con IA</p>
      </div>
      <div hlmCardContent>
        <form [formGroup]="form" (ngSubmit)="submit()" class="flex flex-col gap-4">
          <div class="grid grid-cols-2 gap-3">
            <div class="flex flex-col gap-2">
              <label hlmLabel for="firstName">Nombre</label>
              <input
                hlmInput
                id="firstName"
                formControlName="firstName"
                autocomplete="given-name"
              />
            </div>
            <div class="flex flex-col gap-2">
              <label hlmLabel for="lastName">Apellido</label>
              <input hlmInput id="lastName" formControlName="lastName" autocomplete="family-name" />
            </div>
          </div>

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
              placeholder="Mínimo 8 caracteres"
              autocomplete="new-password"
            />
            @if (form.controls.password.touched && form.controls.password.errors?.['minlength']) {
              <p class="text-xs text-muted-foreground">
                La contraseña debe tener al menos 8 caracteres.
              </p>
            }
          </div>

          @if (errorMessage()) {
            <p class="text-sm text-destructive" data-testid="form-error">{{ errorMessage() }}</p>
          }

          <button hlmBtn type="submit" [disabled]="form.invalid || loading()" class="mt-2">
            @if (loading()) {
              <hlm-spinner class="h-4 w-4" />
            }
            Crear cuenta
          </button>
        </form>

        <p class="mt-6 text-center text-sm text-muted-foreground">
          ¿Ya tienes cuenta?
          <a routerLink="/auth/sign-in" class="text-primary font-medium hover:underline">
            Iniciar sesión
          </a>
        </p>
      </div>
    </div>
  `,
})
export class SignUp {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly loading = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly form = this.fb.nonNullable.group({
    firstName: ['', [Validators.required]],
    lastName: ['', [Validators.required]],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]],
  });

  protected submit(): void {
    if (this.form.invalid || this.loading()) return;
    this.loading.set(true);
    this.errorMessage.set(null);

    const { email } = this.form.getRawValue();
    this.auth.register(this.form.getRawValue()).subscribe({
      // Account created (PENDING_VERIFICATION) — send the user to check their inbox.
      next: () => void this.router.navigate(['/auth/verify-email'], { queryParams: { email } }),
      error: (err: HttpErrorResponse) => {
        this.loading.set(false);
        this.errorMessage.set(
          err.status === 409
            ? 'Ya existe una cuenta con ese correo.'
            : 'No se pudo crear la cuenta. Intenta de nuevo.',
        );
      },
    });
  }
}
