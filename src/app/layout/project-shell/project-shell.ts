import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthStore } from '../../core/auth/auth.store';
import { WorkspaceApiService } from '../../features/workspace/data/workspace-api.service';
import { ThemeToggle } from '../../shared/components/theme-toggle/theme-toggle';
import { Logo } from '../../shared/components/logo/logo';
import { UserMenu } from '../../shared/components/user-menu/user-menu';
import { NavIcon } from '../../shared/components/nav-icon/nav-icon';

/**
 * Workspace shell for a single project. Carries its own navigation (sessions,
 * stories, members, settings) and a breadcrumb back to the org's projects.
 */
@Component({
  selector: 'app-project-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, ThemeToggle, Logo, UserMenu, NavIcon],
  template: `
    <div class="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
      <header
        class="z-20 mx-3 mt-3 flex h-16 shrink-0 items-center justify-between gap-3 rounded-2xl border border-border bg-card/80 px-4 shadow-sm backdrop-blur md:mx-4 md:mt-4"
      >
        <div class="flex min-w-0 items-center gap-2.5">
          <app-logo [size]="28" [showText]="false" />
          <span class="hidden h-6 w-px bg-border sm:block"></span>
          <a
            routerLink="/projects"
            class="hidden shrink-0 text-sm text-muted-foreground transition-colors hover:text-foreground sm:block"
          >
            Proyectos
          </a>
          <svg
            class="hidden shrink-0 text-muted-foreground sm:block"
            xmlns="http://www.w3.org/2000/svg"
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="m9 18 6-6-6-6" />
          </svg>
          <span class="truncate text-sm font-semibold">{{ projectName() ?? 'Proyecto' }}</span>
        </div>
        <div class="flex items-center gap-1.5">
          <app-theme-toggle />
          <app-user-menu />
        </div>
      </header>

      <!-- Project nav rail (desktop) -->
      <aside class="fixed left-3 top-1/2 z-30 hidden -translate-y-1/2 md:block">
        <nav
          class="flex flex-col items-center gap-1 rounded-2xl border border-border bg-card/80 p-2 shadow-lg backdrop-blur"
        >
          @for (item of nav; track item.path) {
            <a
              [routerLink]="['/projects', projectId(), item.path]"
              routerLinkActive="bg-primary/15 text-primary"
              [title]="item.label"
              [attr.aria-label]="item.label"
              class="grid h-10 w-10 place-items-center rounded-xl text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <app-nav-icon [name]="item.path" />
            </a>
          }
        </nav>
      </aside>

      <main class="flex-1 overflow-y-auto px-3 pb-24 md:pb-8 md:pl-24 md:pr-6">
        <div class="mx-auto w-full max-w-6xl pt-6">
          <router-outlet />
        </div>
      </main>

      <!-- Bottom nav (mobile) -->
      <nav
        class="fixed inset-x-3 bottom-3 z-30 flex items-center gap-1 rounded-2xl border border-border bg-card/90 p-1.5 shadow-lg backdrop-blur md:hidden"
      >
        @for (item of nav; track item.path) {
          <a
            [routerLink]="['/projects', projectId(), item.path]"
            routerLinkActive="bg-primary/15 text-primary"
            [attr.aria-label]="item.label"
            class="flex flex-1 flex-col items-center gap-0.5 rounded-xl py-2 text-xs font-medium text-muted-foreground"
          >
            <app-nav-icon [name]="item.path" [size]="20" />
            {{ item.label }}
          </a>
        }
      </nav>
    </div>
  `,
})
export class ProjectShell {
  private readonly store = inject(AuthStore);
  private readonly api = inject(WorkspaceApiService);

  readonly projectId = input.required<string>();
  protected readonly projectName = signal<string | null>(null);

  protected readonly nav = [
    { path: 'sessions', label: 'Sesiones' },
    { path: 'stories', label: 'Historias' },
    { path: 'members', label: 'Miembros' },
    { path: 'settings', label: 'Ajustes' },
  ];

  constructor() {
    effect(() => {
      const orgId = this.store.organizationId();
      const projectId = this.projectId();
      if (!orgId || !projectId) return;
      this.api.getProject(orgId, projectId).subscribe({
        next: (project) => this.projectName.set(project.name),
      });
    });
  }
}
