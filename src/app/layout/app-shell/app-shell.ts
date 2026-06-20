import { ChangeDetectionStrategy, Component, effect, inject } from '@angular/core';
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
    <div class="min-h-dvh flex bg-background text-foreground">
      <!-- Sidebar -->
      <aside
        class="hidden md:flex w-60 shrink-0 flex-col border-r border-border bg-sidebar text-sidebar-foreground"
      >
        <div class="flex items-center gap-2 px-5 h-16 border-b border-sidebar-border">
          <app-logo [size]="30" />
        </div>
        <nav class="flex flex-col gap-1 p-3">
          <a
            routerLink="/home"
            routerLinkActive="bg-sidebar-accent text-sidebar-accent-foreground"
            class="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
          >
            Inicio
          </a>
          <a
            routerLink="/projects"
            routerLinkActive="bg-sidebar-accent text-sidebar-accent-foreground"
            class="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
          >
            Proyectos
          </a>
        </nav>
      </aside>

      <!-- Main column -->
      <div class="flex-1 flex flex-col min-w-0">
        <header class="flex items-center justify-between gap-4 px-6 h-16 border-b border-border">
          <!-- Organization switcher -->
          <div class="flex items-center gap-2 min-w-0">
            @if (workspace.organizations().length) {
              <select
                data-testid="org-switcher"
                aria-label="Cambiar organización"
                class="rounded-md border border-border bg-background px-3 py-1.5 text-sm"
                (change)="onSwitch(asValue($event))"
              >
                @for (org of workspace.organizations(); track org.id) {
                  <option [value]="org.id" [selected]="org.id === store.organizationId()">
                    {{ org.name }}
                  </option>
                }
              </select>
            } @else {
              <span class="text-sm text-muted-foreground">Sin organización</span>
            }
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
  protected readonly store = inject(AuthStore);
  protected readonly workspace = inject(WorkspaceStore);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

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
