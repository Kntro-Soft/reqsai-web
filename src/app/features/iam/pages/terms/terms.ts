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
import { lucideArrowDown, lucideCheck } from '@ng-icons/lucide';
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

type LegalTab = 'terms' | 'privacy';

/**
 * Terms & Privacy gate. Shows the Terms of Service and Privacy Policy as two tabs; the single
 * acceptance checkbox unlocks only after the user has scrolled to the end of BOTH documents
 * (clickwrap evidence, see backend ADR-0020). Accepting records the current version and rotates
 * the session. Reached only by authenticated users on an outdated terms version (termsGuard).
 */
@Component({
  selector: 'app-terms',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ThemeToggle, LanguageSwitcher, Logo, HlmButton, HlmIcon, HlmSpinner, TranslocoPipe],
  viewProviders: [provideIcons({ lucideCheck, lucideArrowDown })],
  template: `
    <div class="flex min-h-dvh flex-col bg-background text-foreground">
      <header
        class="sticky top-0 z-10 flex h-14 items-center justify-between gap-3 border-b border-border bg-background/80 px-4 backdrop-blur md:px-6"
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

      <main class="flex flex-1 flex-col">
        <div class="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-5 px-4 py-8">
          <div class="flex flex-col items-center gap-2 text-center">
            <h1 class="text-2xl font-bold tracking-tight">{{ 'legal.title' | transloco }}</h1>
            <p class="max-w-xl text-sm text-muted-foreground">{{ 'legal.subtitle' | transloco }}</p>
            <p
              class="mt-1 rounded-full bg-amber-500/10 px-3 py-1 text-xs text-amber-600 dark:text-amber-400"
            >
              {{ 'legal.draftNotice' | transloco }}
            </p>
          </div>

          <div
            role="tablist"
            class="mx-auto inline-flex rounded-full border border-border bg-card p-1 text-sm"
          >
            @for (tab of tabs; track tab) {
              <button
                role="tab"
                type="button"
                (click)="setTab(tab)"
                [attr.aria-selected]="activeTab() === tab"
                [class]="
                  activeTab() === tab
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                "
                class="inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 font-medium transition-colors"
              >
                {{ (tab === 'terms' ? 'legal.tabTerms' : 'legal.tabPrivacy') | transloco }}
                @if (tab === 'terms' ? termsRead() : privacyRead()) {
                  <hlm-icon name="lucideCheck" size="14px" />
                }
              </button>
            }
          </div>

          <div class="flex min-h-0 flex-1 flex-col rounded-2xl border border-border bg-card">
            <div
              #scroller
              (scroll)="onScroll()"
              class="max-h-[58vh] flex-1 overflow-y-auto px-5 py-5 sm:px-6"
            >
              <p class="mb-4 text-xs uppercase tracking-wide text-muted-foreground">
                {{ 'legal.lastUpdated' | transloco: { date: cfg.effectiveDate } }}
              </p>
              @for (section of activeSections(); track section.heading) {
                <section class="mb-5">
                  <h2 class="mb-1.5 text-sm font-semibold text-foreground">{{ section.heading }}</h2>
                  <p class="text-sm leading-relaxed text-muted-foreground">{{ section.body }}</p>
                </section>
              }
            </div>
          </div>
        </div>

        <div class="sticky bottom-0 z-10 border-t border-border bg-card/90 backdrop-blur">
          <div class="mx-auto flex w-full max-w-3xl flex-col gap-2.5 px-4 py-3.5">
            @if (!bothRead()) {
              <p class="flex items-center gap-2 text-sm text-muted-foreground">
                <hlm-icon name="lucideArrowDown" size="15px" />
                {{ 'legal.scrollHint' | transloco }}
              </p>
            } @else {
              <label class="flex items-start gap-2.5 text-sm">
                <input
                  type="checkbox"
                  data-testid="accept-checkbox"
                  class="mt-0.5 h-4 w-4 accent-[var(--primary)]"
                  [checked]="accepted()"
                  (change)="onToggle($event)"
                />
                <span>{{ 'legal.accept' | transloco: { name: cfg.legalName } }}</span>
              </label>
            }

            @if (errorMessage()) {
              <p class="text-sm text-destructive" data-testid="form-error">{{ errorMessage() }}</p>
            }

            <button
              hlmBtn
              type="button"
              data-testid="accept-terms"
              class="w-full sm:w-auto sm:self-end"
              [disabled]="!accepted() || !bothRead() || loading()"
              (click)="accept()"
            >
              @if (loading()) {
                <hlm-spinner class="h-4 w-4" />
              }
              {{ 'legal.submit' | transloco }}
            </button>
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

  protected readonly cfg = LEGAL_CONFIG;
  protected readonly tabs: readonly LegalTab[] = ['terms', 'privacy'];

  private readonly params = {
    date: this.cfg.effectiveDate,
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

  protected readonly activeTab = signal<LegalTab>('terms');
  protected readonly termsRead = signal(false);
  protected readonly privacyRead = signal(false);
  protected readonly accepted = signal(false);
  protected readonly loading = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly bothRead = computed(() => this.termsRead() && this.privacyRead());
  protected readonly activeSections = computed(() =>
    this.activeTab() === 'terms' ? this.termsSections() : this.privacySections(),
  );

  constructor() {
    // When the active tab's content (re)loads — initial render, tab switch, or language change —
    // mark it read if it already fits without scrolling.
    effect(() => {
      this.activeSections();
      requestAnimationFrame(() => {
        const el = this.scroller()?.nativeElement;
        if (el && el.scrollHeight - el.clientHeight < 24) this.markActiveRead();
      });
    });
  }

  protected setTab(tab: LegalTab): void {
    this.activeTab.set(tab);
    const el = this.scroller()?.nativeElement;
    if (el) el.scrollTop = 0;
  }

  protected onScroll(): void {
    const el = this.scroller()?.nativeElement;
    if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 24) this.markActiveRead();
  }

  private markActiveRead(): void {
    if (this.activeTab() === 'terms') this.termsRead.set(true);
    else this.privacyRead.set(true);
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

  protected onToggle(event: Event): void {
    this.accepted.set((event.target as HTMLInputElement).checked);
  }

  protected accept(): void {
    if (!this.accepted() || !this.bothRead() || this.loading()) return;
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
}
