import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { AuthStore } from '../../core/auth/auth.store';
import { WorkspaceStore } from '../../features/workspace/data/workspace.store';
import { ThemeToggle } from '../../shared/components/theme-toggle/theme-toggle';
import { Logo } from '../../shared/components/logo/logo';
import { HlmButton } from '../../shared/ui/button/hlm-button';

@Component({
  selector: 'app-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, ThemeToggle, HlmButton, Logo],
  template: `
    <div class="flex min-h-dvh bg-background text-foreground">
      <!-- Sidebar -->
      <aside
        class="hidden w-64 shrink-0 flex-col border-r border-border bg-sidebar text-sidebar-foreground md:flex"
      >
        <div class="flex h-16 items-center border-b border-sidebar-border px-5">
          <app-logo [size]="30" />
        </div>

        <!-- Organization switcher -->
        <div class="border-b border-sidebar-border p-3">
          @if (workspace.organizations().length) {
            <div class="relative">
              <span
                class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <path d="M3 21h18M5 21V7l8-4v18M19 21V11l-6-4M9 9v.01M9 12v.01M9 15v.01" />
                </svg>
              </span>
              <select
                data-testid="org-switcher"
                aria-label="Cambiar organización"
                class="w-full appearance-none rounded-lg border border-sidebar-border bg-sidebar-accent/50 py-2 pl-9 pr-8 text-sm font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                (change)="onSwitch(asValue($event))"
              >
                @for (org of workspace.organizations(); track org.id) {
                  <option [value]="org.id" [selected]="org.id === store.organizationId()">
                    {{ org.name }}
                  </option>
                }
              </select>
              <span
                class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <path d="m7 15 5 5 5-5M7 9l5-5 5 5" />
                </svg>
              </span>
            </div>
          } @else {
            <span class="block px-1 text-sm text-muted-foreground">Sin organización</span>
          }
        </div>

        <nav class="flex flex-col gap-1 p-3">
          <a
            routerLink="/home"
            routerLinkActive="bg-sidebar-accent text-sidebar-accent-foreground"
            class="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
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
          <a
            routerLink="/projects"
            routerLinkActive="bg-sidebar-accent text-sidebar-accent-foreground"
            class="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
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
              <path
                d="M4 7V5a2 2 0 0 1 2-2h3l2 2h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z"
              />
            </svg>
            Proyectos
          </a>
        </nav>
      </aside>

      <!-- Main column -->
      <div class="flex min-w-0 flex-1 flex-col">
        <header class="flex h-16 items-center justify-end gap-3 border-b border-border px-6">
          @if (store.user(); as user) {
            <span
              class="grid h-8 w-8 place-items-center rounded-full bg-primary/15 text-xs font-semibold text-primary"
            >
              {{ initials() }}
            </span>
            <span class="hidden text-sm text-muted-foreground sm:inline">{{ user.fullName }}</span>
          }
          <app-theme-toggle />
          <button hlmBtn variant="ghost" size="sm" type="button" (click)="logout()">
            Cerrar sesión
          </button>
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
  protected readonly store = inject(AuthStore);
  protected readonly workspace = inject(WorkspaceStore);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly initials = computed(() => {
    const user = this.store.user();
    if (!user) return '';
    return `${user.firstName.charAt(0)}${user.lastName.charAt(0)}`.toUpperCase();
  });

  constructor() {
    // Load the org list once the session is active, to populate the switcher.
    effect(() => {
      if (this.store.isAuthenticated() && this.workspace.orgsState() === 'idle') {
        this.workspace.loadOrganizations();
      }
    });
  }

  protected asValue(event: Event): string {
    return (event.target as HTMLSelectElement).value;
  }

  protected onSwitch(orgId: string): void {
    if (!orgId || orgId === this.store.organizationId()) return;
    this.auth.switchOrganization(orgId).subscribe(() => {
      this.workspace.loadProjects(orgId);
      void this.router.navigate(['/projects']);
    });
  }

  protected logout(): void {
    this.auth.logout();
  }
}
