import { ChangeDetectionStrategy, Component, effect, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { AuthStore } from '../../core/auth/auth.store';
import { WorkspaceStore } from '../../features/workspace/data/workspace.store';
import { ThemeToggle } from '../../shared/components/theme-toggle/theme-toggle';
import { Logo } from '../../shared/components/logo/logo';
import { UserMenu } from '../../shared/components/user-menu/user-menu';

@Component({
  selector: 'app-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, ThemeToggle, Logo, UserMenu],
  template: `
    <div class="relative min-h-dvh bg-background text-foreground">
      <!-- Floating header -->
      <header
        class="sticky top-0 z-20 mx-3 flex h-16 items-center justify-between gap-3 rounded-2xl border border-border bg-card/80 px-4 shadow-sm backdrop-blur md:mx-4 md:mt-4"
      >
        <div class="flex min-w-0 items-center gap-3">
          <app-logo [size]="28" />
          @if (workspace.organizations().length) {
            <span class="hidden h-6 w-px bg-border sm:block"></span>
            <div class="relative hidden sm:block">
              <span
                class="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
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
                  <path d="M3 21h18M5 21V7l8-4v18M19 21V11l-6-4M9 9v.01M9 12v.01M9 15v.01" />
                </svg>
              </span>
              <select
                data-testid="org-switcher"
                aria-label="Cambiar organización"
                class="w-44 appearance-none truncate rounded-lg border border-border bg-secondary/60 py-1.5 pl-8 pr-7 text-sm font-medium transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                (change)="onSwitch(asValue($event))"
              >
                @for (org of workspace.organizations(); track org.id) {
                  <option [value]="org.id" [selected]="org.id === store.organizationId()">
                    {{ org.name }}
                  </option>
                }
              </select>
              <span
                class="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="13"
                  height="13"
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
            [routerLink]="['/home']"
            routerLinkActive="bg-primary/15 text-primary"
            title="Inicio"
            aria-label="Inicio"
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
              <path d="M3 9.5 12 3l9 6.5V21a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z" />
            </svg>
          </a>
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
        </nav>
      </aside>

      <!-- Content -->
      <main class="px-3 pb-24 md:pb-8 md:pl-24 md:pr-6">
        <div class="mx-auto w-full max-w-6xl pt-6">
          <router-outlet />
        </div>
      </main>

      <!-- Bottom nav (mobile) — full width like the header -->
      <nav
        class="fixed inset-x-3 bottom-3 z-30 flex items-center gap-1 rounded-2xl border border-border bg-card/90 p-1.5 shadow-lg backdrop-blur md:hidden"
      >
        <a
          [routerLink]="['/home']"
          routerLinkActive="bg-primary/15 text-primary"
          aria-label="Inicio"
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
            <path d="M3 9.5 12 3l9 6.5V21a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z" />
          </svg>
          Inicio
        </a>
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
      </nav>
    </div>
  `,
})
export class AppShell {
  protected readonly store = inject(AuthStore);
  protected readonly workspace = inject(WorkspaceStore);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  constructor() {
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
}
