import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { AuthStore } from '../../../../core/auth/auth.store';
import { WorkspaceApiService } from '../../data/workspace-api.service';
import { NavIcon } from '../../../../shared/components/nav-icon/nav-icon';

/**
 * Project landing page: a short header plus quick links into the project's
 * sections. A lightweight starting point — richer summary widgets (recent
 * sessions, backlog stats) can land here later.
 */
@Component({
  selector: 'app-project-overview',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, NavIcon, TranslocoPipe],
  template: `
    <div class="flex flex-col gap-6">
      <div>
        <h1 class="text-2xl font-bold tracking-tight">
          {{ projectName() ?? ('nav.projectFallback' | transloco) }}
        </h1>
        <p class="mt-1 text-sm text-muted-foreground">{{ 'overview.subtitle' | transloco }}</p>
      </div>

      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        @for (item of links; track item) {
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
  private readonly api = inject(WorkspaceApiService);

  readonly projectId = input.required<string>();
  protected readonly projectName = signal<string | null>(null);
  protected readonly links = ['sessions', 'stories', 'members', 'settings'];

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
