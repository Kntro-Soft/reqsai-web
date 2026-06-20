import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
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
  selector: 'app-forgot-password',
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
        <h1 hlmCardTitle>Recupera tu contraseña</h1>
        <p hlmCardDescription>Te enviaremos un enlace para restablecerla</p>
      </div>
      <div hlmCardContent>
        @if (sent()) {
          <p class="text-sm text-emerald-600 dark:text-emerald-400" data-testid="forgot-sent">
            Si existe una cuenta con ese correo, te enviamos instrucciones para restablecer tu
            contraseña.
          </p>
          <a
            routerLink="/auth/sign-in"
            class="mt-6 block text-center text-sm text-primary font-medium hover:underline"
          >
            Volver a iniciar sesión
          </a>
        } @else {
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

            <button hlmBtn type="submit" [disabled]="form.invalid || loading()" class="mt-2">
              @if (loading()) {
                <hlm-spinner class="h-4 w-4" />
              }
              Enviar enlace
            </button>
          </form>

          <a
            routerLink="/auth/sign-in"
            class="mt-6 block text-center text-sm text-primary font-medium hover:underline"
          >
            Volver a iniciar sesión
          </a>
        }
      </div>
    </div>
  `,
})
export class ForgotPassword {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);

  protected readonly loading = signal(false);
  protected readonly sent = signal(false);

  protected readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
  });

  protected submit(): void {
    if (this.form.invalid || this.loading()) return;
    this.loading.set(true);
    // The endpoint never reveals whether the email exists, so the UI confirms
    // unconditionally on both success and error.
    this.auth.forgotPassword(this.form.getRawValue()).subscribe({
      next: () => this.sent.set(true),
      error: () => this.sent.set(true),
    });
  }
}
