import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { provideIcons } from '@ng-icons/core';
import { lucideFlaskConical } from '@ng-icons/lucide';
import { TranslocoPipe } from '@jsverse/transloco';
import { AuthStore } from '../../../../core/auth/auth.store';
import { PermissionsStore } from '../../../../core/authz/permissions.store';
import { WorkspaceApiService } from '../../data/workspace-api.service';
import { ProjectResponse } from '../../data/workspace.models';
import { NavIcon } from '../../../../shared/components/nav-icon/nav-icon';
import { DemoBadge } from '../../../../shared/components/demo-badge/demo-badge';
import { HlmIcon } from '../../../../shared/ui';
import { DemoRestore } from '../../components/demo-restore/demo-restore';

/**
 * Project landing page: a short header plus quick links into the project's
 * sections. A lightweight starting point — richer summary widgets (recent
 * sessions, backlog stats) can land here later.
 *
 * The organization's demo project carries a "Demo" badge and a banner explaining its sample data, with
 * the "restore sample data" action for callers who may change the project.
 */
@Component({
  selector: 'app-project-overview',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, NavIcon, DemoBadge, DemoRestore, HlmIcon, TranslocoPipe],
  viewProviders: [provideIcons({ lucideFlaskConical })],
  template: `
    <div class="flex flex-col gap-6">
      <div>
        <div class="flex flex-wrap items-center gap-2">
          <h1 class="text-2xl font-bold tracking-tight">
            {{ project()?.name ?? ('nav.projectFallback' | transloco) }}
          </h1>
          @if (isDemo()) {
            <app-demo-badge />
          }
        </div>
        <p class="mt-1 text-sm text-muted-foreground">{{ 'overview.subtitle' | transloco }}</p>
      </div>

      @if (isDemo()) {
        <section
          class="flex flex-col gap-4 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 sm:flex-row sm:items-center sm:justify-between"
          data-testid="demo-banner"
        >
          <div class="flex items-start gap-3">
            <span
              class="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400"
            >
              <hlm-icon name="lucideFlaskConical" size="18px" />
            </span>
            <div class="flex flex-col gap-0.5">
              <p class="text-sm font-medium">{{ 'demo.bannerTitle' | transloco }}</p>
              <p class="text-sm text-muted-foreground">{{ 'demo.bannerBody' | transloco }}</p>
            </div>
          </div>
          @if (canRestoreDemo()) {
            <app-demo-restore
              class="shrink-0"
              [projectId]="projectId()"
              (restored)="project.set($event)"
            />
          }
        </section>
      }

      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        @for (item of links(); track item) {
          <a
            [routerLink]="['/projects', projectId(), item]"
            class="group flex flex-col gap-2 rounded-2xl border border-border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-accent/40"
          >
            <span class="grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary">
              <app-nav-icon [name]="item" [size]="18" />
            </span>
            <span class="text-sm font-medium">{{ 'nav.' + item | transloco }}</span>
          </a>
        }
      </div>
    </div>
  `,
})
export class ProjectOverview {
  private readonly store = inject(AuthStore);
  private readonly permissions = inject(PermissionsStore);
  private readonly api = inject(WorkspaceApiService);

  readonly projectId = input.required<string>();
  protected readonly project = signal<ProjectResponse | null>(null);
  protected readonly isDemo = computed(() => this.project()?.demo === true);

  /** Restoring the sample data rewrites the project, so it takes the project-settings permission. */
  protected readonly canRestoreDemo = computed(
    () => this.permissions.isOrgOwnerOrAdmin() || this.permissions.has('PROJECT_UPDATE'),
  );

  /**
   * Quick-link cards, filtered to the sections the caller can actually open — a member
   * without a section's read permission shouldn't be offered a card that dead-ends in a
   * "no access" toast. Owner/admin bypass.
   * `settings` shows when any settings sub-page is reachable; the settings landing guard
   * then routes to the first accessible one.
   */
  protected readonly links = computed(() => {
    const can = (p: string) => this.permissions.isOrgOwnerOrAdmin() || this.permissions.has(p);
    const canMembers = can('MEMBER_READ');
    const canRoles = can('ROLE_READ');
    const canSettings = can('PROJECT_UPDATE') || canMembers || canRoles || can('PROJECT_DELETE');
    return [
      can('SESSION_READ') && 'sessions',
      can('STORY_READ') && 'stories',
      canMembers && 'members',
      canSettings && 'settings',
    ].filter((x): x is string => Boolean(x));
  });

  constructor() {
    effect(() => {
      const orgId = this.store.organizationId();
      const projectId = this.projectId();
      if (!orgId || !projectId) return;
      this.api.getProject(orgId, projectId).subscribe({
        next: (project) => this.project.set(project),
      });
    });
  }
}
