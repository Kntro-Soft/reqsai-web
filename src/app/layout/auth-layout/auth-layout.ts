import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ThemeToggle } from '../../shared/components/theme-toggle/theme-toggle';
import { Logo } from '../../shared/components/logo/logo';

/**
 * Auth shell. On desktop it is a centered, capped split card (brand panel +
 * form) so it never stretches on ultra-wide screens; on mobile it collapses to
 * a single full-height form column.
 */
@Component({
  selector: 'app-auth-layout',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, ThemeToggle, Logo],
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
              Elicitación con IA
            </p>
            <h1 class="mt-4 text-4xl font-extrabold leading-[1.1] tracking-tight">
              Transforma reuniones en backlogs perfectos.
            </h1>
            <p class="mt-4 max-w-sm text-base text-muted-foreground">
              Captura sesiones de descubrimiento y deja que la IA genere historias de usuario y
              criterios de aceptación en vivo.
            </p>
            <ul class="mt-8 flex flex-col gap-3 text-sm text-secondary-foreground">
              <li class="flex items-center gap-3">
                <span class="h-1.5 w-1.5 rounded-full bg-primary"></span>
                Transcripción y sugerencias en tiempo real
              </li>
              <li class="flex items-center gap-3">
                <span class="h-1.5 w-1.5 rounded-full bg-primary"></span>
                Multi-organización con aislamiento por tenant
              </li>
              <li class="flex items-center gap-3">
                <span class="h-1.5 w-1.5 rounded-full bg-primary"></span>
                Backlog listo para exportar
              </li>
            </ul>
          </div>

          <p class="relative text-xs text-muted-foreground">© Reqs-AI</p>
        </aside>

        <!-- Form column -->
        <main class="relative flex flex-col bg-background">
          <header class="flex items-center justify-between px-6 py-4 lg:justify-end">
            <app-logo class="lg:hidden" [size]="30" />
            <app-theme-toggle />
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
