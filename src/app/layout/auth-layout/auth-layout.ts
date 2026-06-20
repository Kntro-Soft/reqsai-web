import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ThemeToggle } from '../../shared/components/theme-toggle/theme-toggle';

/**
 * Split-screen auth shell: an editorial brand panel (desktop) next to the form.
 * Collapses to a single centered column on mobile.
 */
@Component({
  selector: 'app-auth-layout',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, ThemeToggle],
  template: `
    <div class="min-h-dvh grid lg:grid-cols-2 bg-background text-foreground">
      <!-- Brand panel (desktop only) -->
      <aside
        class="relative hidden lg:flex flex-col justify-between overflow-hidden p-12 bg-sidebar"
      >
        <div
          class="pointer-events-none absolute -top-24 -left-24 h-96 w-96 rounded-full bg-primary/25 blur-3xl"
        ></div>
        <div
          class="pointer-events-none absolute bottom-0 right-0 h-72 w-72 rounded-full bg-primary/10 blur-3xl"
        ></div>

        <div class="relative flex items-center gap-2">
          <div
            class="h-9 w-9 rounded-lg bg-primary text-primary-foreground grid place-items-center font-bold"
          >
            R
          </div>
          <span class="font-semibold tracking-tight">Reqs-AI</span>
        </div>

        <div class="relative max-w-md">
          <p class="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
            Elicitación con IA
          </p>
          <h1 class="mt-4 text-4xl font-extrabold leading-[1.1] tracking-tight">
            Transforma reuniones en backlogs perfectos.
          </h1>
          <p class="mt-4 text-base text-muted-foreground">
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
      <main class="relative flex flex-col">
        <header class="flex items-center justify-between px-6 py-4 lg:justify-end">
          <div class="flex items-center gap-2 lg:hidden">
            <div
              class="h-8 w-8 rounded-lg bg-primary text-primary-foreground grid place-items-center font-bold"
            >
              R
            </div>
            <span class="font-semibold tracking-tight">Reqs-AI</span>
          </div>
          <app-theme-toggle />
        </header>

        <div class="flex-1 grid place-items-center px-4 py-8">
          <div class="w-full max-w-md">
            <router-outlet />
          </div>
        </div>
      </main>
    </div>
  `,
})
export class AuthLayout {}
