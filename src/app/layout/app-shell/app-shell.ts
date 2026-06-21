import { ChangeDetectionStrategy, Component, effect, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthStore } from '../../core/auth/auth.store';
import { WorkspaceStore } from '../../features/workspace/data/workspace.store';
import { ThemeToggle } from '../../shared/components/theme-toggle/theme-toggle';
import { Logo } from '../../shared/components/logo/logo';
import { UserMenu } from '../../shared/components/user-menu/user-menu';
import { OrgSwitcher } from '../../shared/components/org-switcher/org-switcher';
import { NavIcon } from '../../shared/components/nav-icon/nav-icon';

/**
 * Organization workspace shell: a flat top bar (logo + org switcher + user
 * menu) and a labelled side nav (projects / members / settings), matching the
 * project workspace's app-window styling.
 */
@Component({
  selector: 'app-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    ThemeToggle,
    Logo,
    UserMenu,
    OrgSwitcher,
    NavIcon,
  ],
  template: `
    <div class="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
      <!-- Top bar -->
      <header
        class="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border px-4"
      >
        <div class="flex min-w-0 items-center gap-2.5">
          <app-logo [size]="26" />
          @if (workspace.organizations().length) {
            <span class="hidden h-5 w-px bg-border sm:block"></span>
            <app-org-switcher class="hidden sm:block" />
          }
        </div>
        <div class="flex items-center gap-1.5">
          <app-theme-toggle />
          <app-user-menu />
        </div>
      </header>

      <div class="flex flex-1 overflow-hidden">
        <!-- Side nav (desktop) -->
        <aside
          class="hidden w-56 shrink-0 flex-col border-r border-border p-3 md:flex"
          aria-label="Navegación de la organización"
        >
          <nav class="flex flex-col gap-1">
            @for (item of nav; track item.path) {
              <a
                [routerLink]="['/' + item.path]"
                routerLinkActive="bg-primary/15 text-primary"
                class="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <app-nav-icon [name]="item.path" [size]="18" />
                {{ item.label }}
              </a>
            }
          </nav>
        </aside>

        <main class="flex-1 overflow-y-auto px-4 pb-24 pt-5 md:px-6 md:pb-6">
          <div class="mx-auto w-full max-w-6xl">
            <router-outlet />
          </div>
        </main>
      </div>

      <!-- Bottom nav (mobile) -->
      <nav
        class="flex shrink-0 items-center gap-1 border-t border-border bg-background p-1.5 md:hidden"
      >
        @for (item of nav; track item.path) {
          <a
            [routerLink]="['/' + item.path]"
            routerLinkActive="bg-primary/15 text-primary"
            [attr.aria-label]="item.label"
            class="flex flex-1 flex-col items-center gap-0.5 rounded-xl py-1.5 text-xs font-medium text-muted-foreground"
          >
            <app-nav-icon [name]="item.path" [size]="20" />
            {{ item.label }}
          </a>
        }
      </nav>
    </div>
  `,
})
export class AppShell {
  protected readonly store = inject(AuthStore);
  protected readonly workspace = inject(WorkspaceStore);

  protected readonly nav = [
    { path: 'projects', label: 'Proyectos' },
    { path: 'members', label: 'Miembros' },
    { path: 'settings', label: 'Ajustes' },
  ];

  constructor() {
    effect(() => {
      if (this.store.isAuthenticated() && this.workspace.orgsState() === 'idle') {
        this.workspace.loadOrganizations();
      }
    });
  }
}
