import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
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
  selector: 'app-sign-in',
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
        <h1 hlmCardTitle>{{ 'auth.signIn.title' | transloco }}</h1>
        <p hlmCardDescription>{{ 'auth.signIn.subtitle' | transloco }}</p>
      </div>
      <div hlmCardContent>
        <form [formGroup]="form" (ngSubmit)="submit()" class="flex flex-col gap-4">
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
            {{ 'auth.signIn.submit' | transloco }}
          </button>
        </form>

        <p class="mt-4 text-center text-sm">
          <a routerLink="/auth/forgot-password" class="text-muted-foreground hover:underline">
            {{ 'auth.signIn.forgot' | transloco }}
          </a>
        </p>

        <p class="mt-6 text-center text-sm text-muted-foreground">
          {{ 'auth.signIn.noAccount' | transloco }}
          <a routerLink="/auth/sign-up" class="text-primary font-medium hover:underline">
            {{ 'auth.signIn.signUp' | transloco }}
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
  private readonly route = inject(ActivatedRoute);
  private readonly transloco = inject(TranslocoService);

  /** Where to land after login: an internal `redirect` param (e.g. an invite) or the dispatcher. */
  private readonly redirectTo = this.route.snapshot.queryParamMap.get('redirect');

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
      // Honor an internal return URL (e.g. an invite); otherwise the launch
      // dispatcher routes by organization count.
      next: () => void this.router.navigateByUrl(this.safeRedirect() ?? '/launch'),
      error: (err: HttpErrorResponse) => {
        this.loading.set(false);
        this.errorMessage.set(this.messageFor(err));
      },
    });
  }

  /** Only allow same-app relative redirects (`/...`, not `//host`) — no open redirects. */
  private safeRedirect(): string | null {
    const r = this.redirectTo;
    return r && r.startsWith('/') && !r.startsWith('//') ? r : null;
  }

  private messageFor(err: HttpErrorResponse): string {
    // Bespoke copy kept for the two expected auth outcomes: "invalid credentials"
    // and "unverified" read better here than the generic per-code/status message.
    if (err.status === 401) return this.transloco.translate('auth.errors.invalidCredentials');
    // Backend returns 403 ACCOUNT_NOT_ACTIVE when the email is unverified.
    if (err.status === 403) return this.transloco.translate('auth.errors.unverified');
    return messageForError(err, this.transloco);
  }
}
