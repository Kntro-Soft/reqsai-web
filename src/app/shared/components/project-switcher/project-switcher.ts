import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { OverlayModule } from '@angular/cdk/overlay';
import { provideIcons } from '@ng-icons/core';
import { lucideChevronsUpDown, lucidePlus, lucideSearch } from '@ng-icons/lucide';
import { TranslocoPipe } from '@jsverse/transloco';
import { AuthStore } from '../../../core/auth/auth.store';
import { WorkspaceStore } from '../../../features/workspace/data/workspace.store';
import { ProjectResponse } from '../../../features/workspace/data/workspace.models';
import { Avatar } from '../avatar/avatar';
import { BELOW_START } from '../popover/popover-positions';
import { HlmIcon } from '../../ui';

/**
 * Top-bar project switcher (Vercel "All Projects ⌄"). Shows the active project's
 * name when inside one, otherwise "All Projects"; the popover (CDK overlay) lets
 * the user search and jump to any project or create a new one. Picking "All
 * Projects" via the breadcrumb returns to the org overview.
 */
@Component({
  selector: 'app-project-switcher',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [OverlayModule, FormsModule, Avatar, HlmIcon, TranslocoPipe],
  viewProviders: [provideIcons({ lucideChevronsUpDown, lucidePlus, lucideSearch })],
  template: `
    <button
      type="button"
      cdkOverlayOrigin
      #origin="cdkOverlayOrigin"
      (click)="toggle()"
      [attr.aria-expanded]="open()"
      aria-haspopup="dialog"
      [attr.aria-label]="'projectSwitcher.ariaLabel' | transloco"
      data-testid="project-switcher"
      class="flex items-center gap-2 rounded-lg px-2 py-1 text-sm font-semibold transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      @if (activeProject(); as p) {
        <app-avatar [name]="p.name" [seed]="p.id" [imageUrl]="p.avatarUrl" [size]="20" />
      }
      <span class="max-w-[12rem] truncate">{{
        activeProject()?.name ?? ('nav.allProjects' | transloco)
      }}</span>
      <hlm-icon name="lucideChevronsUpDown" size="14px" class="shrink-0 text-muted-foreground" />
    </button>

    <ng-template
      cdkConnectedOverlay
      [cdkConnectedOverlayOrigin]="origin"
      [cdkConnectedOverlayOpen]="open()"
      [cdkConnectedOverlayPositions]="positions"
      (overlayOutsideClick)="close()"
      (overlayKeydown)="onKeydown($event)"
      (detach)="close()"
    >
      <div
        role="dialog"
        class="w-72 overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-xl"
      >
        <div class="flex items-center gap-2 border-b border-border px-3">
          <hlm-icon name="lucideSearch" size="15px" class="shrink-0 text-muted-foreground" />
          <input
            type="text"
            [ngModel]="query()"
            (ngModelChange)="query.set($event)"
            [placeholder]="'projectSwitcher.search' | transloco"
            class="h-10 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            data-testid="project-search"
          />
          <kbd
            class="rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground"
            aria-hidden="true"
            >Esc</kbd
          >
        </div>

        <div class="max-h-64 overflow-y-auto p-1">
          @for (project of filtered(); track project.id) {
            <button
              type="button"
              data-testid="project-option"
              [attr.aria-current]="project.id === currentProjectId()"
              (click)="select(project)"
              class="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors hover:bg-accent"
            >
              <app-avatar
                [name]="project.name"
                [seed]="project.id"
                [imageUrl]="project.avatarUrl"
                [size]="22"
              />
              <span class="min-w-0 flex-1 truncate">{{ project.name }}</span>
            </button>
          } @empty {
            <p class="px-2.5 py-6 text-center text-sm text-muted-foreground">
              {{ 'projectSwitcher.empty' | transloco }}
            </p>
          }
        </div>

        <div class="border-t border-border p-1">
          <button
            type="button"
            data-testid="create-project"
            (click)="create()"
            class="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/10"
          >
            <hlm-icon name="lucidePlus" size="16px" />
            {{ 'projectSwitcher.createProject' | transloco }}
          </button>
        </div>
      </div>
    </ng-template>
  `,
})
export class ProjectSwitcher {
  protected readonly workspace = inject(WorkspaceStore);
  private readonly store = inject(AuthStore);
  private readonly router = inject(Router);

  /** The project currently open, or null in the org ("All Projects") context. */
  readonly currentProjectId = input<string | null>(null);

  protected readonly positions = BELOW_START;
  protected readonly open = signal(false);
  protected readonly query = signal('');

  protected readonly activeProject = computed(
    () => this.workspace.projects().find((p) => p.id === this.currentProjectId()) ?? null,
  );

  protected readonly filtered = computed(() => {
    const q = this.query().trim().toLowerCase();
    const projects = this.workspace.projects();
    return q ? projects.filter((p) => p.name.toLowerCase().includes(q)) : projects;
  });

  protected toggle(): void {
    this.open.update((v) => !v);
    if (this.open()) {
      this.query.set('');
      this.ensureProjectsLoaded();
    }
  }

  protected close(): void {
    this.open.set(false);
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') this.close();
  }

  protected select(project: ProjectResponse): void {
    this.close();
    void this.router.navigate(['/projects', project.id]);
  }

  protected create(): void {
    this.close();
    void this.router.navigate(['/projects']);
  }

  private ensureProjectsLoaded(): void {
    const orgId = this.store.organizationId();
    if (orgId && this.workspace.projectsState() !== 'ready') this.workspace.loadProjects(orgId);
  }
}
