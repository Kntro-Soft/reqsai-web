import { ChangeDetectionStrategy, Component, OnInit, inject, input, signal } from '@angular/core';
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
  HlmSpinner,
} from '../../../../shared/ui';

type VerifyState = 'idle' | 'verifying' | 'success' | 'error';

/**
 * Email verification reached two ways:
 *  - From the email link `/auth/verify-email?token=…` → auto-verifies the token.
 *  - Right after sign-up `/auth/verify-email?email=…` (no token) → shows the
 *    "check your inbox" message with a resend action.
 */
@Component({
  selector: 'app-verify-email',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    TranslocoPipe,
    HlmButton,
    HlmCard,
    HlmCardHeader,
    HlmCardTitle,
    HlmCardDescription,
    HlmCardContent,
    HlmSpinner,
  ],
  template: `
    <div hlmCard>
      <div hlmCardHeader>
        <h1 hlmCardTitle>{{ 'auth.verify.title' | transloco }}</h1>
        <p hlmCardDescription>
          @switch (state()) {
            @case ('verifying') {
              {{ 'auth.verify.verifying' | transloco }}
            }
            @case ('success') {
              {{ 'auth.verify.successDesc' | transloco }}
            }
            @default {
              {{ 'auth.verify.sentTo' | transloco }}
              <span class="font-medium text-foreground">{{
                email() || ('auth.verify.yourEmail' | transloco)
              }}</span>
            }
          }
        </p>
      </div>

      <div hlmCardContent class="flex flex-col gap-4">
        @switch (state()) {
          @case ('verifying') {
            <div class="flex items-center justify-center py-4">
              <hlm-spinner class="h-6 w-6" />
            </div>
          }
          @case ('success') {
            <p class="text-sm text-emerald-600 dark:text-emerald-400" data-testid="verify-success">
              {{ 'auth.verify.successBody' | transloco }}
            </p>
            <a hlmBtn routerLink="/auth/sign-in" class="w-full">
              {{ 'auth.verify.goToSignIn' | transloco }}
            </a>
          }
          @default {
            @if (state() === 'error') {
              <p class="text-sm text-destructive" data-testid="form-error">{{ errorMessage() }}</p>
            } @else {
              <p class="text-sm text-muted-foreground">
                {{ 'auth.verify.openLink' | transloco }}
              </p>
            }

            @if (resent()) {
              <p class="text-sm text-emerald-600 dark:text-emerald-400" data-testid="resend-ok">
                {{ 'auth.verify.resent' | transloco }}
              </p>
            }

            <button
              hlmBtn
              variant="outline"
              type="button"
              class="w-full"
              [disabled]="!email() || resending()"
              (click)="resend()"
            >
              @if (resending()) {
                <hlm-spinner class="h-4 w-4" />
              }
              {{ 'auth.verify.resend' | transloco }}
            </button>

            <a
              routerLink="/auth/sign-in"
              class="text-center text-sm text-primary font-medium hover:underline"
            >
              {{ 'auth.verify.backToSignIn' | transloco }}
            </a>
          }
        }
      </div>
    </div>
  `,
})
export class VerifyEmail implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly transloco = inject(TranslocoService);

  /** Bound from the query string via withComponentInputBinding(). */
  readonly token = input<string>('');
  readonly email = input<string>('');

  protected readonly state = signal<VerifyState>('idle');
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly resending = signal(false);
  protected readonly resent = signal(false);

  ngOnInit(): void {
    const token = this.token();
    if (token) this.verify(token);
  }

  private verify(token: string): void {
    this.state.set('verifying');
    this.auth.verifyEmail({ token }).subscribe({
      next: () => this.state.set('success'),
      error: (err: HttpErrorResponse) => {
        this.state.set('error');
        // A 400/401 means the verification link is invalid/expired — a bespoke
        // "request a new link" message is clearer than the generic code copy.
        this.errorMessage.set(
          err.status === 400 || err.status === 401
            ? this.transloco.translate('auth.errors.verifyLinkInvalid')
            : messageForError(err, this.transloco),
        );
      },
    });
  }

  protected resend(): void {
    const email = this.email();
    if (!email || this.resending()) return;
    this.resending.set(true);
    this.resent.set(false);
    this.auth.resendVerification({ email }).subscribe({
      next: () => {
        this.resending.set(false);
        this.resent.set(true);
      },
      error: () => {
        // The endpoint is intentionally non-revealing; treat it as sent.
        this.resending.set(false);
        this.resent.set(true);
      },
    });
  }
}
