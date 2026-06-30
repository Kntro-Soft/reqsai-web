import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { provideIcons } from '@ng-icons/core';
import { lucideChevronRight, lucidePlus } from '@ng-icons/lucide';
import { TranslocoPipe } from '@jsverse/transloco';
import { AuthStore } from '../../core/auth/auth.store';
import { WorkspaceApiService } from '../../features/workspace/data/workspace-api.service';
import { ThemeToggle } from '../../shared/components/theme-toggle/theme-toggle';
import { Logo } from '../../shared/components/logo/logo';
import { UserMenu } from '../../shared/components/user-menu/user-menu';
import { NavIcon } from '../../shared/components/nav-icon/nav-icon';
import { HlmIcon } from '../../shared/ui';

/**
 * Workspace shell for a single project: a top bar with the org/project
 * breadcrumb, a labelled side nav (sessions / stories / members / settings),
 * and the project content. Flat app-window styling.
 */
@Component({
  selector: 'app-project-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    ThemeToggle,
    Logo,
    UserMenu,
    NavIcon,
    HlmIcon,
    TranslocoPipe,
  ],
  viewProviders: [provideIcons({ lucideChevronRight, lucidePlus })],
  template: `
    <div class="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
      <!-- Top bar -->
      <header
        class="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border px-4"
      >
        <div class="flex min-w-0 items-center gap-2.5">
          <app-logo [size]="26" [showText]="false" />
          <span class="hidden h-5 w-px bg-border sm:block"></span>
          <a
            routerLink="/projects"
            class="hidden shrink-0 text-sm text-muted-foreground transition-colors hover:text-foreground sm:block"
          >
            {{ 'nav.projects' | transloco }}
          </a>
          <hlm-icon
            name="lucideChevronRight"
            size="14px"
            class="hidden shrink-0 text-muted-foreground sm:block"
          />
          <span class="truncate text-sm font-semibold">{{
            projectName() ?? ('nav.projectFallback' | transloco)
          }}</span>
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
          aria-label="Navegación del proyecto"
        >
          <nav class="flex flex-col gap-1">
            @for (item of nav; track item.path) {
              <a
                [routerLink]="['/projects', projectId(), item.path]"
                routerLinkActive="bg-primary/15 text-primary"
                class="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <app-nav-icon [name]="item.path" [size]="18" />
                {{ 'nav.' + item.path | transloco }}
              </a>
            }
          </nav>
          <a
            [routerLink]="['/projects', projectId(), 'sessions']"
            class="mt-auto flex items-center gap-2 border-t border-border px-3 pt-4 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <hlm-icon name="lucidePlus" size="16px" />
            {{ 'nav.newSession' | transloco }}
          </a>
        </aside>

        <main class="flex-1 overflow-y-auto px-4 pb-24 pt-5 md:px-6 md:pb-6">
          <div class="mx-auto w-full max-w-5xl">
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
            [routerLink]="['/projects', projectId(), item.path]"
            routerLinkActive="bg-primary/15 text-primary"
            [attr.aria-label]="'nav.' + item.path | transloco"
            class="flex flex-1 flex-col items-center gap-0.5 rounded-xl py-1.5 text-xs font-medium text-muted-foreground"
          >
            <app-nav-icon [name]="item.path" [size]="20" />
            {{ 'nav.' + item.path | transloco }}
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
    { path: 'sessions' },
    { path: 'stories' },
    { path: 'members' },
    { path: 'settings' },
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
