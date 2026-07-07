import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { provideIcons } from '@ng-icons/core';
import { lucideCheck, lucideLanguages } from '@ng-icons/lucide';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { Lang, SUPPORTED_LANGS, saveLang } from '../../../core/i18n/language';
import { HlmIcon } from '../../ui';

/**
 * Compact language switcher for chrome **without** a user menu — the auth pages and the
 * onboarding/create-org flow. Mirrors the language section inside {@code UserMenu}; switching
 * sets the active Transloco language and persists the choice. Closes on outside click or Escape.
 */
@Component({
  selector: 'app-language-switcher',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'close()' },
  imports: [HlmIcon, TranslocoPipe],
  viewProviders: [provideIcons({ lucideLanguages, lucideCheck })],
  template: `
    <div class="relative">
      <button
        type="button"
        (click)="toggle()"
        [attr.aria-expanded]="open()"
        aria-haspopup="menu"
        [attr.aria-label]="'language.label' | transloco"
        class="grid h-9 w-9 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <hlm-icon name="lucideLanguages" size="18px" />
      </button>

      @if (open()) {
        <div class="fixed inset-0 z-40" aria-hidden="true" (click)="close()"></div>
        <div
          role="menu"
          class="absolute right-0 top-full z-50 mt-2 w-40 overflow-hidden rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-xl"
        >
          @for (lang of langs; track lang) {
            <button
              role="menuitemradio"
              type="button"
              [attr.aria-checked]="lang === activeLang()"
              (click)="select(lang)"
              class="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-accent"
            >
              <span>{{ 'language.' + lang | transloco }}</span>
              @if (lang === activeLang()) {
                <hlm-icon name="lucideCheck" size="16px" class="shrink-0 text-primary" />
              }
            </button>
          }
        </div>
      }
    </div>
  `,
})
export class LanguageSwitcher {
  private readonly transloco = inject(TranslocoService);

  protected readonly langs = SUPPORTED_LANGS;
  protected readonly activeLang = toSignal(this.transloco.langChanges$, {
    initialValue: this.transloco.getActiveLang(),
  });
  protected readonly open = signal(false);

  protected toggle(): void {
    this.open.update((v) => !v);
  }

  protected close(): void {
    this.open.set(false);
  }

  protected select(lang: Lang): void {
    this.transloco.setActiveLang(lang);
    saveLang(lang);
    this.close();
  }
}
