import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { NgTemplateOutlet } from '@angular/common';
import { provideIcons } from '@ng-icons/core';
import { lucideChevronLeft, lucideMenu, lucideSearch, lucideX } from '@ng-icons/lucide';
import { TranslocoPipe } from '@jsverse/transloco';
import { AuthStore } from '../../core/auth/auth.store';
import { PageTitleService } from '../../core/layout/page-title.service';
import { modLabel } from '../../core/platform/shortcut';
import { WorkspaceStore } from '../../features/workspace/data/workspace.store';
import { OrgSwitcher } from '../../shared/components/org-switcher/org-switcher';
import { ProjectSwitcher } from '../../shared/components/project-switcher/project-switcher';
import { UserMenu } from '../../shared/components/user-menu/user-menu';
import { NavIcon } from '../../shared/components/nav-icon/nav-icon';
import { CommandPalette } from '../../shared/components/command-palette/command-palette';
import { HlmIcon } from '../../shared/ui';

interface NavItem {
  /** Route segment + i18n key (`nav.<seg>`) + nav-icon name. */
  seg: string;
}

interface Crumb {
  /** Raw label (entity name); when absent, `key` is translated instead. */
  label?: string;
  /** i18n fallback key (used when `label` is empty). */
  key: string;
  /** Router link for an ancestor crumb, or null for the current page. */
  link: unknown[] | null;
}

/**
 * Unified workspace shell (Vercel-style): a full-height sidebar — org switcher,
 * search, a context-aware nav and the user menu at the foot — plus a top bar with
 * the project switcher and the current page title. The nav switches between the
 * organization context (projects / members / settings) and a single project's
 * context (overview / sessions / stories / members / settings), derived from the
 * URL. On phones the sidebar collapses into a drawer toggled from the top bar.
 */
@Component({
  selector: 'app-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    NgTemplateOutlet,
    OrgSwitcher,
    ProjectSwitcher,
    UserMenu,
    NavIcon,
    CommandPalette,
    HlmIcon,
    TranslocoPipe,
  ],
  viewProviders: [provideIcons({ lucideSearch, lucideMenu, lucideX, lucideChevronLeft })],
  template: `
    <!-- Sidebar content, reused by the desktop aside and the mobile drawer. -->
    <ng-template #sidebar>
      <div class="flex h-full flex-col gap-3 p-3">
        <app-org-switcher />

        <button
          type="button"
          (click)="paletteOpen.set(true)"
          [attr.aria-label]="'commandPalette.open' | transloco"
          data-testid="open-command-palette"
          class="flex items-center gap-2 rounded-lg border border-border bg-secondary/40 px-2.5 transition-colors hover:bg-accent"
        >
          <hlm-icon name="lucideSearch" size="15px" class="shrink-0 text-muted-foreground" />
          <span class="h-9 flex-1 content-center text-left text-sm text-muted-foreground">{{
            'nav.find' | transloco
          }}</span>
          <kbd
            class="rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground"
            aria-hidden="true"
            >{{ shortcut }}</kbd
          >
        </button>

        <nav
          class="flex flex-1 flex-col gap-0.5 overflow-y-auto"
          [attr.aria-label]="(projectId() ? 'nav.projectAria' : 'nav.orgAria') | transloco"
        >
          @if (projectId(); as pid) {
            <a
              routerLink="/projects"
              class="mb-1 flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <hlm-icon name="lucideChevronLeft" size="16px" />
              {{ 'nav.allProjects' | transloco }}
            </a>
            @for (item of filteredNav(); track item.seg) {
              <a
                [routerLink]="['/projects', pid, item.seg]"
                routerLinkActive="bg-primary/15 text-primary"
                class="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <app-nav-icon [name]="item.seg" [size]="18" />
                {{ 'nav.' + item.seg | transloco }}
              </a>
            }
          } @else {
            @for (item of filteredNav(); track item.seg) {
              <a
                [routerLink]="['/' + item.seg]"
                routerLinkActive="bg-primary/15 text-primary"
                [routerLinkActiveOptions]="{ exact: item.seg === 'projects' }"
                class="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <app-nav-icon [name]="item.seg" [size]="18" />
                {{ 'nav.' + item.seg | transloco }}
              </a>
            }
          }
        </nav>

        <div class="border-t border-border pt-2">
          <app-user-menu />
        </div>
      </div>
    </ng-template>

    <div class="app-ambient flex h-dvh overflow-hidden text-foreground">
      <!-- Sidebar (desktop) -->
      <aside class="hidden w-60 shrink-0 border-r border-border md:block">
        <ng-container [ngTemplateOutlet]="sidebar" />
      </aside>

      <!-- Sidebar (mobile drawer) -->
      @if (mobileOpen()) {
        <div
          class="fixed inset-0 z-40 bg-black/50 md:hidden"
          aria-hidden="true"
          (click)="mobileOpen.set(false)"
        ></div>
        <aside
          class="fixed inset-y-0 left-0 z-50 w-72 border-r border-border bg-background md:hidden"
        >
          <ng-container [ngTemplateOutlet]="sidebar" />
        </aside>
      }

      <div class="flex min-w-0 flex-1 flex-col">
        <!-- Top bar -->
        <header
          class="grid h-14 shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-3 border-b border-border px-3 md:px-4"
        >
          <div class="flex min-w-0 items-center gap-2">
            <button
              type="button"
              (click)="mobileOpen.set(true)"
              [attr.aria-label]="'nav.openMenu' | transloco"
              class="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground md:hidden"
            >
              <hlm-icon name="lucideMenu" size="18px" />
            </button>

            <app-project-switcher [currentProjectId]="projectId()" />
          </div>

          <nav
            class="col-start-2 hidden max-w-full items-center gap-1.5 truncate text-sm sm:flex"
            aria-label="Breadcrumb"
          >
            @for (crumb of crumbs(); track $index; let last = $last; let first = $first) {
              @if (!first) {
                <span class="text-muted-foreground/40" aria-hidden="true">/</span>
              }
              @if (crumb.link && !last) {
                <a
                  [routerLink]="crumb.link"
                  class="truncate text-muted-foreground transition-colors hover:text-foreground"
                  >{{ crumb.label ?? (crumb.key | transloco) }}</a
                >
              } @else {
                <span class="truncate font-medium">{{
                  crumb.label ?? (crumb.key | transloco)
                }}</span>
              }
            }
          </nav>
        </header>

        <main class="flex-1 overflow-y-auto px-4 pb-20 pt-5 md:px-6 md:pb-8">
          <div class="mx-auto w-full max-w-5xl">
            <router-outlet />
          </div>
        </main>
      </div>
    </div>

    <app-command-palette [(open)]="paletteOpen" />
  `,
})
export class Shell {
  protected readonly auth = inject(AuthStore);
  protected readonly workspace = inject(WorkspaceStore);
  private readonly router = inject(Router);
  private readonly pageTitle = inject(PageTitleService);

  protected readonly titleKey = this.pageTitle.titleKey;
  protected readonly shortcut = modLabel('K');
  protected readonly mobileOpen = signal(false);
  protected readonly paletteOpen = signal(false);

  /** Open the command palette on Cmd/Ctrl+K from anywhere in the shell. */
  @HostListener('document:keydown', ['$event'])
  protected onDocumentKeydown(event: KeyboardEvent): void {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      this.paletteOpen.update((v) => !v);
    }
  }

  private readonly orgNav: NavItem[] = [
    { seg: 'projects' },
    { seg: 'members' },
    { seg: 'settings' },
  ];
  private readonly projectNav: NavItem[] = [
    { seg: 'overview' },
    { seg: 'sessions' },
    { seg: 'stories' },
    { seg: 'members' },
    { seg: 'settings' },
  ];

  private readonly url = toSignal(
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      map((e) => (e as NavigationEnd).urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );

  /** The open project's id, or null in the organization ("All Projects") context. */
  protected readonly projectId = computed(() => {
    const match = /\/projects\/([^/?#]+)/.exec(this.url());
    return match ? decodeURIComponent(match[1]) : null;
  });

  protected readonly filteredNav = computed(() =>
    this.projectId() ? this.projectNav : this.orgNav,
  );

  /** Breadcrumb trail for the top bar: the org/project context (clickable) then the
   * current page title. */
  protected readonly crumbs = computed<Crumb[]>(() => {
    const key = this.titleKey();
    // Personal pages (the user's own account) aren't nested under an organization.
    if (this.url().startsWith('/account')) {
      return key ? [{ key, link: null }] : [];
    }
    const items: Crumb[] = [];
    const pid = this.projectId();
    if (pid) {
      const project = this.workspace.projects().find((p) => p.id === pid);
      items.push({
        label: project?.name,
        key: 'nav.projectFallback',
        link: ['/projects', pid, 'overview'],
      });
    } else {
      const orgId = this.auth.organizationId();
      const org = this.workspace.organizations().find((o) => o.id === orgId);
      items.push({ label: org?.name, key: 'orgSwitcher.fallbackName', link: ['/projects'] });
    }
    if (key) items.push({ key, link: null });
    return items;
  });

  constructor() {
    // Org list powers the org switcher; project list powers the project switcher label.
    effect(() => {
      if (this.auth.isAuthenticated() && this.workspace.orgsState() === 'idle') {
        this.workspace.loadOrganizations();
      }
    });
    effect(() => {
      const orgId = this.auth.organizationId();
      if (orgId && this.workspace.projectsState() === 'idle') this.workspace.loadProjects(orgId);
    });
    // Close the mobile drawer whenever navigation completes.
    effect(() => {
      this.url();
      this.mobileOpen.set(false);
    });
  }
}
