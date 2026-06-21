import { ChangeDetectionStrategy, Component, effect, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthStore } from '../../core/auth/auth.store';
import { WorkspaceStore } from '../../features/workspace/data/workspace.store';
import { ThemeToggle } from '../../shared/components/theme-toggle/theme-toggle';
import { Logo } from '../../shared/components/logo/logo';
import { UserMenu } from '../../shared/components/user-menu/user-menu';
import { OrgSwitcher } from '../../shared/components/org-switcher/org-switcher';

@Component({
  selector: 'app-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, ThemeToggle, Logo, UserMenu, OrgSwitcher],
  template: `
    <div class="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
      <!-- Floating header -->
      <header
        class="z-20 mx-3 mt-3 flex h-16 shrink-0 items-center justify-between gap-3 rounded-2xl border border-border bg-card/80 px-4 shadow-sm backdrop-blur md:mx-4 md:mt-4"
      >
        <div class="flex min-w-0 items-center gap-3">
          <app-logo [size]="28" />
          @if (workspace.organizations().length) {
            <span class="hidden h-6 w-px bg-border sm:block"></span>
            <app-org-switcher class="hidden sm:block" />
          }
        </div>

        <div class="flex items-center gap-1.5">
          <app-theme-toggle />
          <app-user-menu />
        </div>
      </header>

      <!-- Floating icon sidebar (desktop) -->
      <aside class="fixed left-3 top-1/2 z-30 hidden -translate-y-1/2 md:block">
        <nav
          class="flex flex-col items-center gap-1 rounded-2xl border border-border bg-card/80 p-2 shadow-lg backdrop-blur"
        >
          <a
            [routerLink]="['/projects']"
            routerLinkActive="bg-primary/15 text-primary"
            title="Proyectos"
            aria-label="Proyectos"
            class="grid h-10 w-10 place-items-center rounded-xl text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="19"
              height="19"
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
          </a>
          <a
            [routerLink]="['/members']"
            routerLinkActive="bg-primary/15 text-primary"
            title="Miembros"
            aria-label="Miembros"
            class="grid h-10 w-10 place-items-center rounded-xl text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="19"
              height="19"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path
                d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"
              />
            </svg>
          </a>
          <a
            [routerLink]="['/settings']"
            routerLinkActive="bg-primary/15 text-primary"
            title="Ajustes"
            aria-label="Ajustes"
            class="grid h-10 w-10 place-items-center rounded-xl text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="19"
              height="19"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <circle cx="12" cy="12" r="3" />
              <path
                d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"
              />
            </svg>
          </a>
        </nav>
      </aside>

      <!-- Content — only this region scrolls, never the whole page -->
      <main class="flex-1 overflow-y-auto px-3 pb-24 md:pb-8 md:pl-24 md:pr-6">
        <div class="mx-auto w-full max-w-6xl pt-6">
          <router-outlet />
        </div>
      </main>

      <!-- Bottom nav (mobile) — full width like the header -->
      <nav
        class="fixed inset-x-3 bottom-3 z-30 flex items-center gap-1 rounded-2xl border border-border bg-card/90 p-1.5 shadow-lg backdrop-blur md:hidden"
      >
        <a
          [routerLink]="['/projects']"
          routerLinkActive="bg-primary/15 text-primary"
          aria-label="Proyectos"
          class="flex flex-1 flex-col items-center gap-0.5 rounded-xl py-2 text-xs font-medium text-muted-foreground"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
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
        <a
          [routerLink]="['/members']"
          routerLinkActive="bg-primary/15 text-primary"
          aria-label="Miembros"
          class="flex flex-1 flex-col items-center gap-0.5 rounded-xl py-2 text-xs font-medium text-muted-foreground"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path
              d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"
            />
          </svg>
          Miembros
        </a>
        <a
          [routerLink]="['/settings']"
          routerLinkActive="bg-primary/15 text-primary"
          aria-label="Ajustes"
          class="flex flex-1 flex-col items-center gap-0.5 rounded-xl py-2 text-xs font-medium text-muted-foreground"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <circle cx="12" cy="12" r="3" />
            <path
              d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"
            />
          </svg>
          Ajustes
        </a>
      </nav>
    </div>
  `,
})
export class AppShell {
  protected readonly store = inject(AuthStore);
  protected readonly workspace = inject(WorkspaceStore);

  constructor() {
    effect(() => {
      if (this.store.isAuthenticated() && this.workspace.orgsState() === 'idle') {
        this.workspace.loadOrganizations();
      }
    });
  }
}
