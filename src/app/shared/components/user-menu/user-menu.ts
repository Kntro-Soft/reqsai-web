import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { OverlayModule } from '@angular/cdk/overlay';
import { provideIcons } from '@ng-icons/core';
import {
  lucideEllipsisVertical,
  lucideLogOut,
  lucideMonitor,
  lucideMoon,
  lucideSun,
} from '@ng-icons/lucide';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { AuthService } from '../../../core/auth/auth.service';
import { AuthStore } from '../../../core/auth/auth.store';
import { ThemeMode, ThemeService } from '../../../core/theme/theme.service';
import { Lang, SUPPORTED_LANGS, saveLang } from '../../../core/i18n/language';
import { Avatar } from '../avatar/avatar';
import { ABOVE_START } from '../popover/popover-positions';
import { HlmIcon } from '../../ui';

/**
 * Sidebar-foot user menu (Vercel style). The user row opens a popover (CDK
 * overlay, anchored above) with a 3-state theme control (system / light / dark),
 * a language toggle and sign out. Rendered through an overlay so it escapes the
 * sidebar's clipping. Closes on outside click or Escape.
 */
@Component({
  selector: 'app-user-menu',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [OverlayModule, Avatar, HlmIcon, TranslocoPipe],
  viewProviders: [
    provideIcons({ lucideEllipsisVertical, lucideLogOut, lucideMonitor, lucideSun, lucideMoon }),
  ],
  template: `
    <button
      type="button"
      cdkOverlayOrigin
      #origin="cdkOverlayOrigin"
      (click)="toggle()"
      [attr.aria-expanded]="open()"
      aria-haspopup="menu"
      [attr.aria-label]="'userMenu.ariaLabel' | transloco"
      class="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <app-avatar
        [name]="store.user()?.fullName ?? ''"
        [seed]="store.user()?.id ?? ''"
        [imageUrl]="store.user()?.avatarUrl ?? null"
        [size]="26"
        [circle]="true"
      />
      <span class="min-w-0 flex-1 truncate text-sm font-medium">{{ store.user()?.fullName }}</span>
      <hlm-icon name="lucideEllipsisVertical" size="16px" class="shrink-0 text-muted-foreground" />
    </button>

    <ng-template
      cdkConnectedOverlay
      [cdkConnectedOverlayOrigin]="origin"
      [cdkConnectedOverlayOpen]="open()"
      [cdkConnectedOverlayPositions]="positions"
      (overlayOutsideClick)="close()"
      (overlayKeydown)="onKeydown($event)"
      (detach)="close()"
    >
      <div
        role="menu"
        class="w-64 overflow-hidden rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-xl"
      >
        <div class="flex items-center gap-3 px-2.5 py-2.5">
          <app-avatar
            [name]="store.user()?.fullName ?? ''"
            [seed]="store.user()?.id ?? ''"
            [imageUrl]="store.user()?.avatarUrl ?? null"
            [size]="36"
            [circle]="true"
          />
          <div class="min-w-0">
            <p class="truncate text-sm font-medium">{{ store.user()?.fullName }}</p>
            <p class="truncate text-xs text-muted-foreground">
              {{ 'userMenu.personalAccount' | transloco }}
            </p>
          </div>
        </div>
        <div class="my-1 h-px bg-border"></div>

        <!-- Theme: system / light / dark segmented control -->
        <div class="flex items-center justify-between gap-2 px-2.5 py-1.5">
          <span class="text-sm">{{ 'userMenu.theme' | transloco }}</span>
          <div class="flex items-center gap-0.5 rounded-lg border border-border p-0.5">
            @for (opt of themes; track opt.mode) {
              <button
                type="button"
                (click)="theme.set(opt.mode)"
                [attr.aria-pressed]="theme.mode() === opt.mode"
                [attr.aria-label]="'theme.' + opt.mode | transloco"
                [attr.title]="'theme.' + opt.mode | transloco"
                class="grid h-7 w-7 place-items-center rounded-md transition-colors"
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

        <!-- Language: EN / ES segmented control -->
        <div class="flex items-center justify-between gap-2 px-2.5 py-1.5">
          <span class="text-sm">{{ 'language.label' | transloco }}</span>
          <div class="flex items-center gap-0.5 rounded-lg border border-border p-0.5">
            @for (lang of langs; track lang) {
              <button
                type="button"
                (click)="setLang(lang)"
                [attr.aria-pressed]="lang === activeLang()"
                class="rounded-md px-2.5 py-1 text-xs font-medium uppercase transition-colors"
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
        <div class="my-1 h-px bg-border"></div>

        <button
          role="menuitem"
          type="button"
          data-testid="logout"
          (click)="logout()"
          class="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-destructive transition-colors hover:bg-destructive/10"
        >
          <hlm-icon name="lucideLogOut" size="16px" />
          {{ 'userMenu.signOut' | transloco }}
        </button>
      </div>
    </ng-template>
  `,
})
export class UserMenu {
  protected readonly store = inject(AuthStore);
  protected readonly theme = inject(ThemeService);
  private readonly auth = inject(AuthService);
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

  protected readonly positions = ABOVE_START;
  protected readonly open = signal(false);

  protected toggle(): void {
    this.open.update((v) => !v);
  }

  protected close(): void {
    this.open.set(false);
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') this.close();
  }

  protected setLang(lang: Lang): void {
    this.transloco.setActiveLang(lang);
    saveLang(lang);
  }

  protected logout(): void {
    this.close();
    this.auth.logout();
  }
}
