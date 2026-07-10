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
import { PermissionsStore } from '../../core/authz/permissions.store';
import { OrgRole } from '../../core/authz/permissions.models';
import { PageTitleService } from '../../core/layout/page-title.service';
import { modLabel } from '../../core/platform/shortcut';
import { WorkspaceStore } from '../../features/workspace/data/workspace.store';
import { OrgSwitcher } from '../../shared/components/org-switcher/org-switcher';
import { ProjectSwitcher } from '../../shared/components/project-switcher/project-switcher';
import { UserMenu } from '../../shared/components/user-menu/user-menu';
import { NavIcon } from '../../shared/components/nav-icon/nav-icon';
import { CommandPalette } from '../../shared/components/command-palette/command-palette';
import { ToastHost } from '../../shared/toast/toast-host';
import { RecordingMinibar } from '../../features/discovery/components/recording-minibar/recording-minibar';
import { IntegrationJobsBanner } from '../../features/workspace/components/integration-jobs-banner/integration-jobs-banner';
import { HlmIcon } from '../../shared/ui';

interface NavItem {
  /** Route segment + i18n key (`nav.<seg>`) + nav-icon name. */
  seg: string;
  /** Router link commands for this item (precomputed per active context). */
  link: unknown[];
  /** When true the item is a disabled placeholder rendered with a "Soon" badge. */
  soon?: boolean;
}

/**
 * A nav item template before its link is resolved. `permission` / `role` (when set)
 * gate the item to callers who hold that project permission / org role — used to hide
 * settings entries a member can't reach.
 */
interface NavSeg {
  seg: string;
  soon?: boolean;
  permission?: string;
  role?: OrgRole;
}

/** The sidebar context derived from the URL: which nav list, back link and heading to show. */
interface NavContext {
  /** A back link shown above the list (e.g. "← All Projects"); null in the root contexts. */
  back: { link: unknown[]; labelKey: string; label?: string } | null;
  /** Optional heading shown under the back link (e.g. "Settings"). */
  headingKey?: string;
  /** i18n key for the nav's aria-label. */
  ariaKey: string;
  /** The nav items to render, links already resolved. */
  items: NavItem[];
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
    ToastHost,
    RecordingMinibar,
    IntegrationJobsBanner,
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
          [attr.aria-label]="navContext().ariaKey | transloco"
        >
          @if (navContext().back; as back) {
            <a
              [routerLink]="back.link"
              class="mb-1 flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <hlm-icon name="lucideChevronLeft" size="16px" />
              <span class="truncate">{{ back.label ?? (back.labelKey | transloco) }}</span>
            </a>
          }
          @if (navContext().headingKey; as headingKey) {
            <span
              class="px-3 pt-1 pb-1.5 text-[11px] font-medium tracking-wide text-muted-foreground/70 uppercase"
              >{{ headingKey | transloco }}</span
            >
          }
          @for (item of navContext().items; track item.seg) {
            @if (item.soon) {
              <span
                class="flex cursor-default items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground/50"
              >
                <app-nav-icon [name]="item.seg" [size]="18" />
                <span class="flex-1">{{ 'nav.' + item.seg | transloco }}</span>
                <span
                  class="rounded-full border border-border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground/70"
                  >{{ 'nav.soon' | transloco }}</span
                >
              </span>
            } @else {
              <a
                [routerLink]="item.link"
                routerLinkActive="nav-link-active bg-primary/15 text-primary"
                [routerLinkActiveOptions]="{ exact: item.seg === 'projects' }"
                class="nav-link flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
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

    <div class="app-ambient relative isolate flex h-dvh overflow-hidden text-foreground">
      <!-- Very subtle full-app dot-grid texture under the content (both themes). -->
      <div
        class="app-ambient-grid-subtle pointer-events-none absolute inset-0 -z-10"
        aria-hidden="true"
      ></div>

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

        <!-- Global background-job progress (Jira import / push-all), any page of the project. -->
        <app-integration-jobs-banner [projectId]="projectId()" />

        <main class="min-h-0 flex-1 overflow-y-auto px-4 pb-20 pt-5 md:px-6 md:pb-8">
          <div class="mx-auto flex h-full w-full max-w-5xl flex-col">
            <router-outlet />
          </div>
        </main>
      </div>
    </div>

    <app-command-palette [(open)]="paletteOpen" />
    <app-toast-host />
    <app-recording-minibar />
  `,
  styles: [
    `
      /* Sidebar active-route indicator: a short accent bar that grows in on the left
       * edge of the active nav link. */
      .nav-link {
        position: relative;
      }
      .nav-link::before {
        content: '';
        position: absolute;
        left: 0;
        top: 50%;
        height: 0;
        width: 3px;
        border-radius: 9999px;
        background: var(--primary);
        transform: translateY(-50%);
        transition: height 200ms cubic-bezier(0.16, 1, 0.3, 1);
      }
      .nav-link-active::before {
        height: 1.15rem;
      }
      @media (prefers-reduced-motion: reduce) {
        .nav-link::before {
          transition: none;
        }
      }
    `,
  ],
})
export class Shell {
  protected readonly auth = inject(AuthStore);
  protected readonly workspace = inject(WorkspaceStore);
  private readonly permissions = inject(PermissionsStore);
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

  // Nav item segments per context; links are resolved in `navContext()` where the
  // active project id is known. `soon` marks disabled placeholder items. `permission`
  // / `role` gate the item to what the caller may reach — items they can't use are
  // filtered out so the aside never offers a dead end (the guards + backend still enforce).
  private readonly orgRootSegs: NavSeg[] = [{ seg: 'projects' }, { seg: 'settings' }];
  private readonly orgSettingsSegs: NavSeg[] = [
    { seg: 'general', role: 'OWNER' },
    { seg: 'members', role: 'ADMIN' },
    { seg: 'billing' },
    { seg: 'integrations' },
    { seg: 'usage' },
  ];
  private readonly projectRootSegs: NavSeg[] = [
    { seg: 'overview' },
    { seg: 'sessions' },
    { seg: 'stories' },
    { seg: 'glossary' },
    { seg: 'constraints' },
    { seg: 'settings' },
  ];
  private readonly projectSettingsSegs: NavSeg[] = [
    { seg: 'general', permission: 'PROJECT_UPDATE' },
    { seg: 'roles', permission: 'ROLE_READ' },
    { seg: 'members', permission: 'MEMBER_READ' },
    { seg: 'integrations' },
    { seg: 'danger', permission: 'PROJECT_DELETE' },
  ];
  private readonly accountSegs: NavSeg[] = [
    { seg: 'profile' },
    { seg: 'security' },
    { seg: 'appearance' },
    { seg: 'notifications', soon: true },
    { seg: 'tokens', soon: true },
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

  /** True when the URL is within the settings sub-tree of the current context. */
  private readonly inSettings = computed(() => {
    const url = this.url();
    const pid = this.projectId();
    return pid ? /\/settings(\/|$|\?|#)/.test(url) : /^\/settings(\/|$|\?|#)/.test(url);
  });

  /** True when the URL is within the personal account sub-tree. */
  private readonly inAccount = computed(() => this.url().startsWith('/account'));

  /** The open project's display name (falls back to a translated placeholder). */
  private readonly projectName = computed(() => {
    const pid = this.projectId();
    if (!pid) return undefined;
    return this.workspace.projects().find((p) => p.id === pid)?.name;
  });

  /**
   * The sidebar context derived from the URL. One of five: account, org settings,
   * org root, project settings, project root. Each supplies its back link, heading
   * and the fully-resolved nav item links.
   */
  protected readonly navContext = computed<NavContext>(() => {
    const pid = this.projectId();

    // Personal account — standalone, not nested under an organization.
    if (this.inAccount()) {
      return {
        back: { link: ['/projects'], labelKey: 'nav.allProjects' },
        headingKey: 'nav.account',
        ariaKey: 'nav.accountAria',
        items: this.accountSegs.map((s) => ({
          seg: s.seg,
          link: ['/account', s.seg],
          soon: s.soon,
        })),
      };
    }

    if (pid) {
      // Project settings sub-nav.
      if (this.inSettings()) {
        return {
          back: {
            link: ['/projects', pid, 'overview'],
            labelKey: 'nav.projectFallback',
            label: this.projectName(),
          },
          headingKey: 'nav.settings',
          ariaKey: 'nav.projectAria',
          items: this.visibleSegs(this.projectSettingsSegs).map((s) => ({
            seg: s.seg,
            link: ['/projects', pid, 'settings', s.seg],
            soon: s.soon,
          })),
        };
      }
      // Project root.
      return {
        back: { link: ['/projects'], labelKey: 'nav.allProjects' },
        ariaKey: 'nav.projectAria',
        items: this.projectRootSegs.map((s) => ({
          seg: s.seg,
          link: ['/projects', pid, s.seg],
        })),
      };
    }

    // Org settings sub-nav.
    if (this.inSettings()) {
      return {
        back: { link: ['/projects'], labelKey: 'nav.allProjects' },
        headingKey: 'nav.settings',
        ariaKey: 'nav.orgAria',
        items: this.visibleSegs(this.orgSettingsSegs).map((s) => ({
          seg: s.seg,
          link: ['/settings', s.seg],
          soon: s.soon,
        })),
      };
    }

    // Org root.
    return {
      back: null,
      ariaKey: 'nav.orgAria',
      items: this.orgRootSegs.map((s) => ({ seg: s.seg, link: ['/' + s.seg] })),
    };
  });

  /**
   * Keeps only the nav segments the caller may reach: an item with a `role` needs that
   * org role (owner always passes; `'ADMIN'` admits owner + admin), an item with a
   * `permission` needs that project permission (owner/admin bypass). Ungated items always
   * show. Reads the permission signals so the list re-renders when authorization arrives.
   */
  private visibleSegs(segs: NavSeg[]): NavSeg[] {
    return segs.filter((s) => {
      if (s.role) {
        const ok =
          s.role === 'OWNER' ? this.permissions.isOrgOwner() : this.permissions.isOrgOwnerOrAdmin();
        if (!ok) return false;
      }
      if (s.permission && !this.permissions.has(s.permission)) return false;
      return true;
    });
  }

  /** Breadcrumb trail for the top bar: the context ancestors (clickable) then the
   * current page title. Sub-nav pages (settings/account sections) get an extra
   * "Settings"/"Account" crumb so the trail reads e.g. "<project> / Settings / General". */
  protected readonly crumbs = computed<Crumb[]>(() => {
    const key = this.titleKey();
    const items: Crumb[] = [];

    // Personal pages (the user's own account) aren't nested under an organization.
    if (this.inAccount()) {
      items.push({ key: 'nav.account', link: ['/account'] });
      if (key) items.push({ key, link: null });
      return items;
    }

    const pid = this.projectId();
    if (pid) {
      items.push({
        label: this.projectName(),
        key: 'nav.projectFallback',
        link: ['/projects', pid, 'overview'],
      });
      if (this.inSettings()) {
        items.push({ key: 'nav.settings', link: ['/projects', pid, 'settings'] });
      }
    } else {
      const orgId = this.auth.organizationId();
      const org = this.workspace.organizations().find((o) => o.id === orgId);
      items.push({ label: org?.name, key: 'orgSwitcher.fallbackName', link: ['/projects'] });
      if (this.inSettings()) {
        items.push({ key: 'nav.settings', link: ['/settings'] });
      }
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
    // Load the caller's org authorization (role + base permission) whenever an org
    // context is active, so the aside can gate settings entries by role/permission.
    effect(() => {
      const orgId = this.auth.organizationId();
      if (orgId) this.permissions.loadOrgAuthorization(orgId).subscribe();
    });
    // Load the caller's effective project permissions on entering a project; reset them
    // on leaving so the next project never briefly shows the previous one's grants.
    effect(() => {
      const pid = this.projectId();
      if (pid) this.permissions.loadProjectPermissions(pid).subscribe();
      else this.permissions.resetProject();
    });
    // Close the mobile drawer whenever navigation completes.
    effect(() => {
      this.url();
      this.mobileOpen.set(false);
    });
  }
}
