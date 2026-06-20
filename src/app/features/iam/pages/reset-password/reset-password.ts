import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
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
  selector: 'app-reset-password',
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
        <h1 hlmCardTitle>Nueva contraseña</h1>
        <p hlmCardDescription>Elige una contraseña para tu cuenta</p>
      </div>
      <div hlmCardContent>
        @if (!token()) {
          <p class="text-sm text-destructive" data-testid="form-error">
            El enlace de restablecimiento es inválido. Solicita uno nuevo.
          </p>
          <a
            routerLink="/auth/forgot-password"
            class="mt-6 block text-center text-sm text-primary font-medium hover:underline"
          >
            Solicitar enlace
          </a>
        } @else if (success()) {
          <p class="text-sm text-emerald-600 dark:text-emerald-400" data-testid="reset-success">
            Tu contraseña se actualizó. Ya puedes iniciar sesión.
          </p>
          <a hlmBtn routerLink="/auth/sign-in" class="mt-4 w-full">Ir a iniciar sesión</a>
        } @else {
          <form [formGroup]="form" (ngSubmit)="submit()" class="flex flex-col gap-4">
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
            </div>
            <div class="flex flex-col gap-2">
              <label hlmLabel for="confirm">Repite la contraseña</label>
              <input
                hlmInput
                id="confirm"
                type="password"
                formControlName="confirm"
                autocomplete="new-password"
              />
            </div>

            @if (errorMessage()) {
              <p class="text-sm text-destructive" data-testid="form-error">{{ errorMessage() }}</p>
            }

            <button hlmBtn type="submit" [disabled]="form.invalid || loading()" class="mt-2">
              @if (loading()) {
                <hlm-spinner class="h-4 w-4" />
              }
              Guardar contraseña
            </button>
          </form>
        }
      </div>
    </div>
  `,
})
export class ResetPassword {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);

  /** Bound from the `?token=` of the reset link via withComponentInputBinding(). */
  readonly token = input<string>('');

  protected readonly loading = signal(false);
  protected readonly success = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly form = this.fb.nonNullable.group({
    password: ['', [Validators.required, Validators.minLength(8)]],
    confirm: ['', [Validators.required]],
  });

  protected submit(): void {
    if (this.form.invalid || this.loading()) return;
    const { password, confirm } = this.form.getRawValue();
    if (password !== confirm) {
      this.errorMessage.set('Las contraseñas no coinciden.');
      return;
    }
    this.loading.set(true);
    this.errorMessage.set(null);

    this.auth.resetPassword({ token: this.token(), newPassword: password }).subscribe({
      next: () => this.success.set(true),
      error: (err: HttpErrorResponse) => {
        this.loading.set(false);
        this.errorMessage.set(
          err.status === 400 || err.status === 401
            ? 'El enlace es inválido o expiró. Solicita uno nuevo.'
            : 'No se pudo actualizar la contraseña. Intenta de nuevo.',
        );
      },
    });
  }
}
