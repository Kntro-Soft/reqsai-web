import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { ThemeToggle } from '../../shared/components/theme-toggle/theme-toggle';
import { LanguageSwitcher } from '../../shared/components/language-switcher/language-switcher';
import { Logo } from '../../shared/components/logo/logo';

/**
 * Auth shell. On desktop it is a centered, capped split card (brand panel +
 * form) so it never stretches on ultra-wide screens; on mobile it collapses to
 * a single full-height form column.
 */
@Component({
  selector: 'app-auth-layout',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, ThemeToggle, LanguageSwitcher, Logo, TranslocoPipe],
  template: `
    <div class="min-h-dvh grid place-items-center bg-background text-foreground lg:p-8">
      <div
        class="relative grid w-full min-h-dvh overflow-hidden lg:min-h-[640px] lg:max-w-6xl lg:grid-cols-2 lg:rounded-3xl lg:border lg:border-border lg:shadow-2xl"
      >
        <!-- Brand panel (desktop only) -->
        <aside class="relative hidden overflow-hidden bg-sidebar p-10 lg:flex lg:flex-col">
          <div
            class="pointer-events-none absolute -left-24 -top-24 h-80 w-80 rounded-full bg-primary/25 blur-3xl"
          ></div>
          <div
            class="pointer-events-none absolute -bottom-16 right-0 h-72 w-72 rounded-full bg-primary/10 blur-3xl"
          ></div>
          <!-- Subtle brand-symbol watermark -->
          <img
            src="/assets/img/reqsai-combination-mark-white.webp"
            alt=""
            aria-hidden="true"
            class="pointer-events-none absolute -bottom-24 -right-20 w-[26rem] opacity-[0.05]"
          />

          <app-logo class="relative" [size]="36" />

          <div class="relative flex flex-1 flex-col justify-center py-10">
            <p class="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              {{ 'auth.brand.eyebrow' | transloco }}
            </p>
            <h1 class="mt-4 text-4xl font-extrabold leading-[1.1] tracking-tight">
              {{ 'auth.brand.headline' | transloco }}
            </h1>
            <p class="mt-4 max-w-sm text-base text-muted-foreground">
              {{ 'auth.brand.subtitle' | transloco }}
            </p>
            <ul class="mt-8 flex flex-col gap-3 text-sm text-secondary-foreground">
              <li class="flex items-center gap-3">
                <span class="h-1.5 w-1.5 rounded-full bg-primary"></span>
                {{ 'auth.brand.bullet1' | transloco }}
              </li>
              <li class="flex items-center gap-3">
                <span class="h-1.5 w-1.5 rounded-full bg-primary"></span>
                {{ 'auth.brand.bullet2' | transloco }}
              </li>
              <li class="flex items-center gap-3">
                <span class="h-1.5 w-1.5 rounded-full bg-primary"></span>
                {{ 'auth.brand.bullet3' | transloco }}
              </li>
            </ul>
          </div>

          <p class="relative text-xs text-muted-foreground">© Reqs-AI</p>
        </aside>

        <!-- Form column -->
        <main class="relative flex flex-col bg-background">
          <header class="flex items-center justify-between px-6 py-4 lg:justify-end">
            <app-logo class="lg:hidden" [size]="30" />
            <div class="flex items-center gap-1">
              <app-language-switcher />
              <app-theme-toggle />
            </div>
          </header>

          <div class="grid flex-1 place-items-center px-6 py-8">
            <div class="w-full max-w-md">
              <router-outlet />
            </div>
          </div>
        </main>
      </div>
    </div>
  `,
})
export class AuthLayout {}
