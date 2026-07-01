import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
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
        <h1 hlmCardTitle>{{ 'auth.signUp.title' | transloco }}</h1>
        <p hlmCardDescription>{{ 'auth.signUp.subtitle' | transloco }}</p>
      </div>
      <div hlmCardContent>
        <form [formGroup]="form" (ngSubmit)="submit()" class="flex flex-col gap-4">
          <div class="grid grid-cols-2 gap-3">
            <div class="flex flex-col gap-2">
              <label hlmLabel for="firstName">{{ 'auth.fields.firstName' | transloco }}</label>
              <input
                hlmInput
                id="firstName"
                formControlName="firstName"
                autocomplete="given-name"
              />
            </div>
            <div class="flex flex-col gap-2">
              <label hlmLabel for="lastName">{{ 'auth.fields.lastName' | transloco }}</label>
              <input hlmInput id="lastName" formControlName="lastName" autocomplete="family-name" />
            </div>
          </div>

          <div class="flex flex-col gap-2">
            <label hlmLabel for="email">{{ 'auth.fields.email' | transloco }}</label>
            <input
              hlmInput
              id="email"
              type="email"
              formControlName="email"
              placeholder="you@company.com"
              autocomplete="email"
            />
          </div>

          <div class="flex flex-col gap-2">
            <label hlmLabel for="password">{{ 'auth.fields.password' | transloco }}</label>
            <input
              hlmInput
              id="password"
              type="password"
              formControlName="password"
              [placeholder]="'auth.signUp.passwordPlaceholder' | transloco"
              autocomplete="new-password"
            />
            @if (form.controls.password.touched && form.controls.password.errors?.['minlength']) {
              <p class="text-xs text-muted-foreground">
                {{ 'auth.signUp.passwordHint' | transloco }}
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
            {{ 'auth.signUp.submit' | transloco }}
          </button>
        </form>

        <p class="mt-6 text-center text-sm text-muted-foreground">
          {{ 'auth.signUp.haveAccount' | transloco }}
          <a routerLink="/auth/sign-in" class="text-primary font-medium hover:underline">
            {{ 'auth.signUp.signIn' | transloco }}
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
  private readonly route = inject(ActivatedRoute);
  private readonly transloco = inject(TranslocoService);

  protected readonly loading = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly form = this.fb.nonNullable.group({
    firstName: ['', [Validators.required]],
    lastName: ['', [Validators.required]],
    // Prefilled from an invite's `email` query param when present (see the accept page).
    email: [this.route.snapshot.queryParamMap.get('email') ?? '', [Validators.required, Validators.email]],
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
          this.transloco.translate(
            err.status === 409 ? 'auth.errors.emailExists' : 'auth.errors.signUpGeneric',
          ),
        );
      },
    });
  }
}
