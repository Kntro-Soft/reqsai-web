import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { AuthService } from '../../../../core/auth/auth.service';
import { CURRENT_TERMS_VERSION } from '../../../../core/auth/terms';
import { provideIcons } from '@ng-icons/core';
import { lucideFileText } from '@ng-icons/lucide';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { ThemeToggle } from '../../../../shared/components/theme-toggle/theme-toggle';
import { LanguageSwitcher } from '../../../../shared/components/language-switcher/language-switcher';
import { Logo } from '../../../../shared/components/logo/logo';
import { HlmButton, HlmCard, HlmCardContent, HlmIcon, HlmSpinner } from '../../../../shared/ui';

/**
 * Terms-of-service gate shown to authenticated users who have not accepted the
 * current version (see termsGuard). Accepting records it and rotates the token.
 */
@Component({
  selector: 'app-terms',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ThemeToggle,
    LanguageSwitcher,
    Logo,
    HlmButton,
    HlmCard,
    HlmCardContent,
    HlmSpinner,
    HlmIcon,
    TranslocoPipe,
  ],
  viewProviders: [provideIcons({ lucideFileText })],
  template: `
    <div class="flex min-h-dvh flex-col bg-background text-foreground">
      <header
        class="sticky top-0 z-10 mx-3 mt-3 flex h-14 items-center justify-between gap-3 rounded-2xl border border-border bg-card/80 px-4 shadow-sm backdrop-blur md:mx-4 md:mt-4"
      >
        <app-logo [size]="28" />
        <div class="flex items-center gap-2">
          <app-language-switcher />
          <app-theme-toggle />
          <button
            type="button"
            (click)="signOut()"
            class="text-sm text-muted-foreground hover:text-foreground"
          >
            {{ 'userMenu.signOut' | transloco }}
          </button>
        </div>
      </header>

      <main class="flex flex-1 items-center justify-center px-4 py-8">
        <div class="flex w-full max-w-2xl flex-col gap-6">
          <div class="flex flex-col items-center gap-3 text-center">
            <span class="grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary">
              <hlm-icon name="lucideFileText" size="26px" />
            </span>
            <div>
              <h1 class="text-2xl font-bold tracking-tight">{{ 'terms.title' | transloco }}</h1>
              <p class="mt-1 text-sm text-muted-foreground">{{ 'terms.subtitle' | transloco }}</p>
            </div>
          </div>

          <div hlmCard>
            <div hlmCardContent class="flex flex-col gap-4 pt-6">
              <div
                class="max-h-72 overflow-y-auto rounded-lg border border-border bg-secondary/30 p-4 text-sm leading-relaxed text-muted-foreground"
              >
                <p class="mb-3">{{ 'terms.p1' | transloco }}</p>
                <p class="mb-3">
                  <span class="font-medium text-foreground">{{ 'terms.p2Label' | transloco }}</span>
                  {{ 'terms.p2' | transloco }}
                </p>
                <p class="mb-3">
                  <span class="font-medium text-foreground">{{ 'terms.p3Label' | transloco }}</span>
                  {{ 'terms.p3' | transloco }}
                </p>
                <p>
                  <span class="font-medium text-foreground">{{ 'terms.p4Label' | transloco }}</span>
                  {{ 'terms.p4' | transloco }}
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
                <span>{{ 'terms.accept' | transloco }}</span>
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
                {{ 'terms.submit' | transloco }}
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
  private readonly transloco = inject(TranslocoService);

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
          this.transloco.translate(
            err.status === 401 ? 'terms.errorSessionExpired' : 'terms.errorGeneric',
          ),
        );
      },
    });
  }

  protected signOut(): void {
    this.auth.logout();
  }
}
