import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { AuthService } from '../../../../core/auth/auth.service';
import { messageForError } from '../../../../core/errors/error-message';
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
    TranslocoPipe,
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
        <h1 hlmCardTitle>{{ 'auth.reset.title' | transloco }}</h1>
        <p hlmCardDescription>{{ 'auth.reset.subtitle' | transloco }}</p>
      </div>
      <div hlmCardContent>
        @if (!token()) {
          <p class="text-sm text-destructive" data-testid="form-error">
            {{ 'auth.reset.invalidLink' | transloco }}
          </p>
          <a
            routerLink="/auth/forgot-password"
            class="mt-6 block text-center text-sm text-primary font-medium hover:underline"
          >
            {{ 'auth.reset.requestLink' | transloco }}
          </a>
        } @else if (success()) {
          <p class="text-sm text-emerald-600 dark:text-emerald-400" data-testid="reset-success">
            {{ 'auth.reset.success' | transloco }}
          </p>
          <a hlmBtn routerLink="/auth/sign-in" class="mt-4 w-full">
            {{ 'auth.reset.goToSignIn' | transloco }}
          </a>
        } @else {
          <form [formGroup]="form" (ngSubmit)="submit()" class="flex flex-col gap-4">
            <div class="flex flex-col gap-2">
              <label hlmLabel for="password">{{ 'auth.fields.password' | transloco }}</label>
              <input
                hlmInput
                id="password"
                type="password"
                formControlName="password"
                [placeholder]="'auth.reset.passwordPlaceholder' | transloco"
                autocomplete="new-password"
              />
            </div>
            <div class="flex flex-col gap-2">
              <label hlmLabel for="confirm">{{ 'auth.reset.confirm' | transloco }}</label>
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
              {{ 'auth.reset.submit' | transloco }}
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
  private readonly transloco = inject(TranslocoService);

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
      this.errorMessage.set(this.transloco.translate('auth.errors.passwordMismatch'));
      return;
    }
    this.loading.set(true);
    this.errorMessage.set(null);

    this.auth.resetPassword({ token: this.token(), newPassword: password }).subscribe({
      next: () => this.success.set(true),
      error: (err: HttpErrorResponse) => {
        this.loading.set(false);
        // A 400/401 means the reset link is invalid/expired — a bespoke "request a
        // new link" message is clearer than the generic code copy.
        this.errorMessage.set(
          err.status === 400 || err.status === 401
            ? this.transloco.translate('auth.errors.resetLinkInvalid')
            : messageForError(err, this.transloco),
        );
      },
    });
  }
}
