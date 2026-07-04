import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { provideIcons } from '@ng-icons/core';
import { lucideMonitor, lucideMoon, lucideSun } from '@ng-icons/lucide';
import { ThemeMode, ThemeService } from '../../../../../core/theme/theme.service';
import { Lang, SUPPORTED_LANGS, saveLang } from '../../../../../core/i18n/language';
import { HlmIcon } from '../../../../../shared/ui';

/** Account · Appearance: per-device theme and language preferences. */
@Component({
  selector: 'app-account-appearance',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [HlmIcon, TranslocoPipe],
  viewProviders: [provideIcons({ lucideMonitor, lucideSun, lucideMoon })],
  template: `
    <div class="flex flex-col gap-6">
      <section class="overflow-hidden rounded-2xl border border-border">
        <div class="flex flex-col gap-4 p-5">
          <div class="flex flex-col gap-1">
            <h2 class="text-base font-semibold">{{ 'account.appearance' | transloco }}</h2>
            <p class="text-sm text-muted-foreground">{{ 'account.appearanceDesc' | transloco }}</p>
          </div>
          <div class="flex flex-wrap items-center justify-between gap-3">
            <span class="text-sm">{{ 'userMenu.theme' | transloco }}</span>
            <div class="flex items-center gap-0.5 rounded-lg border border-border p-0.5">
              @for (opt of themes; track opt.mode) {
                <button
                  type="button"
                  (click)="theme.set(opt.mode)"
                  [attr.aria-pressed]="theme.mode() === opt.mode"
                  [attr.title]="'theme.' + opt.mode | transloco"
                  class="grid h-8 w-9 place-items-center rounded-md transition-colors"
                  [class]="
                    theme.mode() === opt.mode
                      ? 'bg-secondary text-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  "
                >
                  <hlm-icon [name]="opt.icon" size="15px" />
                </button>
              }
            </div>
          </div>
          <div class="flex flex-wrap items-center justify-between gap-3">
            <span class="text-sm">{{ 'language.label' | transloco }}</span>
            <div class="flex items-center gap-0.5 rounded-lg border border-border p-0.5">
              @for (lang of langs; track lang) {
                <button
                  type="button"
                  (click)="setLang(lang)"
                  [attr.aria-pressed]="lang === activeLang()"
                  class="rounded-md px-3 py-1 text-xs font-medium uppercase transition-colors"
                  [class]="
                    lang === activeLang()
                      ? 'bg-secondary text-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  "
                >
                  {{ lang }}
                </button>
              }
            </div>
          </div>
        </div>
      </section>
    </div>
  `,
})
export class AccountAppearance {
  protected readonly theme = inject(ThemeService);
  private readonly transloco = inject(TranslocoService);

  protected readonly langs = SUPPORTED_LANGS;
  protected readonly themes: { mode: ThemeMode; icon: string }[] = [
    { mode: 'system', icon: 'lucideMonitor' },
    { mode: 'light', icon: 'lucideSun' },
    { mode: 'dark', icon: 'lucideMoon' },
  ];
  protected readonly activeLang = toSignal(this.transloco.langChanges$, {
    initialValue: this.transloco.getActiveLang(),
  });

  protected setLang(lang: Lang): void {
    this.transloco.setActiveLang(lang);
    saveLang(lang);
  }
}
