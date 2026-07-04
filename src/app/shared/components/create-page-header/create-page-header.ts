import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { provideIcons } from '@ng-icons/core';
import { lucideArrowLeft } from '@ng-icons/lucide';
import { TranslocoPipe } from '@jsverse/transloco';
import { Logo } from '../logo/logo';
import { LanguageSwitcher } from '../language-switcher/language-switcher';
import { ThemeToggle } from '../theme-toggle/theme-toggle';
import { HlmIcon } from '../../ui';

/**
 * Chrome-less page header shared by the create-organization and create-project
 * flows: a bottom-bordered bar with the language + theme controls on the right.
 * When `backHref` is set, a back link sits on the left and the brand logo is
 * centered; otherwise (e.g. onboarding, where there is nowhere to go back to)
 * the logo sits on the left.
 */
@Component({
  selector: 'app-create-page-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Logo, LanguageSwitcher, ThemeToggle, HlmIcon, TranslocoPipe],
  viewProviders: [provideIcons({ lucideArrowLeft })],
  template: `
    <header
      class="relative z-10 grid h-14 shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-3 border-b border-border px-4 md:px-6"
    >
      <div class="flex items-center justify-start">
        @if (backHref(); as href) {
          <a
            [routerLink]="href"
            class="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <hlm-icon name="lucideArrowLeft" size="16px" />
            {{ 'common.back' | transloco }}
          </a>
        } @else {
          <app-logo [size]="logoSize()" />
        }
      </div>
      @if (backHref()) {
        <app-logo [size]="logoSize()" />
      } @else {
        <span></span>
      }
      <div class="flex items-center justify-end gap-1">
        <app-language-switcher />
        <app-theme-toggle />
      </div>
    </header>
  `,
})
export class CreatePageHeader {
  /** When set, shows a back link on the left and centers the logo. */
  readonly backHref = input<string | null>(null);
  /** Pixel size of the brand logo. */
  readonly logoSize = input(24);
}
