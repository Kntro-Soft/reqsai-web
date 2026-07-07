import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { provideIcons } from '@ng-icons/core';
import { lucideArrowLeft, lucideArrowRight } from '@ng-icons/lucide';
import { AuthService } from '../../../../core/auth/auth.service';
import { CURRENT_TERMS_VERSION } from '../../../../core/auth/terms';
import { LEGAL_CONFIG } from '../../../../core/legal/legal-config';
import { ThemeToggle } from '../../../../shared/components/theme-toggle/theme-toggle';
import { LanguageSwitcher } from '../../../../shared/components/language-switcher/language-switcher';
import { Logo } from '../../../../shared/components/logo/logo';
import { HlmButton, HlmIcon, HlmSpinner } from '../../../../shared/ui';

interface LegalSection {
  heading: string;
  body: string;
}

type LegalStep = 'terms' | 'privacy';

/**
 * Terms & Privacy gate, read as a full-page document (Vercel-style). The two documents are read in
 * sequence: the user scrolls the Terms to the end to reveal "Next", then the Privacy Policy to the
 * end to reveal "Accept and continue". This sequential gate is itself the clickwrap evidence that
 * both documents were reached (see backend ADR-0020) — no separate checkbox. Reached only by
 * authenticated users on an outdated terms version (termsGuard).
 */
@Component({
  selector: 'app-terms',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ThemeToggle, LanguageSwitcher, Logo, HlmButton, HlmIcon, HlmSpinner, TranslocoPipe],
  viewProviders: [provideIcons({ lucideArrowLeft, lucideArrowRight })],
  styles: [
    `
      .legal-grid {
        background-image:
          linear-gradient(to right, var(--border) 1px, transparent 1px),
          linear-gradient(to bottom, var(--border) 1px, transparent 1px);
        background-size: 44px 44px;
        -webkit-mask-image: radial-gradient(ellipse 80% 60% at 50% 40%, black, transparent 78%);
        mask-image: radial-gradient(ellipse 80% 60% at 50% 40%, black, transparent 78%);
      }

      @keyframes legalFooterUp {
        from {
          transform: translateY(100%);
          opacity: 0;
        }
        to {
          transform: translateY(0);
          opacity: 1;
        }
      }
      .footer-enter {
        animation: legalFooterUp 0.25s ease-out;
      }
    `,
  ],
  template: `
    <div class="relative flex h-dvh flex-col overflow-hidden bg-background text-foreground">
      <!-- Decorative Vercel-style background: faint grid + the two framing column lines -->
      <div class="legal-grid pointer-events-none absolute inset-0 z-0 opacity-60"></div>
      <div class="pointer-events-none absolute inset-0 z-0 flex justify-center">
        <div class="h-full w-full max-w-3xl border-x border-border/50"></div>
      </div>

      <header
        class="relative z-10 flex h-14 shrink-0 items-center justify-between gap-3 px-4 md:px-6"
      >
        <app-logo [size]="28" />
        <div class="flex items-center gap-1">
          <app-language-switcher />
          <app-theme-toggle />
          <button
            type="button"
            (click)="signOut()"
            class="ml-1 text-sm text-muted-foreground hover:text-foreground"
          >
            {{ 'legal.signOut' | transloco }}
          </button>
        </div>
      </header>

      <main
        #scroller
        tabindex="0"
        (scroll)="onScroll()"
        class="relative z-[1] min-h-0 flex-1 overflow-y-auto outline-none [overflow-anchor:none]"
      >
        <article class="mx-auto max-w-3xl px-6 py-12 sm:px-10">
          <p class="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
            {{ cfg.tradeName }}
          </p>
          <h1 class="mt-3 text-4xl font-bold tracking-tight sm:text-5xl">
            {{ (step() === 'terms' ? 'legal.tabTerms' : 'legal.tabPrivacy') | transloco }}
          </h1>
          <p class="mt-3 text-sm text-muted-foreground">
            {{ 'legal.lastUpdated' | transloco: { date: cfg.effectiveDate } }}
          </p>

          <div class="mt-10 flex flex-col gap-7">
            @for (section of activeSections(); track section.heading) {
              <section>
                <h2 class="text-base font-semibold text-foreground">{{ section.heading }}</h2>
                <p class="mt-2 text-sm leading-relaxed text-muted-foreground">{{ section.body }}</p>
              </section>
            }
          </div>
        </article>
      </main>

      <!-- While the current document is not yet fully read: only a thin reading-progress bar. -->
      @if (!canContinue()) {
        <div class="relative z-10 h-0.5 w-full shrink-0 bg-border/40">
          <div
            class="h-full bg-primary/70 transition-[width] duration-150 ease-out"
            [style.width.%]="progress() * 100"
          ></div>
        </div>
      }

      <!-- The footer appears only once the current document has been read to the end. Read state is
           sticky, so it stays (and reappears when returning to an already-read document). -->
      @if (canContinue()) {
        <div class="pointer-events-none relative z-10 flex shrink-0 justify-center px-4 pb-4">
          <footer
            class="footer-enter pointer-events-auto flex w-full max-w-3xl items-center gap-2 rounded-2xl border border-border bg-card/90 px-4 py-2.5 shadow-lg backdrop-blur sm:gap-3 sm:px-5 sm:py-3"
          >
            <div class="flex shrink-0 items-center gap-2 sm:gap-3">
              @if (step() === 'privacy') {
                <button hlmBtn variant="ghost" size="sm" type="button" (click)="back()">
                  <hlm-icon name="lucideArrowLeft" size="15px" />
                  <span class="hidden sm:inline">{{ 'legal.back' | transloco }}</span>
                </button>
              }
              <span class="text-xs text-muted-foreground pr-2">
                {{ 'legal.step' | transloco: { current: step() === 'terms' ? 1 : 2, total: 2 } }}
              </span>
            </div>

            <div class="flex flex-1 items-center justify-end gap-2 sm:gap-3">
              @if (errorMessage()) {
                <span class="truncate text-sm text-destructive" data-testid="form-error">
                  {{ errorMessage() }}
                </span>
              }

              @if (step() === 'terms') {
                <button
                  hlmBtn
                  type="button"
                  (click)="next()"
                  class="flex-1 sm:flex-none"
                  data-testid="next-document"
                >
                  {{ 'legal.next' | transloco }}
                  <hlm-icon name="lucideArrowRight" size="16px" />
                </button>
              } @else {
                <button
                  hlmBtn
                  type="button"
                  (click)="accept()"
                  [disabled]="loading()"
                  class="flex-1 sm:flex-none"
                  data-testid="accept-terms"
                >
                  @if (loading()) {
                    <hlm-spinner class="h-4 w-4" />
                  }
                  {{ 'legal.submit' | transloco }}
                </button>
              }
            </div>
          </footer>
        </div>
      }
    </div>
  `,
})
export class Terms {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly transloco = inject(TranslocoService);

  protected readonly cfg = LEGAL_CONFIG;

  private readonly params = {
    name: this.cfg.legalName,
    tradeName: this.cfg.tradeName,
    jurisdiction: this.cfg.jurisdiction,
    address: this.cfg.address,
    email: this.cfg.contactEmail,
    website: this.cfg.websiteUrl,
  };

  private readonly scroller = viewChild<ElementRef<HTMLElement>>('scroller');

  private readonly rawTerms = toSignal(
    this.transloco.selectTranslateObject<LegalSection[]>('legal.terms.sections'),
    { initialValue: [] as LegalSection[] },
  );
  private readonly rawPrivacy = toSignal(
    this.transloco.selectTranslateObject<LegalSection[]>('legal.privacy.sections'),
    { initialValue: [] as LegalSection[] },
  );

  // Interpolate the company-identity placeholders ourselves, so the content does not depend on
  // Transloco's deep object interpolation for nested arrays.
  private readonly termsSections = computed(() => this.interpolateAll(this.rawTerms()));
  private readonly privacySections = computed(() => this.interpolateAll(this.rawPrivacy()));

  protected readonly step = signal<LegalStep>('terms');
  protected readonly progress = signal(0);
  protected readonly loading = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  private readonly termsRead = signal(false);
  private readonly privacyRead = signal(false);

  protected readonly activeSections = computed(() =>
    this.step() === 'terms' ? this.termsSections() : this.privacySections(),
  );
  protected readonly canContinue = computed(() =>
    this.step() === 'terms' ? this.termsRead() : this.privacyRead(),
  );

  constructor() {
    // When the active document (re)loads — initial render or language change — sync the progress
    // bar and mark it read if it already fits without scrolling.
    effect(() => {
      this.activeSections();
      requestAnimationFrame(() => this.syncFromScroller());
    });
  }

  protected onScroll(): void {
    this.syncFromScroller();
  }

  private syncFromScroller(): void {
    const el = this.scroller()?.nativeElement;
    if (!el) return;
    // The document hasn't rendered its content yet (i18n still loading): an empty document would
    // otherwise measure as "it fits" and be wrongly marked read before the user can scroll it.
    if (this.activeSections().length === 0) return;
    const max = el.scrollHeight - el.clientHeight;
    const pct = max <= 1 ? 1 : Math.min(1, el.scrollTop / max);
    this.progress.set(pct);
    if (pct >= 0.99) this.markRead();
  }

  private markRead(): void {
    if (this.step() === 'terms') this.termsRead.set(true);
    else this.privacyRead.set(true);
  }

  protected next(): void {
    this.goTo('privacy');
  }

  protected back(): void {
    this.goTo('terms');
  }

  private goTo(step: LegalStep): void {
    this.step.set(step);
    this.progress.set(0);
    // Reset the scroll AFTER the new document has rendered, so the position lands at the top
    // (resetting before the swap is overridden by the new, taller content).
    requestAnimationFrame(() => {
      const el = this.scroller()?.nativeElement;
      if (el) el.scrollTop = 0;
      this.syncFromScroller();
    });
  }

  protected accept(): void {
    if (!this.privacyRead() || this.loading()) return;
    this.loading.set(true);
    this.errorMessage.set(null);
    this.auth.acceptTerms(CURRENT_TERMS_VERSION).subscribe({
      next: () => void this.router.navigate(['/']),
      error: (err: HttpErrorResponse) => {
        this.loading.set(false);
        this.errorMessage.set(
          this.transloco.translate(
            err.status === 401 ? 'legal.errorSessionExpired' : 'legal.errorGeneric',
          ),
        );
      },
    });
  }

  protected signOut(): void {
    this.auth.logout();
  }

  private interpolateAll(sections: readonly LegalSection[]): LegalSection[] {
    return sections.map((s) => ({
      heading: this.interpolate(s.heading),
      body: this.interpolate(s.body),
    }));
  }

  private interpolate(text: string): string {
    return text.replace(
      /\{\{\s*(\w+)\s*\}\}/g,
      (_, key) => this.params[key as keyof typeof this.params] ?? `{{${key}}}`,
    );
  }
}
