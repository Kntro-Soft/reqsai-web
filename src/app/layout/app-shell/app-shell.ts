import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { AuthStore } from '../../core/auth/auth.store';
import { TenantContextService } from '../../core/tenant/tenant-context.service';
import { ThemeToggle } from '../../shared/components/theme-toggle/theme-toggle';
import { HlmButton } from '../../shared/ui/button/hlm-button';

@Component({
  selector: 'app-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, ThemeToggle, HlmButton],
  template: `
    <div class="min-h-dvh flex bg-background text-foreground">
      <!-- Sidebar -->
      <aside
        class="hidden md:flex w-60 shrink-0 flex-col border-r border-border bg-sidebar text-sidebar-foreground"
      >
        <div class="flex items-center gap-2 px-5 h-16 border-b border-sidebar-border">
          <div
            class="h-8 w-8 rounded-lg bg-primary text-primary-foreground grid place-items-center font-bold"
          >
            R
          </div>
          <span class="font-semibold tracking-tight">Reqs-AI</span>
        </div>
        <nav class="flex flex-col gap-1 p-3">
          <a
            routerLink="/home"
            routerLinkActive="bg-sidebar-accent text-sidebar-accent-foreground"
            class="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M3 9.5 12 3l9 6.5V21a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z" />
            </svg>
            Inicio
          </a>
        </nav>
      </aside>

      <!-- Main column -->
      <div class="flex-1 flex flex-col min-w-0">
        <header class="flex items-center justify-between gap-4 px-6 h-16 border-b border-border">
          <!-- Organization indicator (a full org switcher lands with the workspace feature) -->
          <div class="flex items-center gap-2 min-w-0">
            <span
              class="inline-flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm"
            >
              <span
                class="h-2 w-2 rounded-full"
                [class.bg-emerald-500]="tenant.orgId()"
                [class.bg-muted-foreground]="!tenant.orgId()"
              ></span>
              <span class="truncate text-muted-foreground">
                {{ tenant.orgId() ? 'Organización activa' : 'Sin organización' }}
              </span>
            </span>
          </div>

          <div class="flex items-center gap-3">
            @if (store.user(); as user) {
              <span class="hidden sm:inline text-sm text-muted-foreground">{{
                user.fullName
              }}</span>
            }
            <app-theme-toggle />
            <button hlmBtn variant="ghost" size="sm" type="button" (click)="logout()">
              Cerrar sesión
            </button>
          </div>
        </header>

        <main class="flex-1 overflow-y-auto">
          <div class="mx-auto w-full max-w-6xl px-6 py-8">
            <router-outlet />
          </div>
        </main>
      </div>
    </div>
  `,
})
export class AppShell {
  protected readonly tenant = inject(TenantContextService);
  protected readonly store = inject(AuthStore);
  private readonly auth = inject(AuthService);

  protected logout(): void {
    this.auth.logout();
  }
}
