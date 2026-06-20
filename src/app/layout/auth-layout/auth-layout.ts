import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ThemeToggle } from '../../shared/components/theme-toggle/theme-toggle';

@Component({
  selector: 'app-auth-layout',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, ThemeToggle],
  template: `
    <div class="min-h-dvh flex flex-col bg-background text-foreground">
      <header class="flex items-center justify-between px-6 py-4">
        <div class="flex items-center gap-2">
          <div
            class="h-8 w-8 rounded-lg bg-primary text-primary-foreground grid place-items-center font-bold"
          >
            R
          </div>
          <span class="font-semibold tracking-tight">Reqs-AI</span>
        </div>
        <app-theme-toggle />
      </header>

      <main class="flex-1 grid place-items-center px-4 py-8">
        <div class="w-full max-w-md">
          <router-outlet />
        </div>
      </main>

      <footer class="px-6 py-4 text-center text-xs text-muted-foreground">
        Descubrimiento de requisitos asistido por IA
      </footer>
    </div>
  `,
})
export class AuthLayout {}
